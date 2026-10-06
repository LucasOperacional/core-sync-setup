/**
 * MAPA DOS POSTOS DE SERVIÇO (NEXTI).
 * Mostra no mapa todos os postos registrados na NEXTI com o endereço completo.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ExternalLink, Loader2, MapPin, Navigation, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  filtrarEmpresasPermitidas,
  listarPostosMapa,
  ocultarNoMapa,
  sincronizarPostosNexti,
  type PostoMapa,
} from "@/lib/nexti-postos-mapa.functions";
import { possoVerPostosNoturnos } from "@/lib/postos-noturnos.functions";
import { COR_MAPA, semaforoDe } from "@/lib/visitas-semaforo";

const RastreioMapa = lazy(() => import("@/components/RastreioMapa"));

export function PostosServicoMapaCard() {
  const listar = useServerFn(listarPostosMapa);
  const sincronizar = useServerFn(sincronizarPostosNexti);
  const [postos, setPostos] = useState<PostoMapa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<number | null>(null);
  const verNoturnoFn = useServerFn(possoVerPostosNoturnos);
  const [verNoturno, setVerNoturno] = useState(false);

  useEffect(() => {
    verNoturnoFn()
      .then(setVerNoturno)
      .catch(() => setVerNoturno(false));
  }, [verNoturnoFn]);

  const carregar = useCallback(async () => {
    try {
      setPostos(await listar());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os postos de serviço.");
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Quantidades editadas na página "Quantidade de visitas por posto".
  const [ajustes, setAjustes] = useState<Record<string, number>>({});
  const carregarAjustes = useCallback(async () => {
    const { data } = await (supabase as any).from("postos_visitas_ajuste").select("posto_id, quantidade");
    const m: Record<string, number> = {};
    for (const r of (data ?? []) as { posto_id: string; quantidade: number }[]) m[r.posto_id] = r.quantidade;
    setAjustes(m);
  }, []);

  useEffect(() => {
    void carregarAjustes();
  }, [carregarAjustes]);

  // Atualiza o mapa automaticamente assim que um supervisor registra uma visita
  // ou alguém muda a quantidade de visitas de um posto.
  useEffect(() => {
    const canal = supabase
      .channel("mapa-postos-visitas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roteiros_visita_campo" },
        () => {
          void carregar();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "postos_visitas_ajuste" },
        () => {
          void carregarAjustes();
        },
      )
      .subscribe();

    const intervalo = setInterval(() => {
      void carregar();
      void carregarAjustes();
    }, 60_000);
    return () => {
      clearInterval(intervalo);
      void supabase.removeChannel(canal);
    };
  }, [carregar, carregarAjustes]);

  const buscarNaNexti = useCallback(async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const r = await sincronizar({ data: undefined as never });
      if (!r.ok) {
        setErro(r.erro ?? "Falha ao buscar os postos na NEXTI.");
      } else {
        setErro(null);
        setAviso(
          `${r.total} posto(s) atualizado(s) na NEXTI · ${r.comCoordenadas} com endereço localizado no mapa.`,
        );
        await carregar();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao buscar os postos na NEXTI.");
    } finally {
      setBuscando(false);
    }
  }, [sincronizar, carregar]);

  // REGRA: postos com inicial "TS" não aparecem na lista nem no mapa.
  const permitidos = useMemo(
    () =>
      filtrarEmpresasPermitidas(
        postos.filter((p) => !p.nome.trim().toUpperCase().startsWith("TS")),
      ),
    [postos],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return permitidos;
    return permitidos.filter((p) =>
      `${p.nome} ${p.cliente ?? ""} ${p.enderecoCompleto} ${p.bairro ?? ""} ${p.empresa ?? ""}`
        .toUpperCase()
        .includes(termo),
    );
  }, [permitidos, busca]);

  const noMapa = useMemo(
    () =>
      filtrados
        .filter((p) => p.latitude !== null && p.longitude !== null && !ocultarNoMapa(p, verNoturno))
        .map((p) => {
          // Cor da bolinha = meta editada em "Visitas por posto" (ou a automática).
          const meta = ajustes[String(p.id)];
          const feitas = p.visitasRealizadas || 0;
          const total = meta ?? feitas;
          const partes = [
            p.gerenteArea ? `Gerente: ${p.gerenteArea}` : null,
            meta !== undefined ? `${feitas} de ${meta} visitas feitas` : `${feitas} ${feitas === 1 ? "visita feita" : "visitas feitas"}`,
            p.ultimaVisita ? `última ${formatarDataVisita(p.ultimaVisita)}` : null,
          ].filter(Boolean);
          return {
            ...p,
            corMapa: COR_MAPA[semaforoDe(total)],
            nome: `${p.nome} (${partes.join(" · ")})`,
          };
        }),
    [filtrados, verNoturno, ajustes],
  );

  const noturnosOcultos = useMemo(
    () => permitidos.filter((p) => ocultarNoMapa(p, verNoturno)).length,
    [permitidos, verNoturno],
  );

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold uppercase">
            <Building2 className="size-5 text-primary" />
            Postos de serviço no mapa
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Todos os postos registrados na NEXTI, com endereço completo (rua, número, bairro,
            cidade/UF e CEP) e marcação no mapa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
            {noMapa.length} no mapa · {filtrados.length} posto(s)
          </span>
          <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-500">
            {noturnosOcultos} oculto(s) por regra
          </span>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void carregar()}>
            <RefreshCw className={`size-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={buscando}
            onClick={() => void buscarNaNexti()}
          >
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            Buscar endereços na NEXTI
          </Button>
        </div>
      </div>

      {erro ? <p className="mt-3 text-sm text-destructive">{erro}</p> : null}
      {aviso ? <p className="mt-3 text-sm text-emerald-600">{aviso}</p> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <ClientOnly fallback={<div className="h-[480px] w-full bg-muted" />}>
          <Suspense fallback={<div className="h-[480px] w-full bg-muted" />}>
            <RastreioMapa posicoes={[]} postos={noMapa} focoPostoId={foco} altura="h-[480px]" />
          </Suspense>
        </ClientOnly>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar posto, cliente, bairro ou endereço"
          className="w-full rounded-lg border border-border bg-secondary py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {carregando ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando postos...
        </div>
      ) : filtrados.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhum posto encontrado. Use “Buscar endereços na NEXTI”.
        </p>
      ) : (
        <div className="mt-4 max-h-[360px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2">Posto</th>
                <th className="px-2 py-2">Cliente</th>
                <th className="px-2 py-2">Gerente de área</th>
                <th className="px-2 py-2">Endereço completo</th>
                <th className="px-2 py-2 text-center">Visitas</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">{p.nome}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.cliente || "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.gerenteArea || "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.enderecoCompleto || "—"}</td>
                  <td className="px-2 py-2 text-center">
                    <span className="font-bold text-primary">
                      {p.visitasRealizadas || 0}
                      {ajustes[String(p.id)] !== undefined ? ` / ${ajustes[String(p.id)]}` : ""}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ajustes[String(p.id)] !== undefined ? "feitas / a fazer" : "feitas"}
                    </span>
                    {p.ultimaVisita ? (
                      <span className="block text-[11px] text-muted-foreground">
                        última {formatarDataVisita(p.ultimaVisita)}
                        {p.ultimoSupervisor ? ` · ${p.ultimoSupervisor}` : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {p.latitude !== null && p.longitude !== null ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => setFoco(p.id)}
                        >
                          <Navigation className="size-4" /> Ver no mapa
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() =>
                            window.open(
                              `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <ExternalLink className="size-4" /> Abrir mapa
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem coordenada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatarDataVisita(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}
