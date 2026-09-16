import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  MapPin,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { KpiCard } from "@/components/KpiCard";
import { GERENTES_AREA_A } from "@/lib/gerentes-area-a";
import { slugifyGerente } from "@/lib/use-visits";
import { carregarVisitasSupervisao, type VisitaSupervisao } from "@/lib/nexti-visitas";

export const Route = createFileRoute("/_authenticated/relatorios-gerente/$slug")({
  head: () => ({
    meta: [
      { title: "Relatórios do Gerente de Área A | NextiControl" },
      {
        name: "description",
        content:
          "Todos os relatórios de visita por posto realizados pelo Gerente de Área A no NEXTI Control 2.0.",
      },
      { property: "og:title", content: "Relatórios do Gerente de Área A" },
      {
        property: "og:description",
        content: "Relatórios de visita por posto, conformidade e não conformidades do gerente.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosDoGerente,
});

const CARGO = "GERENTE DE ÁREA A";

function formatarData(iso: string | null) {
  if (!iso) return "sem data";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "sem data" : d.toLocaleDateString("pt-BR");
}

function RelatoriosDoGerente() {
  const { slug } = Route.useParams();
  const [visitas, setVisitas] = useState<VisitaSupervisao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const nome = useMemo(
    () => GERENTES_AREA_A.find((g) => slugifyGerente(g) === slug) ?? null,
    [slug],
  );

  useEffect(() => {
    let ativo = true;
    void carregarVisitasSupervisao(2000).then((resumo) => {
      if (!ativo) return;
      setVisitas(resumo.visitas.filter((v) => slugifyGerente(v.supervisor) === slug));
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [slug]);

  const kpis = useMemo(() => {
    const conformes = visitas.reduce((a, v) => a + v.conformes, 0);
    const naoConformes = visitas.reduce((a, v) => a + v.naoConformes, 0);
    const respostas = conformes + naoConformes;
    return {
      visitas: visitas.length,
      postos: new Set(visitas.map((v) => v.posto).filter(Boolean)).size,
      naoConformes,
      conformidade: respostas ? Math.round((conformes / respostas) * 100) : 0,
    };
  }, [visitas]);

  const ordenadas = useMemo(
    () =>
      [...visitas].sort(
        (a, b) =>
          (b.data ?? "").localeCompare(a.data ?? "") || a.posto.localeCompare(b.posto, "pt-BR"),
      ),
    [visitas],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-24 sm:p-6">
      <Link
        to="/control"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar para o Control
      </Link>

      <header className="panel space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Realizador da tarefa
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <UserRound className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">
              {nome ?? "Gerente não identificado"}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <BadgeCheck className="size-4 text-primary" /> Cargo: {CARGO}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visitas" value={kpis.visitas} icon={ClipboardList} />
        <KpiCard label="Postos" value={kpis.postos} icon={MapPin} tone="accent" />
        <KpiCard label="Conformidade" value={`${kpis.conformidade}%`} icon={CheckCircle2} />
        <KpiCard
          label="Não conformidades"
          value={kpis.naoConformes}
          icon={TriangleAlert}
          tone="destructive"
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Relatórios de visita por posto</h2>
          <p className="text-xs text-muted-foreground">
            Clique em um posto para abrir o relatório completo com todas as perguntas e respostas.
          </p>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando relatórios…</p>
        ) : ordenadas.length === 0 ? (
          <p className="panel p-5 text-sm text-muted-foreground">
            Nenhum relatório de visita encontrado para este gerente no período sincronizado.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordenadas.map((v) => {
              const respostas = v.conformes + v.naoConformes;
              const conformidade = respostas ? Math.round((v.conformes / respostas) * 100) : 0;
              return (
                <Link
                  key={v.id}
                  to="/relatorios-visita/$id"
                  params={{ id: v.id }}
                  className="panel flex flex-col gap-2 p-4 transition-colors hover:border-primary/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">{v.posto}</h3>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                        conformidade >= 90
                          ? "bg-success/15 text-success"
                          : conformidade >= 70
                            ? "bg-accent/15 text-accent"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {conformidade}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {v.cliente || "Cliente não informado"}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarRange className="size-3" /> {formatarData(v.data)}
                    {v.cidade ? ` · ${v.cidade}${v.uf ? `/${v.uf}` : ""}` : ""}
                  </p>
                  <div className="mt-auto flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3" /> {v.conformes}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-destructive">
                      <TriangleAlert className="size-3" /> {v.naoConformes}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {v.itens.length} pergunta(s)
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
