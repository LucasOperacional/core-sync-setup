import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Wifi, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { registrarLocalizacao } from "@/lib/rastreamento.functions";
import { supabase } from "@/integrations/supabase/client";
import { appInstalado, observarAppInstalado } from "@/lib/app-instalado";
import { drenar, enfileirar, pendentes, type PosicaoGps } from "@/lib/gps-fila";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  meuTelefoneAviso,
  salvarTelefoneAviso,
  verificarChegadaPosto,
} from "@/lib/chegada-posto.functions";
import { avisarNoCelular, pedirPermissaoAviso } from "@/lib/aviso-chegada";

const BEM_VINDO_KEY = "bem_vindo_visto_em";
/** Intervalo do batimento que mantém o envio mesmo em segundo plano. */
const INTERVALO_MS = 25_000;
/** Sem posição nova por este tempo, reenvia a última conhecida (não perde sinal). */
const REENVIO_ULTIMA_MS = 45_000;

function hojeBrasilia(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function jaViuBemVindoHoje(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BEM_VINDO_KEY) === hojeBrasilia();
}

function marcarBemVindoVisto(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BEM_VINDO_KEY, hojeBrasilia());
  }
}

type Conexao = { effectiveType?: string; type?: string };

function conexaoAtual(): Conexao | null {
  return (navigator as Navigator & { connection?: Conexao }).connection ?? null;
}

function tipoSinal(): string | null {
  const conexao = conexaoAtual();
  return conexao?.effectiveType ?? conexao?.type ?? null;
}

/** Rótulo amigável da rede atual: Wi-Fi, 4G/5G, 3G etc. */
function rotuloRede(): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sem internet";
  const conexao = conexaoAtual();
  if (conexao?.type === "wifi") return "Wi-Fi";
  const tipo = conexao?.effectiveType ?? conexao?.type;
  if (tipo === "4g") return "4G/5G";
  if (tipo === "3g") return "3G";
  if (tipo === "2g" || tipo === "slow-2g") return "2G";
  return "Online";
}

async function nivelBateria(): Promise<number | null> {
  const api = (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> })
    .getBattery;
  if (!api) return null;
  try {
    const bateria = await api.call(navigator);
    return Math.round(bateria.level * 100);
  } catch {
    return null;
  }
}

interface EstadoRastreio {
  ativo: boolean;
  ultimo: string | null;
  erro: string | null;
  rede: string;
}

/* Estado compartilhado: o rastreio roda uma única vez no app, mesmo que o card
 * apareça em mais de uma página (as outras cópias apenas espelham o estado). */
let estadoGlobal: EstadoRastreio = { ativo: false, ultimo: null, erro: null, rede: "Online" };
const ouvintes = new Set<(e: EstadoRastreio) => void>();
/* Todas as cópias montadas concorrem; se a que envia sair da tela, outra assume
 * imediatamente — assim o sinal nunca para ao trocar de página. */
const candidatos = new Set<object>();
let lider: object | null = null;
const ouvintesLider = new Set<() => void>();

function eleger(): void {
  if (lider && candidatos.has(lider)) return;
  lider = candidatos.values().next().value ?? null;
  for (const f of ouvintesLider) f();
}

function publicar(parcial: Partial<EstadoRastreio>): void {
  estadoGlobal = { ...estadoGlobal, ...parcial };
  for (const f of ouvintes) f(estadoGlobal);
}

/**
 * Card do celular do supervisor: o envio da posição é sempre automático,
 * sem botão para desligar. O sinal continua saindo com a tela ligada e,
 * em segundo plano ou com o app fechado, o service worker reenvia a
 * última posição conhecida.
 */
export function CompartilharLocalizacaoCard() {
  const registrar = useServerFn(registrarLocalizacao);
  const [estado, setEstado] = useState<EstadoRastreio>(estadoGlobal);
  const [souLider, setSouLider] = useState(false);
  const idRef = useRef<object>({});
  const { ativo, ultimo, erro, rede } = estado;
  const setAtivo = (v: boolean) => publicar({ ativo: v });
  const setUltimo = (v: string | null) => publicar({ ultimo: v });
  const setErro = (v: string | null) => publicar({ erro: v });
  const setRede = (v: string) => publicar({ rede: v });
  const [ehSupervisor, setEhSupervisor] = useState<boolean | null>(null);
  // Regra: com o aplicativo instalado no aparelho, o GPS fica travado e ligado.
  const [instalado, setInstalado] = useState<boolean>(() => appInstalado());
  const watchRef = useRef<number | null>(null);
  const enviandoRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const ultimaPosRef = useRef<GeolocationPosition | null>(null);
  const ultimoEnvioOkRef = useRef<number>(0);
  const [fila, setFila] = useState<number>(0);
  const [atualizando, setAtualizando] = useState(false);
  /** Envio em segundo plano ativo (funciona fora do site). */
  const [segundoPlano, setSegundoPlano] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verificarChegada = useServerFn(verificarChegadaPosto);
  const lerTelefone = useServerFn(meuTelefoneAviso);
  const gravarTelefone = useServerFn(salvarTelefoneAviso);
  /** Última verificação de chegada (no máximo uma a cada 90 segundos). */
  const ultimaChegadaRef = useRef(0);
  const [telefone, setTelefone] = useState("");
  const [telefoneCarregado, setTelefoneCarregado] = useState(false);
  const gpsTravado = instalado || ehSupervisor === true;

  // Telefone que recebe o aviso de chegada no WhatsApp.
  const { data: telefoneSalvo } = useQuery({
    queryKey: ["telefone-aviso"],
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) return { telefone: "" };
      return await lerTelefone();
    },
    staleTime: 300_000,
  });

  useEffect(() => {
    if (telefoneSalvo && !telefoneCarregado) {
      setTelefone(telefoneSalvo.telefone);
      setTelefoneCarregado(true);
    }
  }, [telefoneSalvo, telefoneCarregado]);

  const salvandoTelefone = useMutation({
    mutationFn: async () => await gravarTelefone({ data: { telefone } }),
    onSuccess: (r) => {
      if (r?.ok) {
        toast.success("Telefone salvo — os avisos de chegada vão para este WhatsApp.");
        void queryClient.invalidateQueries({ queryKey: ["telefone-aviso"] });
      } else {
        toast.error(r?.erro ?? "Não foi possível salvar o telefone.");
      }
    },
    onError: () => toast.error("Não foi possível salvar o telefone."),
  });

  // Pede a permissão de aviso no celular assim que o card aparece.
  useEffect(() => {
    void pedirPermissaoAviso();
  }, []);

  // Trava do aplicativo instalado: assim que instalado, não há como desligar.
  useEffect(() => observarAppInstalado(setInstalado), []);

  // Elege a cópia responsável pelo envio; se ela sair da tela, outra assume.
  useEffect(() => {
    const meuId = idRef.current;
    candidatos.add(meuId);
    const ouvirLider = () => setSouLider(lider === meuId);
    ouvintesLider.add(ouvirLider);
    const ouvir = (e: EstadoRastreio) => setEstado(e);
    ouvintes.add(ouvir);
    eleger();
    setSouLider(lider === meuId);
    publicar({ rede: rotuloRede() });
    return () => {
      ouvintes.delete(ouvir);
      ouvintesLider.delete(ouvirLider);
      candidatos.delete(meuId);
      eleger();
    };
  }, []);

  // Ao perder a liderança, encerra o watch desta cópia (evita envios duplicados).
  useEffect(() => {
    if (souLider) return;
    if (watchRef.current !== null) {
      navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, [souLider]);

  // Regra: o rastreio só funciona para quem tem o papel de Supervisor.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const { data: sessao } = await supabase.auth.getUser();
      const uid = sessao.user?.id;
      if (!uid) {
        if (!cancelado) setEhSupervisor(false);
        return;
      }
      const { data } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "supervisor",
      });
      if (!cancelado) setEhSupervisor(data === true);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Entrega a última posição + token ao service worker, que continua o envio
  // quando o site sai do primeiro plano ou é fechado.
  const avisarServiceWorker = useCallback(async (pos: GeolocationPosition) => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registro = await navigator.serviceWorker.ready;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !registro.active) return;
      registro.active.postMessage({
        tipo: "gps-posicao",
        estado: {
          token,
          // Permite ao segundo plano renovar o acesso sozinho quando o app
          // fica horas fechado, sem perder o envio do sinal.
          refreshToken: data.session?.refresh_token ?? null,
          supabaseUrl: import.meta.env["VITE_SUPABASE_URL"] ?? null,
          apiKey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? null,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisaoMetros: pos.coords.accuracy ?? null,
          velocidade: pos.coords.speed ?? null,
          direcao: pos.coords.heading ?? null,
          tipoSinal: tipoSinal(),
        },
      });
      // Pede ao navegador para acordar o worker quando a rede voltar.
      const sync = (
        registro as ServiceWorkerRegistration & {
          sync?: { register: (t: string) => Promise<void> };
        }
      ).sync;
      await sync?.register("gps-ping").catch(() => undefined);
      setSegundoPlano(true);
    } catch {
      /* segue com o envio direto */
    }
  }, []);

  /**
   * Regra automática: a cada posição enviada, confere se o supervisor está a
   * menos de 200 m de um posto dele. Estando, avisa no celular e no WhatsApp e
   * abre a Supervisão de Campo já com o posto e o cronômetro iniciados.
   */
  const checarChegada = useCallback(
    async (p: PosicaoGps) => {
      if (Date.now() - ultimaChegadaRef.current < 90_000) return;
      ultimaChegadaRef.current = Date.now();
      try {
        const r = await verificarChegada({
          data: { latitude: p.latitude, longitude: p.longitude },
        });
        if (!r?.chegou || !r.posto) return;
        await avisarNoCelular(`Você chegou ao posto ${r.posto.nome}`, r.mensagem);
        toast.success(`Chegada no posto ${r.posto.nome} — abrindo a Supervisão de Campo.`);
        void navigate({
          to: "/supervisor-campo",
          search: {
            posto: r.posto.id ?? undefined,
            nome: r.posto.nome,
            iniciar: true,
          },
        });
      } catch {
        /* sem sessão ou sem internet: tenta de novo na próxima posição */
      }
    },
    [verificarChegada, navigate],
  );

  const enviarPosicao = useCallback(
    async (p: PosicaoGps) => {
      // Sem sessão ativa (tela de login, sessão expirada) o envio é ignorado:
      // o servidor recusaria a chamada e a tela quebraria.
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) return;
      await registrar({ data: p });
      void checarChegada(p);
    },
    [registrar, checarChegada],
  );

  const enviar = useCallback(
    async (pos: GeolocationPosition, capturadoEm?: string) => {
      // Guarda sempre a posição mais recente, mesmo se um envio já estiver em curso.
      ultimaPosRef.current = pos;
      if (enviandoRef.current) return;
      enviandoRef.current = true;

      const posicao: PosicaoGps = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        precisaoMetros: pos.coords.accuracy ?? null,
        velocidade: pos.coords.speed ?? null,
        direcao: pos.coords.heading ?? null,
        tipoSinal: tipoSinal(),
        bateria: await nivelBateria(),
        capturadoEm: capturadoEm ?? new Date().toISOString(),
      };
      try {
        // Primeiro escoa o que ficou guardado, mantendo a ordem do trajeto.
        await drenar(enviarPosicao);
        await enviarPosicao(posicao);
        ultimoEnvioOkRef.current = Date.now();
        setUltimo(new Date().toLocaleTimeString("pt-BR"));
        setErro(null);
        setFila(pendentes());
      } catch (e) {
        // Regra: o sinal nunca é perdido — guarda e reenvia depois.
        enfileirar(posicao);
        setFila(pendentes());
        setErro(
          e instanceof Error && /supervisor|permiss/i.test(e.message)
            ? e.message
            : "Sem conexão agora — a posição foi guardada e será enviada automaticamente.",
        );
      } finally {
        enviandoRef.current = false;
      }
      void avisarServiceWorker(pos);
    },
    [enviarPosicao, avisarServiceWorker],
  );

  const pedirWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (tipo: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const iniciar = useCallback(() => {
    if (watchRef.current !== null) return;
    if (!("geolocation" in navigator)) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => void enviar(pos),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          // Sem permissão não há como continuar: encerra o watch de verdade.
          if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
          watchRef.current = null;
          setAtivo(false);
          setErro(
            "Permita o acesso à localização nas configurações do aparelho para o rastreio funcionar.",
          );
          return;
        }
        // Falha momentânea (sinal fraco / tempo esgotado): o watch continua vivo
        // e o batimento reenvia a última posição, sem derrubar o rastreio.
        setErro("Sinal de GPS instável — continuando a tentar automaticamente.");
        const ultima = ultimaPosRef.current;
        if (ultima && Date.now() - ultimoEnvioOkRef.current >= REENVIO_ULTIMA_MS) {
          void enviar(ultima);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    setAtivo(true);
    void pedirWakeLock();
    if (!jaViuBemVindoHoje()) {
      toast.success("Seja bem vindo vamos trabalhar !");
      marcarBemVindoVisto();
    }
  }, [enviar, pedirWakeLock]);

  const atualizarAgora = useCallback(async () => {
    if (!souLider) return;
    if (watchRef.current === null) iniciar();
    setAtualizando(true);
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            void enviar(pos);
            resolve();
          },
          (err) => reject(err),
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
        );
      });
    } catch {
      setErro("Não foi possível atualizar a posição agora. O envio automático continua tentando.");
    } finally {
      window.setTimeout(() => setAtualizando(false), 700);
    }
  }, [souLider, iniciar, enviar]);

  // Registra o service worker do rastreio e pede o sincronismo periódico,
  // que permite o envio em segundo plano sem o app aberto.
  useEffect(() => {
    if (!souLider || !gpsTravado || !("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        const registro = await navigator.serviceWorker.register("/gps-sw.js", { scope: "/" });
        const periodico = (
          registro as ServiceWorkerRegistration & {
            periodicSync?: { register: (t: string, o: { minInterval: number }) => Promise<void> };
          }
        ).periodicSync;
        await periodico?.register("gps-ping", { minInterval: 60_000 }).catch(() => undefined);
        // Pede a permissão do sincronismo em segundo plano (Android/Chrome).
        try {
          await navigator.permissions?.query({
            name: "periodic-background-sync" as PermissionName,
          });
        } catch {
          /* navegador sem esta permissão */
        }
        setSegundoPlano(true);
      } catch {
        /* aparelho sem suporte: segue com o envio em primeiro plano */
      }
    })();
  }, [gpsTravado, souLider]);

  /**
   * Ao sair do site, fechar a aba ou minimizar, manda a última posição direto
   * pelo endpoint público (sendBeacon) e acorda o service worker: o sinal
   * continua saindo mesmo fora do site.
   */
  useEffect(() => {
    if (!souLider || !gpsTravado) return;

    const aoSair = () => {
      const pos = ultimaPosRef.current;
      if (!pos) return;
      void (async () => {
        try {
          await avisarServiceWorker(pos);
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const corpo = JSON.stringify({
            token,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            precisaoMetros: pos.coords.accuracy ?? null,
            velocidade: pos.coords.speed ?? null,
            direcao: pos.coords.heading ?? null,
            tipoSinal: tipoSinal(),
            capturadoEm: new Date().toISOString(),
          });
          navigator.sendBeacon?.(
            "/api/public/rastreio-ping",
            new Blob([corpo], { type: "application/json" }),
          );
        } catch {
          /* sem sessão ou sem rede: o worker reenvia depois */
        }
      })();
    };

    const aoEsconder = () => {
      if (document.visibilityState === "hidden") aoSair();
    };

    window.addEventListener("pagehide", aoSair);
    window.addEventListener("beforeunload", aoSair);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", aoSair);
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [souLider, gpsTravado, avisarServiceWorker]);


  // Regra: liga sozinho e permanece ligado — não há opção de desligar.
  useEffect(() => {
    if (!souLider || !gpsTravado) return;
    iniciar();
    const relogio = window.setInterval(() => {
      void pedirWakeLock();
      if (watchRef.current === null) iniciar();
      // Escoa posições guardadas quando a rede volta.
      void drenar(enviarPosicao).then(setFila);
      // Batimento: garante envio contínuo mesmo com a aba em segundo plano.
      navigator.geolocation?.getCurrentPosition(
        (pos) => void enviar(pos),
        () => {
          // GPS calado: reenvia a última posição conhecida para o rastreio
          // em tempo real nunca ficar sem sinal.
          const ultima = ultimaPosRef.current;
          if (!ultima) return;
          if (Date.now() - ultimoEnvioOkRef.current < REENVIO_ULTIMA_MS) return;
          void enviar(ultima);
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
      );
    }, INTERVALO_MS);
    return () => window.clearInterval(relogio);
  }, [gpsTravado, souLider, iniciar, enviar, enviarPosicao, pedirWakeLock]);

  // Regra: qualquer interação com o celular manda o sinal na hora, mesmo que o
  // site esteja fora de foco ou tenha acabado de ser reaberto.
  useEffect(() => {
    if (!souLider || !gpsTravado) return;
    let ultimoEnvio = 0;

    const enviarAgora = () => {
      if (watchRef.current === null) iniciar();
      const agora = Date.now();
      if (agora - ultimoEnvio < 4000) return; // evita rajada de envios
      ultimoEnvio = agora;
      navigator.geolocation?.getCurrentPosition(
        (pos) => void enviar(pos),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
    };

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      void pedirWakeLock();
      enviarAgora();
    };
    const aoMexer = () => enviarAgora();
    const aoConectar = () => {
      setRede(rotuloRede());
      if (navigator.onLine) {
        void drenar(enviarPosicao).then(setFila);
        enviarAgora();
      }
    };

    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener("pageshow", aoVoltar);
    window.addEventListener("pointerdown", aoMexer);
    window.addEventListener("touchstart", aoMexer, { passive: true });
    window.addEventListener("keydown", aoMexer);
    window.addEventListener("scroll", aoMexer, { passive: true });
    // Movimento físico do aparelho: o supervisor "mexeu no celular".
    window.addEventListener("devicemotion", aoMexer);
    window.addEventListener("deviceorientation", aoMexer);
    window.addEventListener("online", aoConectar);
    window.addEventListener("offline", aoConectar);
    const conexao = conexaoAtual() as
      | (Conexao & {
          addEventListener?: (t: string, f: () => void) => void;
          removeEventListener?: (t: string, f: () => void) => void;
        })
      | null;
    conexao?.addEventListener?.("change", aoConectar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener("pageshow", aoVoltar);
      window.removeEventListener("pointerdown", aoMexer);
      window.removeEventListener("touchstart", aoMexer);
      window.removeEventListener("keydown", aoMexer);
      window.removeEventListener("scroll", aoMexer);
      window.removeEventListener("devicemotion", aoMexer);
      window.removeEventListener("deviceorientation", aoMexer);
      window.removeEventListener("online", aoConectar);
      window.removeEventListener("offline", aoConectar);
      conexao?.removeEventListener?.("change", aoConectar);
    };
  }, [gpsTravado, souLider, iniciar, enviar, enviarPosicao, pedirWakeLock]);

  // Qualquer outro papel não vê nem usa o rastreio.
  if (!ehSupervisor && !instalado) return null;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold uppercase">
            <MapPin className="size-5 text-primary" />
            Compartilhar minha localização
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O envio é automático e permanente: a posição sai pelo GPS com a rede 4G/5G ou Wi-Fi,
            continua com a tela ligada e segue em segundo plano mesmo sem o app aberto. Com o
            aplicativo instalado neste aparelho, o GPS fica travado e não pode ser desligado.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              ativo
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border border-border bg-muted text-muted-foreground"
            }`}
          >
            {ativo ? (instalado ? "GPS travado · enviando" : "Enviando") : "Ligando o GPS…"}
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Wifi className="size-3" />
            {rede}
          </span>
          <button
            type="button"
            onClick={() => void atualizarAgora()}
            disabled={atualizando || !ativo}
            title="Atualizar sinal do usuário agora"
            className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RotateCw className={`size-3 ${atualizando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
        <label
          htmlFor="telefone-aviso"
          className="text-xs font-semibold uppercase text-muted-foreground"
        >
          WhatsApp para aviso de chegada ao posto
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Ao chegar a menos de 200 metros de um posto da sua área, você recebe o aviso no celular e
          no WhatsApp, e a Supervisão de Campo abre sozinha com o tempo já contando.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="telefone-aviso"
            type="tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(00) 00000-0000"
            className="h-9 flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => salvandoTelefone.mutate()}
            disabled={salvandoTelefone.isPending}
            className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {salvandoTelefone.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {ultimo ? (
        <p className="mt-4 text-xs text-muted-foreground">Última posição enviada às {ultimo}</p>
      ) : null}

      {fila > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-600">
          {fila} posição(ões) guardada(s) no aparelho — serão enviadas automaticamente quando a
          internet voltar.
        </p>
      ) : null}

      {erro ? <p className="mt-3 text-xs font-medium text-destructive">{erro}</p> : null}
    </section>
  );
}
