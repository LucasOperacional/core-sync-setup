import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Eye, Loader2, Navigation, RefreshCw, Satellite } from "lucide-react";
import { Button } from "@/components/ui/button";
import { corDoUsuario } from "@/lib/cores-rastreio";
import { listarLocalizacoesAtuais, type PosicaoRastreio } from "@/lib/rastreamento.functions";
import {
  filtrarEmpresasPermitidas,
  listarPostosMapa,
  ocultarNoMapa,
  type PostoMapa,
} from "@/lib/nexti-postos-mapa.functions";

const RastreioMapa = lazy(() => import("@/components/RastreioMapa"));

function minutosAtras(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m === 0) return "agora";
  if (m < 60) return `${m} min atrás`;
  return `${Math.floor(m / 60)}h atrás`;
}

/** Monitoramento em tempo real das posições enviadas pelos celulares. */
export function RastreioSupervisoresCard() {
  const listar = useServerFn(listarLocalizacoesAtuais);
  const [posicoes, setPosicoes] = useState<PosicaoRastreio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const listarPostos = useServerFn(listarPostosMapa);
  const [postos, setPostos] = useState<PostoMapa[]>([]);
  const [mostrarPostos, setMostrarPostos] = useState(true);
  const mapaRef = useRef<HTMLDivElement | null>(null);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      setPosicoes(await listar());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as localizações.");
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void (async () => {
      try {
        setPostos(await listarPostos());
      } catch {
        setPostos([]);
      }
    })();
  }, [listarPostos]);

  const postosNoMapa = useMemo(
    () =>
      mostrarPostos
        ? filtrarEmpresasPermitidas(postos).filter(
            (p) => p.latitude !== null && p.longitude !== null && !ocultarNoMapa(p),
          )
        : [],
    [postos, mostrarPostos],
  );

  /** Leva direto à localização da pessoa: centraliza o mapa e rola até ele. */
  const irPara = useCallback((userId: string) => {
    setFoco(null);
    window.setTimeout(() => setFoco(userId), 0);
    mapaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /** Atualiza o sinal de um supervisor específico direto do painel. */
  const atualizarPessoa = useCallback(
    async (userId: string) => {
      setAtualizandoId(userId);
      try {
        await buscar();
        irPara(userId);
      } finally {
        setAtualizandoId(null);
      }
    },
    [buscar, irPara],
  );

  useEffect(() => {
    void buscar();
    const intervalo = setInterval(() => void buscar(), 20_000);
    return () => clearInterval(intervalo);
  }, [buscar]);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold uppercase">
            <Satellite className="size-5 text-primary" />
            Rastreio em tempo real
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Posição enviada pelo celular do supervisor (GPS + rede 4G/5G), atualizada
            automaticamente a cada 20 segundos. Os postos de serviço da NEXTI aparecem no mesmo mapa
            em amarelo — postos noturnos ativos ficam ocultos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600">
            {posicoes.length} em monitoramento
          </span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
            {postosNoMapa.length} posto(s) no mapa
          </span>
          <Button
            variant={mostrarPostos ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setMostrarPostos((v) => !v)}
          >
            <Building2 className="size-4" /> {mostrarPostos ? "Ocultar postos" : "Mostrar postos"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void buscar()}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
      </div>

      {erro ? (
        <p className="mt-4 text-sm text-destructive">{erro}</p>
      ) : carregando ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando posições...
        </div>
      ) : (
        <>
          <div ref={mapaRef} className="mt-4 overflow-hidden rounded-xl border border-border">
            <ClientOnly fallback={<div className="h-[480px] w-full bg-muted" />}>
              <Suspense fallback={<div className="h-[480px] w-full bg-muted" />}>
                <RastreioMapa
                  posicoes={posicoes}
                  focoUserId={foco}
                  postos={postosNoMapa}
                  altura="h-[480px]"
                />
              </Suspense>
            </ClientOnly>
          </div>

          {posicoes.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma localização recebida nas últimas 12 horas. O supervisor precisa ativar o
              compartilhamento no celular, na página Supervisor.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Pessoa</th>
                    <th className="px-2 py-2">Coordenadas</th>
                    <th className="px-2 py-2">Precisão</th>
                    <th className="px-2 py-2">Sinal</th>
                    <th className="px-2 py-2">Bateria</th>
                    <th className="px-2 py-2">Atualizado</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {posicoes.map((p) => (
                    <tr key={p.userId} className="border-t border-border">
                      <td className="px-2 py-2 font-medium">
                        <button
                          type="button"
                          onClick={() => irPara(p.userId)}
                          title={`Ver ${p.nome} no mapa`}
                          className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent hover:underline"
                        >
                          <span
                            className="inline-block size-3 shrink-0 rounded-full ring-2 ring-background"
                            style={{ backgroundColor: corDoUsuario(p.userId) }}
                            aria-hidden
                          />
                          {p.nome}
                        </button>
                      </td>

                      <td className="px-2 py-2 tabular-nums text-muted-foreground">
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {p.precisaoMetros ? `${Math.round(p.precisaoMetros)} m` : "—"}
                      </td>
                      <td className="px-2 py-2 uppercase text-muted-foreground">
                        {p.tipoSinal ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {p.bateria === null ? "—" : `${p.bateria}%`}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {minutosAtras(p.capturadoEm)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1"
                            disabled={atualizandoId === p.userId}
                            title={`Atualizar a localização de ${p.nome}`}
                            onClick={() => void atualizarPessoa(p.userId)}
                          >
                            <RefreshCw
                              className={`size-4 ${atualizandoId === p.userId ? "animate-spin" : ""}`}
                            />{" "}
                            Atualizar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => irPara(p.userId)}
                          >
                            <Navigation className="size-4" /> Ver no mapa
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"

                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}`,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            <Eye className="size-4" /> Street View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
