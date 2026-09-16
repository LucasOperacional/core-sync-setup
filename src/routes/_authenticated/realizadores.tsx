import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Clock,
  Loader2,
  MapPin,
  Search,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { listVisitas } from "@/lib/visitas-db";
import { ouvirControlAtualizado } from "@/lib/control-sync";
import { filtrarFonteControl } from "@/lib/control-regras";
import {
  classificarResposta,
  deduplicarVisitas,
  parseDateBR,
  visitaRealizada,
  type ClasseResposta,
  type Visit,
} from "@/lib/report-parser";

const CLASSE_ESTILO: Record<ClasseResposta, { rotulo: string; classe: string }> = {
  conforme: {
    rotulo: "Conforme",
    classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  nao_conforme: {
    rotulo: "Não conforme",
    classe: "border-red-500/40 bg-red-500/10 text-red-400",
  },
  neutro: {
    rotulo: "Neutro",
    classe: "border-border bg-muted/60 text-muted-foreground",
  },
};

const STORAGE_KEY = "nexti-visitas-v1";

export const Route = createFileRoute("/_authenticated/realizadores")({
  validateSearch: (search: Record<string, unknown>) => ({
    nome: typeof search["nome"] === "string" ? (search["nome"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "Realizadores — Fix-It Bot" },
      {
        name: "description",
        content: "Perfil de cada realizador de tarefas com setor e histórico de visitas.",
      },
      { property: "og:title", content: "Realizadores — Fix-It Bot" },
      {
        property: "og:description",
        content: "Perfil de cada realizador de tarefas com setor e histórico de visitas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RealizadoresPage,
});

type PerfilRealizador = {
  nome: string;
  setor: string;
  total: number;
  conformes: number;
  naoConformes: number;
  taxa: number;
  tempoMedio: number;
  locais: string[];
  visitas: Visit[];
};

function VisitaItem({
  v,
  i,
  visitaAberta,
  setVisitaAberta,
}: {
  v: Visit;
  i: number;
  visitaAberta: string | null;
  setVisitaAberta: (v: string | null) => void;
}) {
  const chaveVisita = `${v.id}-${i}`;
  const relatorioAberto = visitaAberta === chaveVisita;
  return (
    <li
      key={chaveVisita}
      className="overflow-hidden rounded-lg border border-border/60 bg-secondary/40 text-xs"
    >
      <button
        type="button"
        onClick={() => setVisitaAberta(relatorioAberto ? null : chaveVisita)}
        className="w-full p-3 text-left transition-colors hover:bg-muted/40"
      >
        <p className="truncate font-medium text-foreground" title={(v.local || v.cliente).trim()}>
          <MapPin className="mr-1 inline size-3 text-primary" />
          {(v.local || v.cliente).trim()}
          {v.posto ? ` — ${v.posto}` : ""}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-muted-foreground">
          <span>
            <Clock className="mr-1 inline size-3" />
            {v.inicio ?? "sem data"}
            {typeof v.duracaoMin === "number" && v.duracaoMin > 0 ? ` · ${v.duracaoMin} min` : ""}
          </span>
          {v.respostas.length > 0 && (
            <span>
              {` · ${v.respostas.length} pergunta${
                v.respostas.length === 1 ? "" : "s"
              } · ${v.conformes} conforme${
                v.conformes === 1 ? "" : "s"
              }${v.naoConformes > 0 ? ` · ${v.naoConformes} NC` : ""}`}
            </span>
          )}
          <ChevronDown
            className={`ml-auto inline size-3.5 transition-transform ${
              relatorioAberto ? "rotate-180" : ""
            }`}
          />
        </p>
      </button>
      {relatorioAberto && (
        <div className="border-t border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Relatório de perguntas respondidas
          </p>
          {v.respostas.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma pergunta reconhecida nesta visita.</p>
          ) : (
            <ul className="space-y-2">
              {v.respostas.map((r, j) => {
                const classe = classificarResposta(r.answer, r.question);
                const estilo = CLASSE_ESTILO[classe];
                return (
                  <li key={j} className="rounded-md border border-border/50 bg-secondary/50 p-2">
                    <p className="font-medium leading-snug text-foreground">
                      {j + 1}. {r.question}
                    </p>
                    <p className="mt-1 leading-snug text-muted-foreground">{r.answer}</p>
                    <span
                      className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${estilo.classe}`}
                    >
                      {estilo.rotulo}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function montarPerfis(visits: Visit[]): PerfilRealizador[] {
  const mapa = new Map<string, Visit[]>();
  for (const v of visits) {
    const nome = v.responsavel.trim() || "NÃO INFORMADO";
    const arr = mapa.get(nome) ?? [];
    arr.push(v);
    mapa.set(nome, arr);
  }

  return Array.from(mapa.entries())
    .map(([nome, lista]) => {
      const realizadas = lista.filter(visitaRealizada);
      const conformes = realizadas.reduce((a, v) => a + v.conformes, 0);
      const naoConformes = realizadas.reduce((a, v) => a + v.naoConformes, 0);
      const avaliados = conformes + naoConformes;
      const duracoes = realizadas
        .map((v) => v.duracaoMin)
        .filter((d): d is number => typeof d === "number" && d > 0);
      const setores = [...new Set(realizadas.map((v) => v.cargo.trim()).filter(Boolean))];
      const locais = [
        ...new Set(realizadas.map((v) => (v.local || v.cliente).trim()).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "pt-BR"));

      return {
        nome,
        setor: setores.join(" · ") || "Não informado",
        total: realizadas.length,
        conformes,
        naoConformes,
        taxa: avaliados > 0 ? Math.round((conformes / avaliados) * 100) : 0,
        tempoMedio: duracoes.length
          ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
          : 0,
        locais,
        visitas: realizadas.slice().sort((a, b) => {
          const da = parseDateBR(a.inicio)?.getTime() ?? 0;
          const db = parseDateBR(b.inicio)?.getTime() ?? 0;
          return db - da;
        }),
      };
    })
    .sort((a, b) => b.total - a.total);
}

function RealizadoresPage() {
  const { nome: nomeBusca } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState(nomeBusca);
  const [aberto, setAberto] = useState<string | null>(nomeBusca || null);
  const [visitaAberta, setVisitaAberta] = useState<string | null>(null);
  const [localAberto, setLocalAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Visit[];
          if (Array.isArray(parsed)) setVisits(deduplicarVisitas(filtrarFonteControl(parsed)));
        } catch {
          /* cache inválido */
        }
      }
      setCarregando(false);
      return;
    }
    // Mesma regra do Control: nada vindo da API NEXTI é exibido.
    setVisits(deduplicarVisitas(filtrarFonteControl(await listVisitas())));
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    return ouvirControlAtualizado(() => void carregar());
  }, [carregar]);

  useEffect(() => {
    if (nomeBusca) {
      setBusca(nomeBusca);
      setAberto(nomeBusca);
    }
  }, [nomeBusca]);

  const perfis = useMemo(() => montarPerfis(visits), [visits]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return perfis;
    return perfis.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.setor.toLowerCase().includes(q) ||
        p.locais.some((l) => l.toLowerCase().includes(q)),
    );
  }, [perfis, busca]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/control"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao dashboard Control
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Users className="size-5 text-primary" /> Realizadores de tarefas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique no nome de um realizador para ver todas as tarefas feitas.
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar realizador…"
            className="w-full rounded-lg border border-border bg-secondary py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
      </header>

      {carregando ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando realizadores…
        </p>
      ) : filtrados.length === 0 ? (
        <p className="panel mt-6 p-6 text-center text-sm text-muted-foreground">
          Nenhum realizador encontrado. Importe relatórios no dashboard Control.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {filtrados.map((p) => {
            const expandido = aberto === p.nome;
            return (
              <article key={p.nome} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    const proximo = expandido ? null : p.nome;
                    setAberto(proximo);
                    setVisitaAberta(null);
                    setLocalAberto(null);
                    navigate({ search: proximo ? { nome: proximo } : { nome: "" } });
                  }}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={p.nome}>
                      {p.nome}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.total} {p.total === 1 ? "tarefa" : "tarefas"} realizadas
                    </p>
                  </div>
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      expandido ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandido && (
                  <div className="space-y-6 border-t border-border p-4">
                    <section className="min-w-0">
                      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ClipboardList className="size-3.5" /> Histórico de visitas
                      </h2>
                      {p.visitas.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Nenhuma visita realizada registrada.
                        </p>
                      ) : (
                        <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                          {p.visitas.map((v, i) => (
                            <VisitaItem
                              key={`${v.id}-${i}`}
                              v={v}
                              i={i}
                              visitaAberta={visitaAberta}
                              setVisitaAberta={setVisitaAberta}
                            />
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="min-w-0">
                      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MapPin className="size-3.5" /> Locais atendidos
                      </h2>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                        {p.locais.map((l) => {
                          const chaveLocal = `${p.nome}::${l}`;
                          const localExpandido = localAberto === chaveLocal;
                          const visitasDoLocal = p.visitas.filter(
                            (v) => (v.local || v.cliente).trim() === l,
                          );
                          return (
                            <div
                              key={l}
                              className="overflow-hidden rounded-lg border border-border/60 bg-secondary/50 text-xs text-foreground"
                            >
                              <button
                                type="button"
                                onClick={() => setLocalAberto(localExpandido ? null : chaveLocal)}
                                className="flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-muted/40"
                              >
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                                  {l.charAt(0).toUpperCase()}
                                </span>
                                <span className="line-clamp-2 flex-1" title={l}>
                                  {l}
                                </span>
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {visitasDoLocal.length}{" "}
                                  {visitasDoLocal.length === 1 ? "visita" : "visitas"}
                                </span>
                                <ChevronDown
                                  className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                                    localExpandido ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                              {localExpandido && (
                                <div className="border-t border-border/60 bg-background/40 p-2.5">
                                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {visitasDoLocal.length}{" "}
                                    {visitasDoLocal.length === 1 ? "relatório" : "relatórios"} neste
                                    local
                                  </p>
                                  {visitasDoLocal.length === 0 ? (
                                    <p className="text-muted-foreground">
                                      Nenhum relatório encontrado para este local.
                                    </p>
                                  ) : (
                                    <ul className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                                      {visitasDoLocal.map((v, i) => {
                                        const idxVisitaLocal = p.visitas.indexOf(v);
                                        return (
                                          <VisitaItem
                                            key={`${v.id}-${idxVisitaLocal}`}
                                            v={v}
                                            i={idxVisitaLocal}
                                            visitaAberta={visitaAberta}
                                            setVisitaAberta={setVisitaAberta}
                                          />
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
