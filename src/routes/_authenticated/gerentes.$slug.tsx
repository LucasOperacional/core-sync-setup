import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  MapPin,
  TriangleAlert,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { chartQuestionKey, isConforme, parseDateBR } from "@/lib/report-parser";
import { useVisits, slugifyGerente } from "@/lib/use-visits";

export const Route = createFileRoute("/_authenticated/gerentes/$slug")({
  head: () => ({
    meta: [
      { title: "Dashboard do Gerente de Área | NextiControl" },
      {
        name: "description",
        content:
          "Indicadores completos de um gerente de área: visitas, conformidade do checklist, tempo em posto e relatos de campo.",
      },
      { property: "og:title", content: "Dashboard do Gerente de Área" },
      {
        property: "og:description",
        content: "Desempenho individual do gerente com checklist, clientes e não conformidades.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GerenteDashboard,
});

function GerenteDashboard() {
  const { slug } = Route.useParams();
  const { visits } = useVisits();
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const doGerente = useMemo(
    () => visits.filter((v) => slugifyGerente(v.responsavel.trim() || "Não identificado") === slug),
    [visits, slug],
  );

  const filtradas = useMemo(() => {
    if (!dataInicio && !dataFim) return doGerente;
    const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
    const fim = dataFim ? new Date(`${dataFim}T23:59:59.999`) : null;
    return doGerente.filter((v) => {
      const d = parseDateBR(v.inicio);
      if (!d) return false;
      if (inicio && d < inicio) return false;
      if (fim && d > fim) return false;
      return true;
    });
  }, [doGerente, dataInicio, dataFim]);

  const stats = useMemo(() => {
    const totalRespostas = filtradas.reduce((acc, v) => acc + v.respostas.length, 0);
    const conformes = filtradas.reduce((acc, v) => acc + v.conformes, 0);
    const naoConformes = totalRespostas - conformes;
    const duracoes = filtradas.map((v) => v.duracaoMin).filter((d): d is number => d != null);
    const porCliente = new Map<string, { visitas: number; naoConformes: number }>();
    for (const v of filtradas) {
      const e = porCliente.get(v.cliente) ?? { visitas: 0, naoConformes: 0 };
      e.visitas += 1;
      e.naoConformes += v.naoConformes;
      porCliente.set(v.cliente, e);
    }
    const porItem = new Map<string, { conforme: number; naoConforme: number }>();
    for (const v of filtradas) {
      for (const r of v.respostas) {
        const key = chartQuestionKey(r.question);
        const e = porItem.get(key) ?? { conforme: 0, naoConforme: 0 };
        if (isConforme(r.answer, r.question)) e.conforme += 1;
        else e.naoConforme += 1;
        porItem.set(key, e);
      }
    }
    return {
      totalRespostas,
      conformes,
      naoConformes,
      taxa: totalRespostas ? Math.round((conformes / totalRespostas) * 100) : 0,
      tempoMedio: duracoes.length
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
        : 0,
      clientes: porCliente.size,
      porCliente: Array.from(porCliente, ([name, v]) => ({ name, ...v })),
      itens: Array.from(porItem, ([name, v]) => ({ name, ...v })),
      linhaTempo: filtradas
        .slice()
        .sort(
          (a, b) =>
            (parseDateBR(a.inicio)?.getTime() ?? 0) - (parseDateBR(b.inicio)?.getTime() ?? 0),
        )
        .map((v) => ({
          name: v.inicio?.slice(0, 10) ?? "—",
          minutos: v.duracaoMin ?? 0,
        })),
    };
  }, [filtradas]);

  const gerente = doGerente[0];
  const nome = gerente ? gerente.responsavel.trim() || "Não identificado" : "Gerente";
  const relatos = filtradas.flatMap((v) =>
    v.relatos.map((r) => ({ cliente: v.cliente, texto: r })),
  );

  return (
    <main className="min-h-screen">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <Link
              to="/gerentes"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Todos os gerentes
            </Link>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{nome}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {gerente?.cargo || "Gerente de área"} · dashboard individual gerado a partir dos
              relatórios de visita em PDF.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted"
          >
            Painel geral
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {doGerente.length === 0 ? (
          <p className="panel p-6 text-sm text-muted-foreground">
            Nenhuma visita encontrada para este gerente.
          </p>
        ) : (
          <>
            <section className="panel flex flex-wrap items-end gap-x-6 gap-y-4 p-5">
              <div className="flex items-center gap-2">
                <CalendarRange className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Filtrar por período</h2>
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                De
                <input
                  type="date"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Até
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
              {dataInicio || dataFim ? (
                <button
                  type="button"
                  onClick={() => {
                    setDataInicio("");
                    setDataFim("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted"
                >
                  <X className="size-3.5" /> Limpar filtro
                </button>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                Exibindo <strong className="text-foreground">{filtradas.length}</strong> de{" "}
                {doGerente.length} visita(s)
              </span>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Visitas do gerente"
                value={String(filtradas.length)}
                hint={`${stats.clientes} cliente(s) atendidos`}
                icon={ClipboardList}
              />
              <KpiCard
                label="Taxa de conformidade"
                value={`${stats.taxa}%`}
                hint={`${stats.conformes} de ${stats.totalRespostas} itens`}
                icon={CheckCircle2}
                tone="success"
              />
              <KpiCard
                label="Não conformidades"
                value={String(stats.naoConformes)}
                hint="Itens que exigem tratativa"
                icon={TriangleAlert}
                tone={stats.naoConformes > 0 ? "destructive" : "accent"}
              />
              <KpiCard
                label="Tempo médio em posto"
                value={`${stats.tempoMedio} min`}
                hint="Da chegada ao encerramento"
                icon={Clock}
                tone="accent"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="panel p-5 lg:col-span-2">
                <h2 className="text-base font-semibold">Conformidade por item do checklist</h2>
                <div className="mt-4 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.itens} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={230}
                        stroke="var(--color-muted-foreground)"
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="conforme"
                        name="Conforme"
                        fill="var(--color-success)"
                        radius={4}
                        stackId="a"
                      />
                      <Bar
                        dataKey="naoConforme"
                        name="Não conforme"
                        fill="var(--color-destructive)"
                        radius={4}
                        stackId="a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="text-base font-semibold">Distribuição geral</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Conforme", value: stats.conformes },
                          { name: "Não conforme", value: Math.max(stats.naoConformes, 0) },
                        ]}
                        dataKey="value"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        <Cell fill="var(--color-success)" />
                        <Cell fill="var(--color-destructive)" />
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="panel p-5">
                <h2 className="text-base font-semibold">Visitas por cliente</h2>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.porCliente}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                      <YAxis
                        allowDecimals={false}
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--color-muted)" }}
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="visitas"
                        name="Visitas"
                        fill="var(--color-chart-2)"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="naoConformes"
                        name="Não conformidades"
                        fill="var(--color-destructive)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="text-base font-semibold">Tempo em posto por visita (min)</h2>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.linhaTempo}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                      <Tooltip
                        cursor={{ fill: "var(--color-muted)" }}
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="minutos" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {relatos.length > 0 ? (
              <section className="panel p-5">
                <h2 className="text-base font-semibold">Relatos de campo</h2>
                <ul className="mt-3 space-y-2">
                  {relatos.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{r.cliente}:</strong> {r.texto}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2">
              {filtradas
                .slice()
                .sort(
                  (a, b) =>
                    (parseDateBR(b.inicio)?.getTime() ?? 0) -
                    (parseDateBR(a.inicio)?.getTime() ?? 0),
                )
                .map((v) => (
                  <article key={v.id} className="panel p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-base font-semibold">
                          <Building2 className="size-4 text-primary" /> {v.cliente}
                        </h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" /> {v.endereco} · {v.bairro} · {v.cidade}/
                          {v.uf}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          v.naoConformes === 0
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {v.naoConformes === 0 ? "Conforme" : `${v.naoConformes} pendência(s)`}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Início: {v.inicio ?? "—"}</span>
                      <span>Fim: {v.fim ?? "—"}</span>
                      <span>Duração: {v.duracaoMin ?? "—"} min</span>
                      <span>Posto: {v.posto || "—"}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelected(selected === v.id ? null : v.id)}
                      className="mt-4 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {selected === v.id ? "Ocultar checklist" : "Ver checklist"}
                    </button>

                    {selected === v.id ? (
                      <ul className="mt-4 space-y-2 border-t border-border pt-4">
                        {v.respostas.map((r, i) => (
                          <li key={i} className="text-xs">
                            <p className="font-medium">{r.question}</p>
                            <p
                              className={
                                isConforme(r.answer, r.question)
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {r.answer}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
