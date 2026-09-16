import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ClipboardCheck,
  Download,
  FileUp,
  Home,
  RefreshCw,
  Search,
  Stethoscope,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/KpiCard";


import { WidgetBoard } from "@/components/widgets/WidgetBoard";

import { Badge } from "@/components/ui/badge";

import type { ParsedRow } from "@/lib/file-parsers";
import { extrairTodosRegistros, temCabecalho } from "@/lib/tabular-extract";
import {
  buildMonthlySeries,
  downloadCsv,
  normalizeText,
  paletteColor,
  parseDateFlexible,
} from "@/lib/dashboard-utils";

export const Route = createFileRoute("/_authenticated/atestados")({
  head: () => ({
    meta: [
      { title: "Atestados — Dashboard de Afastamentos | NextiControl" },
      {
        name: "description",
        content:
          "Dashboard de atestados médicos: dias de afastamento, CIDs recorrentes, evolução mensal e ranking por colaborador e posto.",
      },
      { property: "og:title", content: "Atestados — Dashboard de Afastamentos" },
      {
        property: "og:description",
        content: "Indicadores de atestados médicos com filtros por posto, cargo, CID e período.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AtestadosPage,
});

const ATESTADOS_STORAGE_KEY = "nexti-atestados-rows-v1";

const TARGET_COLUMNS = [
  {
    key: "colaborador",
    labels: ["colaborador", "nome", "funcionario", "empregado", "paciente", "vigilante"],
  },
  { key: "posto", labels: ["posto", "centro de custo", "local", "unidade", "cliente"] },
  { key: "cargo", labels: ["cargo", "funcao", "ocupacao"] },
  { key: "cid", labels: ["cid", "cid10", "codigo cid", "doenca", "diagnostico"] },
  { key: "medico", labels: ["medico", "profissional emissor", "crm", "medico responsavel"] },
  {
    key: "dias",
    labels: [
      "dias",
      "dias afastamento",
      "dias de afastamento",
      "qtd dias",
      "total dias",
      "afastamento",
    ],
  },
  {
    key: "dataInicio",
    labels: [
      "data inicio",
      "inicio",
      "dt inicio",
      "data_inicio",
      "inicio afastamento",
      "data emissao",
      "emissao",
    ],
  },
  {
    key: "dataFim",
    labels: ["data fim", "fim", "dt fim", "data_fim", "fim afastamento", "termino", "retorno"],
  },
];

type AtestadoRow = {
  colaborador: string;
  posto: string;
  cargo: string;
  cid: string;
  medico: string;
  dias: number;
  dataInicio: string;
  dataFim: string;
  data: Date | null;
};

function detectColumns(rows: ParsedRow[]): boolean {
  return temCabecalho(rows, TARGET_COLUMNS, 2);
}

function cell(row: ParsedRow, idx: number | undefined): string {
  if (idx == null) return "";
  return (row[idx] ?? "").trim();
}

function toDias(raw: string, inicio: string, fim: string): number {
  const num = parseInt(raw.replace(/[^\d-]/g, ""), 10);
  if (!Number.isNaN(num) && num > 0) return num;
  const di = parseDateFlexible(inicio);
  const df = parseDateFlexible(fim);
  if (di && df) {
    const diff = Math.round((df.getTime() - di.getTime()) / 86400000) + 1;
    if (diff > 0) return diff;
  }
  return raw.trim() ? 1 : 0;
}

function extractRows(rows: ParsedRow[]): AtestadoRow[] {
  return extrairTodosRegistros<AtestadoRow>(rows, TARGET_COLUMNS, 2, (row, mapping) => {
    const dataInicio = cell(row, mapping["dataInicio"]);
    const dataFim = cell(row, mapping["dataFim"]);
    const item: AtestadoRow = {
      colaborador: cell(row, mapping["colaborador"]),
      posto: cell(row, mapping["posto"]),
      cargo: cell(row, mapping["cargo"]),
      cid: cell(row, mapping["cid"]).toUpperCase(),
      medico: cell(row, mapping["medico"]),
      dias: toDias(cell(row, mapping["dias"]), dataInicio, dataFim),
      dataInicio,
      dataFim,
      data: parseDateFlexible(dataInicio) ?? parseDateFlexible(dataFim),
    };
    return item.colaborador || item.cid || item.dataInicio || item.posto ? item : null;
  });
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="font-semibold text-foreground">
          {entry.name ?? entry.dataKey}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function AtestadosPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroPosto, setFiltroPosto] = useState("");
  const [filtroCid, setFiltroCid] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  function load() {
    try {
      const raw = localStorage.getItem(ATESTADOS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ParsedRow[]) : [];
      setRows(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
    function onStorage(e: StorageEvent) {
      if (e.key === ATESTADOS_STORAGE_KEY) load();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("atestados-sync", load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("atestados-sync", load);
    };
  }, []);

  const extracted = useMemo(() => {
    if (rows.length === 0) return null;
    if (!detectColumns(rows)) return null;
    return extractRows(rows);
  }, [rows]);

  const opcoes = useMemo(() => {
    const base = extracted ?? [];
    return {
      postos: Array.from(new Set(base.map((r) => r.posto).filter(Boolean))).sort(),
      cids: Array.from(new Set(base.map((r) => r.cid).filter(Boolean))).sort(),
    };
  }, [extracted]);

  const dados = useMemo(() => {
    let data = extracted ?? [];
    if (filtroPosto) data = data.filter((r) => r.posto === filtroPosto);
    if (filtroCid) data = data.filter((r) => r.cid === filtroCid);
    if (dataDe) {
      const de = new Date(`${dataDe}T00:00:00`);
      data = data.filter((r) => r.data && r.data >= de);
    }
    if (dataAte) {
      const ate = new Date(`${dataAte}T23:59:59`);
      data = data.filter((r) => r.data && r.data <= ate);
    }
    if (busca.trim()) {
      const t = normalizeText(busca);
      data = data.filter((r) =>
        [r.colaborador, r.posto, r.cargo, r.cid, r.medico, r.dataInicio].some((v) =>
          normalizeText(v).includes(t),
        ),
      );
    }
    return data;
  }, [extracted, filtroPosto, filtroCid, dataDe, dataAte, busca]);

  const stats = useMemo(() => {
    const total = dados.length;
    const dias = dados.reduce((acc, r) => acc + r.dias, 0);
    const colaboradores = new Set(dados.map((r) => r.colaborador).filter(Boolean)).size;
    const postos = new Set(dados.map((r) => r.posto).filter(Boolean)).size;
    const mediaDias = total ? (dias / total).toFixed(1) : "0.0";

    const porColaborador = new Map<string, number>();
    const porCid = new Map<string, number>();
    const porPosto = new Map<string, number>();
    for (const r of dados) {
      if (r.colaborador)
        porColaborador.set(r.colaborador, (porColaborador.get(r.colaborador) ?? 0) + r.dias);
      if (r.cid) porCid.set(r.cid, (porCid.get(r.cid) ?? 0) + 1);
      if (r.posto) porPosto.set(r.posto, (porPosto.get(r.posto) ?? 0) + r.dias);
    }

    const topColaboradores = Array.from(porColaborador, ([name, value]) => ({
      name: name.length > 24 ? `${name.slice(0, 22)}…` : name,
      dias: value,
    }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10);

    const topCids = Array.from(porCid, ([name, value]) => ({ name, atestados: value }))
      .sort((a, b) => b.atestados - a.atestados)
      .slice(0, 6);

    const topPostos = Array.from(porPosto, ([name, value]) => ({
      name: name.length > 20 ? `${name.slice(0, 18)}…` : name,
      dias: value,
    }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 7);

    const serie = buildMonthlySeries(
      dados,
      (r) => r.data,
      (r) => r.dias,
    );
    const recorrentes = Array.from(
      dados.reduce((map, r) => {
        if (r.colaborador) map.set(r.colaborador, (map.get(r.colaborador) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1]);

    return {
      total,
      dias,
      colaboradores,
      postos,
      mediaDias,
      topColaboradores,
      topCids,
      topPostos,
      serie,
      recorrentes,
    };
  }, [dados]);

  const temDados = rows.length > 0;
  const colunasOk = extracted !== null;
  const filtrosAtivos = Boolean(filtroPosto || filtroCid || dataDe || dataAte || busca);

  function exportar() {
    downloadCsv(
      "atestados",
      ["Colaborador", "Posto", "Cargo", "CID", "Médico", "Dias", "Início", "Fim"],
      dados.map((r) => [
        r.colaborador,
        r.posto,
        r.cargo,
        r.cid,
        r.medico,
        r.dias,
        r.dataInicio,
        r.dataFim,
      ]),
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <ClipboardCheck className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Atestados — Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dias de afastamento, CIDs recorrentes e evolução mensal a partir dos atestados
              importados.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <RefreshCw className="size-4" /> Atualizar
            </button>
            {colunasOk && dados.length > 0 ? (
              <button
                type="button"
                onClick={exportar}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Download className="size-4" /> Exportar CSV
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        {!temDados && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <FileUp className="size-6" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Nenhum atestado importado ainda.
            </p>
            <p className="text-xs text-muted-foreground">
              Importe arquivos CSV, XLSX, XLS ou PDF pelo Painel Admin.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/admin" })}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ir para o Painel Admin
            </button>
          </div>
        )}

        {temDados && !colunasOk && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
            <p className="text-sm font-medium text-foreground">
              Não foi possível identificar as colunas do arquivo (Colaborador, CID, Dias, Datas).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length} linha(s) bruta(s) importada(s) — confira o cabeçalho da planilha.
            </p>
          </div>
        )}

        {colunasOk && (
          <WidgetBoard
            dashboard="atestados"
            widgets={[
              {
                key: "filtros",
                titulo: "Filtros",
                tamanho: "grande" as const,
                conteudo: (
                  <section className="panel flex flex-wrap items-end gap-x-5 gap-y-4 p-5">
                    <label className="flex flex-1 min-w-[14rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Buscar
                      <span className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Colaborador, posto, CID, médico…"
                          className="w-full rounded-lg border border-border bg-secondary py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </span>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Posto
                      <select
                        value={filtroPosto}
                        onChange={(e) => setFiltroPosto(e.target.value)}
                        className="min-w-[11rem] rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">Todos</option>
                        {opcoes.postos.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      CID
                      <select
                        value={filtroCid}
                        onChange={(e) => setFiltroCid(e.target.value)}
                        className="min-w-[8rem] rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">Todos</option>
                        {opcoes.cids.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      De
                      <input
                        type="date"
                        value={dataDe}
                        max={dataAte || undefined}
                        onChange={(e) => setDataDe(e.target.value)}
                        className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Até
                      <input
                        type="date"
                        value={dataAte}
                        min={dataDe || undefined}
                        onChange={(e) => setDataAte(e.target.value)}
                        className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </label>
                    {filtrosAtivos ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroPosto("");
                          setFiltroCid("");
                          setDataDe("");
                          setDataAte("");
                          setBusca("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <X className="size-3.5" /> Limpar
                      </button>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {dados.length} de {extracted?.length ?? 0} atestado(s)
                    </span>
                  </section>
                ),
              },
              {
                key: "kpi-atestados",
                titulo: "Atestados",
                tamanho: "pequeno" as const,
                conteudo: (
                  <KpiCard
                    label="Atestados"
                    value={String(stats.total)}
                    hint={`${stats.postos} posto(s)`}
                    icon={ClipboardCheck}
                  />
                ),
              },
              {
                key: "kpi-dias",
                titulo: "Dias de afastamento",
                tamanho: "pequeno" as const,
                conteudo: (
                  <KpiCard
                    label="Dias de afastamento"
                    value={String(stats.dias)}
                    hint="Soma no período filtrado"
                    icon={TrendingUp}
                    tone="destructive"
                  />
                ),
              },
              {
                key: "kpi-media-dias",
                titulo: "Média de dias",
                tamanho: "pequeno" as const,
                conteudo: (
                  <KpiCard
                    label="Média de dias"
                    value={stats.mediaDias}
                    hint="Por atestado"
                    icon={Stethoscope}
                    tone="accent"
                  />
                ),
              },
              {
                key: "kpi-colaboradores",
                titulo: "Colaboradores",
                tamanho: "pequeno" as const,
                conteudo: (
                  <KpiCard
                    label="Colaboradores"
                    value={String(stats.colaboradores)}
                    hint="Com atestado no período"
                    icon={Users}
                  />
                ),
              },
              {
                key: "kpi-recorrentes",
                titulo: "Casos recorrentes",
                tamanho: "pequeno" as const,
                conteudo: (
                  <KpiCard
                    label="Casos recorrentes"
                    value={String(stats.recorrentes.length)}
                    hint="3+ atestados no período"
                    icon={Stethoscope}
                    tone={stats.recorrentes.length > 0 ? "destructive" : "accent"}
                  />
                ),
              },
              {
                key: "consulta-por-nome",
                titulo: "Consultar atestados por nome",
                tamanho: "grande" as const,
                conteudo: <ConsultaAtestadosPorNome registros={dados} />,
              },

              ...(stats.serie.length > 1
                ? [
                    {
                      key: "evolucao-mensal",
                      titulo: "Evolução mensal",
                      tamanho: "grande" as const,
                      conteudo: (
                        <section className="panel p-5">
                          <h2 className="text-base font-semibold text-foreground">
                            Evolução mensal
                          </h2>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Dias de afastamento e quantidade de atestados por mês.
                          </p>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={stats.serie} margin={{ left: 4, right: 16 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis
                                  dataKey="label"
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={11}
                                />
                                <YAxis
                                  allowDecimals={false}
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={11}
                                />
                                <Tooltip content={<ChartTip />} />
                                <Line
                                  type="monotone"
                                  dataKey="total"
                                  name="Dias"
                                  stroke="var(--color-chart-1)"
                                  strokeWidth={2}
                                  dot
                                />
                                <Line
                                  type="monotone"
                                  dataKey="registros"
                                  name="Atestados"
                                  stroke="var(--color-chart-3)"
                                  strokeWidth={2}
                                  dot
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                      ),
                    },
                  ]
                : []),
              {
                key: "graficos",
                titulo: "Gráficos",
                tamanho: "grande" as const,
                conteudo: (
                  <section className="grid gap-6 lg:grid-cols-2">
                    {stats.topColaboradores.length > 0 && (
                      <div className="panel p-5">
                        <h2 className="text-base font-semibold text-foreground">
                          Top 10 — Dias por colaborador
                        </h2>
                        <div className="mt-4 h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={stats.topColaboradores}
                              layout="vertical"
                              margin={{ left: 4, right: 16 }}
                            >
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
                                width={160}
                                stroke="var(--color-muted-foreground)"
                                fontSize={10}
                              />
                              <Tooltip content={<ChartTip />} />
                              <Bar dataKey="dias" name="Dias" radius={4}>
                                {stats.topColaboradores.map((_, i) => (
                                  <Cell key={i} fill={paletteColor(i)} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {stats.topCids.length > 0 && (
                      <div className="panel p-5">
                        <h2 className="text-base font-semibold text-foreground">
                          CIDs mais frequentes
                        </h2>
                        <div className="mt-4 flex h-80 items-center gap-4">
                          <div className="h-full flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={stats.topCids}
                                  dataKey="atestados"
                                  nameKey="name"
                                  innerRadius={55}
                                  outerRadius={95}
                                  paddingAngle={3}
                                >
                                  {stats.topCids.map((_, i) => (
                                    <Cell key={i} fill={paletteColor(i)} />
                                  ))}
                                </Pie>
                                <Tooltip content={<ChartTip />} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <ul className="w-40 shrink-0 space-y-2 text-xs">
                            {stats.topCids.map((c, i) => (
                              <li key={c.name} className="flex items-center gap-2">
                                <span
                                  className="inline-block size-3 rounded-sm"
                                  style={{ background: paletteColor(i) }}
                                />
                                <span className="truncate">
                                  {c.name}: <strong>{c.atestados}</strong>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </section>
                ),
              },
              ...(stats.topPostos.length > 0
                ? [
                    {
                      key: "postos",
                      titulo: "Dias de afastamento por posto",
                      tamanho: "grande" as const,
                      conteudo: (
                        <section className="panel p-5">
                          <h2 className="text-base font-semibold text-foreground">
                            Dias de afastamento por posto
                          </h2>
                          <div className="mt-4 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={stats.topPostos}
                                margin={{ left: 4, right: 16, bottom: 40 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis
                                  dataKey="name"
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={10}
                                  angle={-30}
                                  textAnchor="end"
                                  interval={0}
                                  height={60}
                                />
                                <YAxis
                                  allowDecimals={false}
                                  stroke="var(--color-muted-foreground)"
                                  fontSize={11}
                                />
                                <Tooltip content={<ChartTip />} />
                                <Bar dataKey="dias" name="Dias" radius={4}>
                                  {stats.topPostos.map((_, i) => (
                                    <Cell key={i} fill={paletteColor(i)} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                      ),
                    },
                  ]
                : []),
              ...(stats.recorrentes.length > 0
                ? [
                    {
                      key: "recorrentes",
                      titulo: "Colaboradores com atestados recorrentes",
                      tamanho: "grande" as const,
                      conteudo: (
                        <section className="panel p-5">
                          <h2 className="text-base font-semibold text-foreground">
                            Colaboradores com atestados recorrentes
                          </h2>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {stats.recorrentes.map(([nome, qtd]) => (
                              <div
                                key={nome}
                                className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
                              >
                                <span className="truncate text-sm text-foreground">{nome}</span>
                                <Badge variant="destructive" className="text-xs">
                                  {qtd} atestados
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </section>
                      ),
                    },
                  ]
                : []),
              ...(dados.length > 0
                ? [
                    {
                      key: "tabela",
                      titulo: "Registros",
                      tamanho: "grande" as const,
                      conteudo: (
                        <section className="space-y-3">
                          <h2 className="text-base font-semibold text-foreground">Registros</h2>
                          <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border bg-secondary text-left">
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Colaborador
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Posto
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Cargo
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    CID
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Médico
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Início
                                  </th>
                                  <th className="px-4 py-3 font-medium text-muted-foreground">
                                    Fim
                                  </th>
                                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                    Dias
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {dados.slice(0, 300).map((r, i) => (
                                  <tr
                                    key={`${r.colaborador}-${i}`}
                                    className="border-b border-border/60 last:border-0"
                                  >
                                    <td className="px-4 py-2.5 text-foreground">
                                      {r.colaborador || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.posto || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.cargo || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.cid || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.medico || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.dataInicio || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {r.dataFim || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                                      {r.dias}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {dados.length > 300 ? (
                            <p className="text-xs text-muted-foreground">
                              Exibindo os 300 primeiros registros — use os filtros ou exporte o CSV
                              para ver todos.
                            </p>
                          ) : null}
                        </section>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
    </main>
  );
}
