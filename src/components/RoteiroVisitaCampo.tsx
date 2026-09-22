import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  MinusCircle,
  Pencil,
  Play,
  Satellite,
  Timer,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FUNCOES_ROTEIRO,
  PERGUNTAS,
  calcularConformidade,
  type FuncaoRoteiro,
  type PerguntaRoteiro,
  type RespostaValor,
} from "@/lib/roteiro-campo-perguntas";
import { obterPerguntasChecklist, podeEditarChecklist } from "@/lib/checklist-perguntas.functions";
import { EditorPerguntasChecklist } from "@/components/EditorPerguntasChecklist";
import {
  carimbarFoto,
  formatarCoordenadas,
  formatarDataHora,
  type FotoChecklist,
  type GeoCaptura,
} from "@/lib/foto-carimbo";
import {
  enviarRelatorioRoteiro,
  listarRoteirosVisita,
  postosProximosSupervisao,
  salvarRoteiroVisita,
} from "@/lib/roteiro-campo.functions";
import { gerarRelatorioRoteiroPdf } from "@/lib/roteiro-relatorio-pdf";
import { pesquisarPostosNexti, type PostoNexti } from "@/lib/nexti-ativos.functions";
import { meuVinculoGerente } from "@/lib/vinculo-gerente.functions";
import { normalizarNome } from "@/lib/gerentes-area-a";
import { supabase } from "@/integrations/supabase/client";
import { useSearch } from "@tanstack/react-router";
import { nomeDoUsuario, useSessao } from "@/hooks/use-sessao";
import { evolutionGoEnviarTexto } from "@/lib/evolution-go.functions";
import { notificarFimControl, notificarInicioControl } from "@/lib/control-notificacao.functions";

const OPCOES: { valor: RespostaValor; label: string; icon: typeof CheckCircle2; classe: string }[] =
  [
    {
      valor: "conforme",
      label: "Conforme",
      icon: CheckCircle2,
      classe: "bg-primary text-primary-foreground border-primary",
    },
    {
      valor: "nao_conforme",
      label: "Não conforme",
      icon: XCircle,
      classe: "bg-destructive text-destructive-foreground border-destructive",
    },
    {
      valor: "na",
      label: "N/A",
      icon: MinusCircle,
      classe: "bg-muted text-muted-foreground border-border",
    },
  ];

type BuscaProps<T> = {
  label: string;
  placeholder: string;
  value: T | null;
  display: (item: T) => string;
  itemKey: (item: T) => string;
  icon: typeof MapPin;
  onChange: (item: T | null) => void;
  search: (term: string) => Promise<T[]>;
};

function BuscaNexti<T>({
  label,
  placeholder,
  value,
  display,
  itemKey,
  icon: Icone,
  onChange,
  search,
}: BuscaProps<T>) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) return;
    const termo = term.trim();
    if (termo.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    let ativo = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const resultado = await search(termo);
        if (!ativo) return;
        setItems(resultado);
        setOpen(true);
      } catch (e) {
        if (ativo) {
          setItems([]);
          setOpen(true);
          toast.error(e instanceof Error ? e.message : "Não foi possível consultar a NEXTI.");
        }
      } finally {
        if (ativo) setLoading(false);
      }
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [term, value, search]);

  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Icone className="size-4 shrink-0 text-primary" /> {display(value)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setTerm("");
            }}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input value={term} placeholder={placeholder} onChange={(e) => setTerm(e.target.value)} />
          {loading ? (
            <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" />
          ) : null}
          {open && items.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
              {items.map((item) => (
                <li key={itemKey(item)}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left"
                    onClick={() => {
                      onChange(item);
                      setTerm("");
                      setOpen(false);
                    }}
                  >
                    <Icone className="size-4 shrink-0 text-primary" /> {display(item)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {open && !loading && items.length === 0 ? (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-lg">
              Nenhum resultado encontrado na NEXTI.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Converte segundos em um texto de cronômetro (hh:mm:ss ou mm:ss). */
function formatarDuracao(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

const RASCUNHO_KEY = "roteiro-visita-campo:rascunho";

type RascunhoRoteiro = {
  funcao: FuncaoRoteiro;
  dataVisita: string;
  postoNexti: PostoNexti | null;
  observacaoGeral: string;
  planoAcao: string;
  respostas: Record<string, RespostaValor>;
  observacoes: Record<string, string>;
  fotos: FotoChecklist[];
  iniciadoEm: number | null;
};

function lerRascunho(): RascunhoRoteiro | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(RASCUNHO_KEY);
    if (!bruto) return null;
    return JSON.parse(bruto) as RascunhoRoteiro;
  } catch {
    return null;
  }
}

export function RoteiroVisitaCampo() {
  const { user } = useSessao();
  const nomeAvaliador = nomeDoUsuario(user);

  const hoje = new Date().toISOString().slice(0, 10);
  // Restaura o rascunho salvo no aparelho para não perder nada se a página
  // recarregar ao voltar da câmera (o app é um PWA com service workers).
  const rascunhoInicial = useRef<RascunhoRoteiro | null>(lerRascunho());
  const [funcao, setFuncao] = useState<FuncaoRoteiro>(
    rascunhoInicial.current?.funcao ?? "AUXILIAR DE LIMPEZA",
  );
  const [dataVisita, setDataVisita] = useState(rascunhoInicial.current?.dataVisita ?? hoje);
  const [postoNexti, setPostoNexti] = useState<PostoNexti | null>(
    rascunhoInicial.current?.postoNexti ?? null,
  );
  const [observacaoGeral, setObservacaoGeral] = useState(
    rascunhoInicial.current?.observacaoGeral ?? "",
  );
  const [planoAcao, setPlanoAcao] = useState(rascunhoInicial.current?.planoAcao ?? "");
  const [respostas, setRespostas] = useState<Record<string, RespostaValor>>(
    rascunhoInicial.current?.respostas ?? {},
  );
  const [observacoes, setObservacoes] = useState<Record<string, string>>(
    rascunhoInicial.current?.observacoes ?? {},
  );
  const [perguntasBase, setPerguntasBase] = useState<PerguntaRoteiro[]>(PERGUNTAS);
  const [editandoPerguntas, setEditandoPerguntas] = useState(false);
  /** Momento em que o preenchimento do relatório começou (para medir o tempo de execução). */
  const inicioPreenchimento = useRef<number | null>(rascunhoInicial.current?.iniciadoEm ?? null);
  const [iniciadoEm, setIniciadoEm] = useState<number | null>(
    rascunhoInicial.current?.iniciadoEm ?? null,
  );
  const [agora, setAgora] = useState(() => Date.now());

  // Cronômetro visível enquanto o roteiro está sendo preenchido.
  useEffect(() => {
    if (iniciadoEm === null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iniciadoEm]);

  const [fotos, setFotos] = useState<FotoChecklist[]>(rascunhoInicial.current?.fotos ?? []);

  const segundosDecorridos =
    iniciadoEm === null ? 0 : Math.max(0, Math.round((agora - iniciadoEm) / 1000));
  const tempoFormatado = formatarDuracao(segundosDecorridos);

  // Salva o rascunho no aparelho sempre que algo muda. Assim a foto recém-tirada
  // já entra no relatório e, se a página recarregar ao voltar da câmera, o
  // preenchimento continua de onde parou em vez de voltar do zero.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vazio =
      Object.keys(respostas).length === 0 &&
      fotos.length === 0 &&
      !postoNexti &&
      !observacaoGeral &&
      !planoAcao &&
      iniciadoEm === null;
    try {
      if (vazio) {
        window.localStorage.removeItem(RASCUNHO_KEY);
        return;
      }
      const rascunho: RascunhoRoteiro = {
        funcao,
        dataVisita,
        postoNexti,
        observacaoGeral,
        planoAcao,
        respostas,
        observacoes,
        fotos,
        iniciadoEm,
      };
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(rascunho));
    } catch {
      // se o armazenamento estiver cheio, apenas não persiste o rascunho
    }
  }, [
    funcao,
    dataVisita,
    postoNexti,
    observacaoGeral,
    planoAcao,
    respostas,
    observacoes,
    fotos,
    iniciadoEm,
  ]);

  const enviarMensagemEvolution = useServerFn(evolutionGoEnviarTexto);
  const avisarInicioControl = useServerFn(notificarInicioControl);
  const avisarFimControl = useServerFn(notificarFimControl);

  /** Avisa no WhatsApp de notificação que um control foi iniciado. */
  function avisarControlIniciado(nomePosto: string, idPosto: number) {
    void (async () => {
      try {
        await avisarInicioControl({ data: { postoNome: nomePosto, postoId: idPosto } });
      } catch {
        // o aviso não pode atrapalhar o preenchimento
      }
    })();
  }

  function iniciarPreenchimento() {
    const inicio = Date.now();
    inicioPreenchimento.current = inicio;
    setIniciadoEm(inicio);
    setAgora(inicio);

    avisarControlIniciado(postoNexti?.nome ?? "", postoNexti?.id ?? 0);


    const numero = (window.localStorage.getItem("evolution-go-numero-notificacao") ?? "").replace(/\D/g, "");
    if (numero) {
      const textoChegada = `📍 Supervisor chegou ao posto.\nPosto: ${postoNexti?.nome ?? "Não informado"}\nInício: ${new Date(inicio).toLocaleString("pt-BR")}`;
      void (async () => {
        try {
          await enviarMensagemEvolution({ data: { numero, texto: textoChegada } });
        } catch {
          // não interrompe o preenchimento se a notificação falhar
        }
      })();
    }

    toast.success("Preenchimento iniciado — o tempo começou a contar.");
  }

  // Chegada automática ao posto: abre o roteiro já com o posto e o tempo contando.
  const busca = useSearch({ strict: false }) as {
    posto?: number;
    nome?: string;
    iniciar?: boolean;
  };
  const chegadaAplicada = useRef(false);
  useEffect(() => {
    if (chegadaAplicada.current) return;
    if (!busca?.nome) return;
    chegadaAplicada.current = true;
    setPostoNexti({ id: busca.posto ?? 0, nome: busca.nome, externalId: "" });
    if (busca.iniciar) {
      const inicio = Date.now();
      inicioPreenchimento.current = inicio;
      setIniciadoEm(inicio);
      setAgora(inicio);
      avisarControlIniciado(busca.nome, busca.posto ?? 0);
      toast.success(`Chegada em ${busca.nome} — preenchimento iniciado automaticamente.`);
    }
  }, [busca]);

  
  const [geo, setGeo] = useState<GeoCaptura>({
    latitude: null,
    longitude: null,
    precisao: null,
    status: "aguardando",
  });

  const carregarPerguntas = useServerFn(obterPerguntasChecklist);
  const verificarEdicao = useServerFn(podeEditarChecklist);
  const { data: permEdicao } = useQuery({
    queryKey: ["pode-editar-checklist"],
    queryFn: () => verificarEdicao(),
    staleTime: 60_000,
  });
  const podeEditar = permEdicao?.pode === true;

  useEffect(() => {
    let ativo = true;
    carregarPerguntas({})
      .then((r) => {
        if (ativo && r?.perguntas?.length) setPerguntasBase(r.perguntas);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [carregarPerguntas]);

  const aplicarPosicao = useCallback((pos: GeolocationPosition) => {
    setGeo((anterior) => {
      // Só atualiza quando houver deslocamento real (~25 m); evita que a lista
      // de postos próximos fique piscando a cada leitura do GPS.
      if (anterior.status === "ok" && anterior.latitude !== null && anterior.longitude !== null) {
        const dLat = (pos.coords.latitude - anterior.latitude) * 111_320;
        const dLon =
          (pos.coords.longitude - anterior.longitude) *
          111_320 *
          Math.cos((anterior.latitude * Math.PI) / 180);
        if (Math.sqrt(dLat * dLat + dLon * dLon) < 25) return anterior;
      }
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        precisao: pos.coords.accuracy,
        status: "ok",
      };
    });
  }, []);

  const tratarErroGeo = useCallback((err: GeolocationPositionError) => {
    setGeo({
      latitude: null,
      longitude: null,
      precisao: null,
      status: err.code === err.PERMISSION_DENIED ? "negada" : "indisponivel",
    });
  }, []);

  // Localização em tempo real enquanto a visita é preenchida.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ latitude: null, longitude: null, precisao: null, status: "indisponivel" });
      return;
    }
    const id = navigator.geolocation.watchPosition(aplicarPosicao, tratarErroGeo, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, [aplicarPosicao, tratarErroGeo]);

  // Permite tentar a localização de novo a partir de um clique do usuário
  // (necessário em navegadores que só liberam o pedido após interação).
  const solicitarLocalizacao = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ latitude: null, longitude: null, precisao: null, status: "indisponivel" });
      return;
    }
    setGeo((g) => ({ ...g, status: "aguardando" }));
    navigator.geolocation.getCurrentPosition(aplicarPosicao, tratarErroGeo, {
      enableHighAccuracy: true,
      timeout: 20000,
    });
  }, [aplicarPosicao, tratarErroGeo]);

  const perguntas = useMemo(
    () => perguntasBase.filter((p) => p.funcao === funcao),
    [perguntasBase, funcao],
  );
  const resumo = useMemo(() => calcularConformidade(perguntas, respostas), [perguntas, respostas]);

  const blocos = useMemo(() => {
    const mapa = new Map<string, typeof perguntas>();
    for (const p of perguntas) {
      const lista = mapa.get(p.bloco) ?? [];
      lista.push(p);
      mapa.set(p.bloco, lista);
    }
    return [...mapa.entries()];
  }, [perguntas]);

  const queryClient = useQueryClient();
  const listar = useServerFn(listarRoteirosVisita);
  const salvar = useServerFn(salvarRoteiroVisita);
  const enviarRelatorio = useServerFn(enviarRelatorioRoteiro);
  const buscarPostosFn = useServerFn(pesquisarPostosNexti);
  const buscarProximosFn = useServerFn(postosProximosSupervisao);
  const carregarVinculo = useServerFn(meuVinculoGerente);

  const { data: vinculo } = useQuery({
    queryKey: ["meu-vinculo-gerente"],
    queryFn: () => carregarVinculo(),
    staleTime: 60_000,
  });

  // Coordenadas arredondadas (~100 m) para a busca não refazer a cada leitura do GPS.
  const chaveLat = geo.latitude === null ? null : Math.round(geo.latitude * 1000) / 1000;
  const chaveLon = geo.longitude === null ? null : Math.round(geo.longitude * 1000) / 1000;

  const {
    data: proximos,
    error: erroProximos,
    isFetching: carregandoProximos,
    refetch: refetchProximos,
  } = useQuery({
    queryKey: ["postos-proximos", chaveLat, chaveLon],
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        return {
          ok: false,
          erro: "Sessão expirada. Entre novamente para ver os postos próximos.",
          postos: [],
        };
      }
      try {
        return await buscarProximosFn({
          data: { latitude: geo.latitude!, longitude: geo.longitude! },
        });
      } catch {
        return {
          ok: false,
          erro: "Não foi possível consultar os postos próximos agora.",
          postos: [],
        };
      }
    },
    enabled: geo.status === "ok" && geo.latitude !== null && geo.longitude !== null,
    staleTime: 60_000,
    retry: 1,
  });

  // Gerente de área: só pode visitar os postos vinculados à área dele.
  const postosPermitidos = useMemo(() => {
    if (!vinculo?.gerenteNome || vinculo.postos.length === 0) return null;
    return new Set(vinculo.postos.map((p) => normalizarNome(p.nome)));
  }, [vinculo]);

  const postosProximos = (proximos?.ok ? proximos.postos : []).filter(
    (p) => !postosPermitidos || postosPermitidos.has(normalizarNome(p.nome)),
  );
  const mensagemErroProximos =
    proximos && !proximos.ok
      ? proximos.erro || "Não foi possível carregar os postos próximos."
      : erroProximos
        ? "Falha de comunicação ao buscar os postos próximos."
        : "";

  const buscarPostos = useCallback(
    async (termo: string) => {
      const r = await buscarPostosFn({ data: { termo } });
      if (!r?.ok) throw new Error(r?.erro ?? "Não foi possível consultar os postos na NEXTI.");
      const lista = postosPermitidos
        ? r.postos.filter((p) => postosPermitidos.has(normalizarNome(p.nome)))
        : r.postos;
      return lista.slice(0, 25);
    },
    [buscarPostosFn, postosPermitidos],
  );

  const { data: historico } = useQuery({
    queryKey: ["roteiros-visita-campo"],
    queryFn: () => listar(),
  });

  const mutation = useMutation({
    mutationFn: async () =>
      salvar({
        data: {
          dataVisita,
          posto: postoNexti?.nome ?? "",
          postoNextiId: postoNexti?.id ?? null,
          postoExternalId: postoNexti?.externalId ?? "",
          cliente: "",
          empresa: "",
          funcao,
          colaborador: "",
          supervisor: nomeAvaliador,
          respostas,
          observacoes,
          totalConformes: resumo.conformes,
          totalNaoConformes: resumo.naoConformes,
          totalNaoAplicaveis: resumo.naoAplicaveis,
          criticasAbertas: resumo.criticasAbertas,
          percentualConformidade: resumo.percentual,
          observacaoGeral,
          planoAcao,
          duracaoSegundos:
            inicioPreenchimento.current === null
              ? null
              : Math.max(0, Math.round((Date.now() - inicioPreenchimento.current) / 1000)),
          numeroNotificacao:
            typeof window === "undefined"
              ? ""
              : window.localStorage.getItem("evolution-go-numero-notificacao") ?? "",
          fotos: fotos.map((f) => ({
            perguntaId: f.perguntaId,
            perguntaTexto: f.perguntaTexto,
            dataUrl: f.dataUrl,
            capturadaEm: f.capturadaEm,
            latitude: f.latitude,
            longitude: f.longitude,
            precisao: f.precisao,
            geoStatus: f.geoStatus,
            observacao: f.observacao,
          })),
        },
      }),
    onSuccess: async (resultado) => {
      toast.success("Roteiro de visita registrado.");
      void (async () => {
        try {
          await avisarFimControl({
            data: {
              postoNome: postoNexti?.nome ?? "",
              percentual: resumo.percentual,
              naoConformes: resumo.naoConformes,
              duracaoSegundos:
                inicioPreenchimento.current === null
                  ? null
                  : Math.max(0, Math.round((Date.now() - inicioPreenchimento.current) / 1000)),
            },
          });
        } catch {
          // o aviso não pode atrapalhar o envio do relatório
        }
      })();
      const roteiroId = (resultado as { id?: string } | undefined)?.id;
      if (roteiroId) {
        try {
          const agoraFim = Date.now();
          const duracaoSecs = inicioPreenchimento.current === null ? null : Math.max(0, Math.round((agoraFim - inicioPreenchimento.current) / 1000));
          
          let enderecoEscrito = "";
          if (geo.latitude && geo.longitude) {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${geo.latitude}&lon=${geo.longitude}`);
              if (res.ok) {
                const b = await res.json();
                enderecoEscrito = b.display_name || "";
              }
            } catch (e) {
               console.error("Falha ao obter endereço OSM", e);
            }
          }

          const pdfBase64 = gerarRelatorioRoteiroPdf({
            latitude: geo.latitude,
            longitude: geo.longitude,
            endereco: enderecoEscrito,
            dataVisita,
            posto: postoNexti?.nome ?? "",
            cliente: "",
            empresa: "",
            funcao,
            colaborador: "",
            supervisor: nomeAvaliador,
            perguntas,
            respostas,
            observacoes,
            observacaoGeral,
            planoAcao,
            resumo: {
              conformes: resumo.conformes,
              naoConformes: resumo.naoConformes,
              naoAplicaveis: resumo.naoAplicaveis,
              criticasAbertas: resumo.criticasAbertas,
              percentual: resumo.percentual,
            },
            fotos,
            iniciadoEm: inicioPreenchimento.current,
            finalizadoEm: agoraFim,
            duracaoSegundos: duracaoSecs,
          });
          const envio = await enviarRelatorio({ data: { roteiroId, pdfBase64 } });
          if (envio?.ok) toast.success("Relatório em PDF enviado para a Coordenação.");
          else toast.error(envio?.erro ?? "Não foi possível enviar o relatório à Coordenação.");
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Não foi possível gerar o relatório em PDF.",
          );
        }
      }
      setRespostas({});
      setObservacoes({});
      setFotos([]);
      setObservacaoGeral("");
      setPlanoAcao("");
      inicioPreenchimento.current = null;
      setIniciadoEm(null);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(RASCUNHO_KEY);
        } catch {
          // ignora falha ao limpar o rascunho
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["roteiros-visita-campo"] });
      void queryClient.invalidateQueries({ queryKey: ["indicadores-execucao"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o roteiro."),
  });

  // LÓGICA DE GEOFENCE AUTO (RAIO 900M)
  const refEstado = useRef({ iniciadoEm, respostas, fotos, mutation });
  useEffect(() => {
    refEstado.current = { iniciadoEm, respostas, fotos, mutation };
  }, [iniciadoEm, respostas, fotos, mutation]);

  const geoTracking = useRef({ postoId: null as number | null, estavaDentro: false });

  useEffect(() => {
    if (!postoNexti || !postosProximos || geo.status !== "ok") return;

    const infoPosto = postosProximos.find((p) => p.id === postoNexti.id);
    if (!infoPosto) return;

    const agoraDentro = infoPosto.distanciaKm <= 0.9;
    const pId = postoNexti.id;

    if (geoTracking.current.postoId !== pId) {
      geoTracking.current = { postoId: pId, estavaDentro: agoraDentro };
      if (agoraDentro && refEstado.current.iniciadoEm === null) {
        iniciarPreenchimento();
      }
      return;
    }

    if (agoraDentro && !geoTracking.current.estavaDentro) {
      geoTracking.current.estavaDentro = true;
      if (refEstado.current.iniciadoEm === null) {
        iniciarPreenchimento();
      }
    } else if (!agoraDentro && geoTracking.current.estavaDentro) {
      geoTracking.current.estavaDentro = false;
      if (refEstado.current.iniciadoEm !== null && !refEstado.current.mutation.isPending) {
        const temDados = Object.keys(refEstado.current.respostas).length > 0 || refEstado.current.fotos.length > 0;
        if (temDados) {
          toast.info("Você saiu do perímetro (900m). O relatório está sendo salvo automaticamente.");
          refEstado.current.mutation.mutate();
        }
      }
    }
  }, [postoNexti, postosProximos, geo.status]);

  async function capturarFoto(pergunta: PerguntaRoteiro, arquivo: File) {
    const capturadaEm = new Date().toISOString();
    try {
      const dataUrl = await carimbarFoto(arquivo, geo, capturadaEm, pergunta.texto.slice(0, 70));
      setFotos((atual) => [
        ...atual,
        {
          id: `${pergunta.id}-${Date.now()}`,
          perguntaId: pergunta.id,
          perguntaTexto: pergunta.texto,
          dataUrl,
          capturadaEm,
          latitude: geo.latitude,
          longitude: geo.longitude,
          precisao: geo.precisao,
          geoStatus: geo.status,
          observacao: "",
        },
      ]);
      toast.success("Foto registrada com data, hora e localização.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a foto.");
    }
  }

  function responder(id: string, valor: RespostaValor) {
    setRespostas((atual) => ({ ...atual, [id]: valor }));
  }

  function enviar() {
    if (iniciadoEm === null) {
      toast.error("Clique em “Iniciar preenchimento” antes de salvar o roteiro.");
      return;
    }
    if (!postoNexti) {
      toast.error("Selecione o posto da NEXTI visitado.");
      return;
    }
    if (resumo.avaliadas + resumo.naoAplicaveis === 0) {
      toast.error("Responda ao menos um item do roteiro.");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-11 items-center justify-center rounded-full ${
              iniciadoEm === null
                ? "bg-primary/15 text-primary"
                : "bg-emerald-500/15 text-emerald-500"
            }`}
          >
            {iniciadoEm === null ? <Play className="size-5" /> : <Timer className="size-5" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {iniciadoEm === null ? "Preenchimento não iniciado" : "Preenchimento em andamento"}
            </p>
            <p className="text-xs text-muted-foreground">
              {iniciadoEm === null
                ? "Toque em iniciar para começar a contagem do tempo da tarefa."
                : `Iniciado às ${new Date(iniciadoEm).toLocaleTimeString("pt-BR")} — o tempo é registrado ao salvar o roteiro.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-lg border border-border px-4 py-2 font-mono text-xl font-bold tabular-nums ${
              iniciadoEm === null ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {tempoFormatado}
          </span>
          <Button
            type="button"
            onClick={iniciarPreenchimento}
            variant={iniciadoEm === null ? "default" : "outline"}
          >
            <Play className="size-4" />
            {iniciadoEm === null ? "Iniciar preenchimento" : "Reiniciar contagem"}
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex flex-wrap gap-2">
          {FUNCOES_ROTEIRO.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFuncao(f)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                funcao === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rvc-data">Data da visita</Label>
            <Input
              id="rvc-data"
              type="date"
              value={dataVisita}
              onChange={(e) => setDataVisita(e.target.value)}
            />
          </div>
          <BuscaNexti
            label="Posto da NEXTI"
            placeholder="Pesquise o posto pelo nome"
            value={postoNexti}
            display={(p) => (p.externalId ? `${p.nome} (${p.externalId})` : p.nome)}
            itemKey={(p) => String(p.id)}
            icon={MapPin}
            onChange={setPostoNexti}
            search={buscarPostos}
          />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <MapPin className="size-4 text-primary" />
            Postos próximos a você
          </p>
          {geo.status !== "ok" ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                {geo.status === "aguardando"
                  ? "Obtendo sua localização para listar os postos próximos..."
                  : "Ative a permissão de localização para ver os postos próximos, ou pesquise o posto acima."}
              </p>
              {geo.status !== "aguardando" ? (
                <Button type="button" variant="outline" size="sm" onClick={solicitarLocalizacao}>
                  <MapPin className="size-4" /> Ativar localização
                </Button>
              ) : null}
            </div>
          ) : carregandoProximos && !proximos ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Buscando os postos mais próximos...
            </p>
          ) : mensagemErroProximos ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-destructive">{mensagemErroProximos}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetchProximos()}>
                Tentar novamente
              </Button>
            </div>
          ) : postosProximos.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum posto com localização cadastrada foi encontrado. Pesquise o posto acima.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {postosProximos.map((p) => {
                const selecionado = postoNexti?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPostoNexti({ id: p.id, nome: p.nome, externalId: p.externalId })
                    }
                    className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                      selecionado
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <span className="block font-semibold">{p.nome}</span>
                    <span
                      className={
                        selecionado ? "text-primary-foreground/80" : "text-muted-foreground"
                      }
                    >
                      {p.distanciaKm < 1
                        ? `${Math.round(p.distanciaKm * 1000)} m de você`
                        : `${p.distanciaKm.toFixed(1)} km de você`}
                      {p.cidade ? ` · ${p.cidade}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {postoNexti ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Posto selecionado:{" "}
              <span className="font-semibold text-foreground">{postoNexti.nome}</span> — responda o
              questionário abaixo.
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Resumo titulo="Conformidade" valor={`${resumo.percentual}%`} />
          <Resumo titulo="Conformes" valor={String(resumo.conformes)} />
          <Resumo
            titulo="Não conformes"
            valor={String(resumo.naoConformes)}
            destaque={resumo.naoConformes > 0}
          />
          <Resumo
            titulo="Pontos críticos"
            valor={String(resumo.criticasAbertas)}
            destaque={resumo.criticasAbertas > 0}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Satellite
              className={`size-4 ${geo.status === "ok" ? "text-primary" : "text-muted-foreground"}`}
            />
            {geo.status === "ok"
              ? `Localização em tempo real: ${formatarCoordenadas(geo)}`
              : geo.status === "aguardando"
                ? "Obtendo a localização do aparelho..."
                : geo.status === "negada"
                  ? "Permissão de localização negada — as fotos serão salvas sem coordenadas."
                  : "Localização indisponível neste aparelho."}
          </span>
          {podeEditar ? (
            <Button
              type="button"
              size="sm"
              variant={editandoPerguntas ? "default" : "secondary"}
              onClick={() => setEditandoPerguntas((v) => !v)}
            >
              <Pencil className="mr-2 size-4" />
              {editandoPerguntas ? "Fechar edição" : "Editar perguntas"}
            </Button>
          ) : null}
        </div>
      </div>

      {editandoPerguntas && podeEditar ? (
        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
            Editar perguntas do checklist
          </h2>
          <EditorPerguntasChecklist
            perguntas={perguntasBase}
            funcaoPadrao={funcao}
            onSalvo={(novas) => {
              setPerguntasBase(novas);
              setEditandoPerguntas(false);
            }}
            onCancelar={() => setEditandoPerguntas(false)}
          />
        </div>
      ) : null}

      {blocos.map(([bloco, itens]) => (
        <div key={bloco} className="panel p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{bloco}</h2>
          <div className="mt-4 space-y-4">
            {itens.map((p, indice) => (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-2xl text-sm font-medium text-foreground">
                    {indice + 1}. {p.texto}
                    {p.critica ? (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                        crítico
                      </span>
                    ) : null}
                  </p>
                  <div className="flex gap-2">
                    {OPCOES.map((o) => {
                      const ativo = respostas[p.id] === o.valor;
                      const Icone = o.icon;
                      return (
                        <button
                          key={o.valor}
                          type="button"
                          onClick={() => responder(p.id, o.valor)}
                          aria-pressed={ativo}
                          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            ativo
                              ? o.classe
                              : "border-border bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icone className="size-3.5" /> {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {respostas[p.id] === "nao_conforme" ? (
                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="Descreva a não conformidade e a ação imediata adotada"
                    value={observacoes[p.id] ?? ""}
                    onChange={(e) =>
                      setObservacoes((atual) => ({ ...atual, [p.id]: e.target.value }))
                    }
                  />
                ) : null}

                <div className="mt-3 space-y-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <Camera className="size-3.5" /> Tirar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = "";
                        if (arquivo) void capturarFoto(p, arquivo);
                      }}
                    />
                  </label>

                  {fotos.filter((f) => f.perguntaId === p.id).length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {fotos
                        .filter((f) => f.perguntaId === p.id)
                        .map((f) => (
                          <figure
                            key={f.id}
                            className="overflow-hidden rounded-lg border border-border"
                          >
                            <img
                              src={f.dataUrl}
                              alt={`Foto de ${p.texto}`}
                              className="h-36 w-full object-cover"
                            />
                            <figcaption className="space-y-1 p-2 text-[11px] text-muted-foreground">
                              <p>{formatarDataHora(f.capturadaEm)}</p>
                              <p>{formatarCoordenadas(f)}</p>
                              <div className="flex items-center gap-2">
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Legenda"
                                  value={f.observacao}
                                  onChange={(e) =>
                                    setFotos((atual) =>
                                      atual.map((x) =>
                                        x.id === f.id ? { ...x, observacao: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    setFotos((atual) => atual.filter((x) => x.id !== f.id))
                                  }
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </div>
                            </figcaption>
                          </figure>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="panel p-5 space-y-4">
        <div>
          <Label htmlFor="rvc-obs">Observações gerais da visita</Label>
          <Textarea
            id="rvc-obs"
            rows={3}
            value={observacaoGeral}
            onChange={(e) => setObservacaoGeral(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rvc-plano">Plano de ação / prazos</Label>
          <Textarea
            id="rvc-plano"
            rows={3}
            value={planoAcao}
            onChange={(e) => setPlanoAcao(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={enviar} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ClipboardList className="mr-2 size-4" />
            )}
            Salvar roteiro
          </Button>
          <span className="text-xs text-muted-foreground">
            {resumo.pendentes} item(ns) sem resposta de {perguntas.length} · {fotos.length} foto(s)
            anexada(s).
          </span>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Visitas registradas
        </h2>
        {historico?.roteiros?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Posto</th>
                  <th className="py-2 pr-4">Função</th>
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">Conformidade</th>
                  <th className="py-2 pr-4">Não conformes</th>
                </tr>
              </thead>
              <tbody>
                {historico.roteiros.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-4">{r.data_visita?.split("-").reverse().join("/")}</td>
                    <td className="py-2 pr-4">{r.posto}</td>
                    <td className="py-2 pr-4">{r.funcao}</td>
                    <td className="py-2 pr-4">{r.colaborador || "—"}</td>
                    <td className="py-2 pr-4 font-semibold">{r.percentual_conformidade}%</td>
                    <td className="py-2 pr-4">{r.total_nao_conformes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum roteiro registrado ainda.</p>
        )}
      </div>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${destaque ? "text-destructive" : "text-foreground"}`}>
        {valor}
      </p>
    </div>
  );
}
