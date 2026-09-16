import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WidgetBoard } from "@/components/widgets/WidgetBoard";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  MapPin,
  Satellite,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

import { KpiCard } from "@/components/KpiCard";
import {
  QualidadeTempoSupervisores,
  formatarDuracao,
} from "@/components/QualidadeTempoSupervisores";
import {
  chartQuestionKey,
  classificarResposta,
  deduplicarVisitas,
  parseDateBR,
  visitaRealizada,
  type Visit,
} from "@/lib/report-parser";

import { listVisitas, resetTudo } from "@/lib/visitas-db";
import { supabase } from "@/integrations/supabase/client";
import { notificarControlAtualizado, ouvirControlAtualizado } from "@/lib/control-sync";
import { filtrarFonteControl } from "@/lib/control-regras";

export const Route = createFileRoute("/_authenticated/control")({
  head: () => ({
    meta: [
      { title: "Control · Indicadores dos relatórios em PDF | NextiControl" },
      {
        name: "description",
        content:
          "Dashboard gerado automaticamente a partir dos relatórios de supervisão em PDF: conformidade, visitas por dia, tempo em posto e ocorrências.",
      },
      { property: "og:title", content: "Control · Indicadores dos relatórios em PDF" },
      {
        property: "og:description",
        content:
          "Importe os PDFs de supervisão e veja indicadores de conformidade, visitas e ocorrências gerados automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlDashboard,
});

const STORAGE_KEY = "nexti-visitas-v1";

const COR_CONFORME = "hsl(152 60% 45%)";
const COR_NAO = "hsl(0 72% 55%)";
const COR_PRIMARIA = "hsl(4 90% 58%)";
const COR_EIXO = "hsl(0 0% 62%)";
const COR_GRADE = "hsl(0 0% 26%)";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaBR(dia: string) {
  return dia.split("-").reverse().join("/");
}

function ControlDashboard() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [localFiltro, setLocalFiltro] = useState("");
  const [realizadorFiltro, setRealizadorFiltro] = useState("");
  const [detalhe, setDetalhe] = useState<Visit | null>(null);

  const [topDataInicio, setTopDataInicio] = useState("");
  const [topDataFim, setTopDataFim] = useState("");

  const [limpando, setLimpando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

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
    // Regra do Control: a API NEXTI nunca vincula informações aqui.
    const doBanco = await listVisitas();
    setVisits(deduplicarVisitas(filtrarFonteControl(doBanco)));

    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    return ouvirControlAtualizado(() => void carregar());
  }, [carregar]);

  const limparTudo = useCallback(async () => {
    const confirmou = window.confirm(
      "Isso vai apagar TODOS os relatórios importados, as visitas salvas e os PDFs enviados. Deseja continuar?",
    );
    if (!confirmou) return;
    setLimpando(true);
    setMensagem(null);
    try {
      const r = await resetTudo();
      setVisits([]);
      setDetalhe(null);
      notificarControlAtualizado();
      setMensagem(
        r.erros.length > 0
          ? `Limpeza concluída com avisos: ${r.erros[0]}`
          : `Tudo limpo: ${r.visitas} visita(s) e ${r.arquivos + r.storage} arquivo(s) removidos.`,
      );
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Não foi possível limpar os dados.");
    } finally {
      setLimpando(false);
    }
  }, [carregar]);

  const locais = useMemo(
    () =>
      Array.from(new Set(visits.map((v) => (v.local || v.cliente).trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [visits],
  );

  const realizadores = useMemo(
    () =>
      Array.from(new Set(visits.map((v) => v.responsavel.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [visits],
  );

  const filtradas = useMemo(() => {
    const ini = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
    const fim = dataFim ? new Date(`${dataFim}T23:59:59.999`) : null;
    return visits.filter((v) => {
      const d = parseDateBR(v.inicio);
      if (ini || fim) {
        if (!d) return false;
        if (ini && d < ini) return false;
        if (fim && d > fim) return false;
      }
      if (localFiltro && (v.local || v.cliente).trim() !== localFiltro) return false;
      if (realizadorFiltro && v.responsavel.trim() !== realizadorFiltro) return false;
      return true;
    });
  }, [visits, dataInicio, dataFim, localFiltro, realizadorFiltro]);

  const indicadores = useMemo(() => {
    let conformes = 0;
    let naoConformes = 0;
    const duracoes: number[] = [];
    const porDia = new Map<string, number>();
    const porRealizador = new Map<string, { total: number; conf: number; nao: number }>();
    const porLocal = new Map<string, number>();
    const perguntasProblema = new Map<string, number>();

    for (const v of filtradas) {
      for (const r of v.respostas) {
        const classe = classificarResposta(r.answer, r.question);
        if (classe === "conforme") conformes += 1;
        else if (classe === "nao_conforme") {
          naoConformes += 1;
          const chave = chartQuestionKey(r.question);
          perguntasProblema.set(chave, (perguntasProblema.get(chave) ?? 0) + 1);
        }
      }
      if (typeof v.duracaoMin === "number" && v.duracaoMin > 0 && v.duracaoMin < 24 * 60)
        duracoes.push(v.duracaoMin);

      const d = parseDateBR(v.inicio);
      if (d) porDia.set(iso(d), (porDia.get(iso(d)) ?? 0) + 1);

      const nome = v.responsavel.trim() || "Não informado";
      const atual = porRealizador.get(nome) ?? { total: 0, conf: 0, nao: 0 };
      atual.total += 1;
      atual.conf += v.respostas.filter(
        (r) => classificarResposta(r.answer, r.question) === "conforme",
      ).length;
      atual.nao += v.respostas.filter(
        (r) => classificarResposta(r.answer, r.question) === "nao_conforme",
      ).length;
      porRealizador.set(nome, atual);

      const local = (v.local || v.cliente).trim() || "Não informado";
      porLocal.set(local, (porLocal.get(local) ?? 0) + 1);
    }

    const topIni = topDataInicio ? new Date(`${topDataInicio}T00:00:00`) : null;
    const topFim = topDataFim ? new Date(`${topDataFim}T23:59:59.999`) : null;
    const topFiltradas = visits.filter((v) => {
      const d = parseDateBR(v.inicio);
      if (topIni || topFim) {
        if (!d) return false;
        if (topIni && d < topIni) return false;
        if (topFim && d > topFim) return false;
      }
      return true;
    });

    const porRealizadorVisitas = new Map<string, Visit[]>();
    for (const v of topFiltradas) {
      if (!visitaRealizada(v)) continue;
      const nome = v.responsavel.trim() || "Não informado";
      const lista = porRealizadorVisitas.get(nome) ?? [];
      lista.push(v);
      porRealizadorVisitas.set(nome, lista);
    }

    const avaliados = conformes + naoConformes;
    const realizadas = filtradas.filter(visitaRealizada).length;
    return {
      total: realizadas,
      semRegistro: filtradas.length - realizadas,

      locais: porLocal.size,
      realizadores: porRealizador.size,
      conformes,
      naoConformes,
      taxa: avaliados > 0 ? Math.round((conformes / avaliados) * 100) : 0,
      tempoMedio: duracoes.length
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
        : 0,
      serieDias: Array.from(porDia.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-21)
        .map(([dia, qtd]) => ({ dia: diaBR(dia).slice(0, 5), visitas: qtd })),
      serieRealizadores: Array.from(porRealizador.entries())
        .map(([nome, d]) => ({
          nome: nome.split(" ").slice(0, 2).join(" "),
          visitas: d.total,
          conformidade: d.conf + d.nao > 0 ? Math.round((d.conf / (d.conf + d.nao)) * 100) : 0,
        }))
        .sort((a, b) => b.visitas - a.visitas)
        .slice(0, 12),
      pizza: [
        { name: "Conformes", value: conformes, cor: COR_CONFORME },
        { name: "Não conformes", value: naoConformes, cor: COR_NAO },
      ].filter((f) => f.value > 0),
      perguntas: Array.from(perguntasProblema.entries())
        .map(([pergunta, qtd]) => ({ pergunta, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 8),
      top9: Array.from(porRealizadorVisitas.entries())
        .map(([nome, tarefas]) => ({
          nome,
          total: tarefas.length,
          tarefas: tarefas.slice().sort((a, b) => {
            const da = parseDateBR(a.inicio)?.getTime() ?? 0;
            const db = parseDateBR(b.inicio)?.getTime() ?? 0;
            return db - da;
          }),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 9),
    };
  }, [filtradas, visits, topDataInicio, topDataFim]);

  const temFiltro = Boolean(dataInicio || dataFim || localFiltro || realizadorFiltro);

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              NextiControl · Indicadores
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Dashboard do Control</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Todos os números abaixo são gerados automaticamente a partir dos relatórios de
              supervisão em PDF importados nesta página.
            </p>
            {mensagem ? <p className="mt-2 text-xs font-medium text-primary">{mensagem}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void limparTudo()}
              disabled={limpando}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              {limpando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Limpar tudo
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> Início
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {carregando ? (
          <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando relatórios…
          </div>
        ) : visits.length === 0 ? (
          <div className="panel p-8 text-center">
            <ClipboardList className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">Nenhum relatório importado ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Importe os relatórios na página Admin · Relatórios para alimentar este painel.
            </p>
          </div>
        ) : (
          <WidgetBoard
            dashboard="control"
            widgets={[
              {
                key: "filtros",
                titulo: "Filtros",
                tamanho: "grande",
                conteudo: (
                  <section className="panel flex flex-wrap items-end gap-x-5 gap-y-3 p-4 sm:p-5">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      De
                      <input
                        type="date"
                        value={dataInicio}
                        max={dataFim || undefined}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Até
                      <input
                        type="date"
                        value={dataFim}
                        min={dataInicio || undefined}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Local
                      <select
                        value={localFiltro}
                        onChange={(e) => setLocalFiltro(e.target.value)}
                        className="max-w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground sm:min-w-[12rem]"
                      >
                        <option value="">Todos os locais</option>
                        {locais.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Realizador da tarefa
                      <select
                        value={realizadorFiltro}
                        onChange={(e) => setRealizadorFiltro(e.target.value)}
                        className="max-w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground sm:min-w-[13rem]"
                      >
                        <option value="">Todos</option>
                        {realizadores.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    {temFiltro ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDataInicio("");
                          setDataFim("");
                          setLocalFiltro("");
                          setRealizadorFiltro("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold"
                      >
                        <X className="size-3.5" /> Limpar
                      </button>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {filtradas.length} de {visits.length} visita(s)
                    </span>
                  </section>
                ),
              },
              {
                key: "kpi-visitas",
                titulo: "Visitas realizadas",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard
                    label="Visitas realizadas"
                    value={indicadores.total}
                    hint={
                      indicadores.semRegistro > 0
                        ? `${indicadores.semRegistro} registro(s) sem checklist/horário`
                        : "Relatórios com checklist ou horário registrado"
                    }
                    icon={ClipboardList}
                  />
                ),
              },
              {
                key: "kpi-conformidade",
                titulo: "Conformidade",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard
                    label="Conformidade"
                    value={`${indicadores.taxa}%`}
                    hint={`${indicadores.conformes} itens conformes`}
                    icon={CheckCircle2}
                    tone="success"
                  />
                ),
              },
              {
                key: "kpi-nao-conformidades",
                titulo: "Não conformidades",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard
                    label="Não conformidades"
                    value={indicadores.naoConformes}
                    hint="Itens que exigem tratativa"
                    icon={TriangleAlert}
                    tone={indicadores.naoConformes > 0 ? "destructive" : "accent"}
                  />
                ),
              },
              {
                key: "kpi-tempo-medio",
                titulo: "Tempo médio",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard
                    label="Tempo médio"
                    value={formatarDuracao(indicadores.tempoMedio || null)}
                    hint={`Tempo exato da chegada ao encerramento (${indicadores.tempoMedio} min)`}
                    icon={Clock}
                    tone="accent"
                  />
                ),
              },
              {
                key: "kpi-locais",
                titulo: "Locais visitados",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard label="Locais visitados" value={indicadores.locais} icon={MapPin} />
                ),
              },
              {
                key: "kpi-realizadores",
                titulo: "Realizadores",
                tamanho: "pequeno",
                conteudo: (
                  <KpiCard
                    label="Realizadores"
                    value={indicadores.realizadores}
                    icon={Users}
                    tone="accent"
                  />
                ),
              },

              {
                key: "qualidade-tempo-supervisores",
                titulo: "Qualidade e tempo por supervisor",
                tamanho: "grande",
                conteudo: (
                  <QualidadeTempoSupervisores visitas={filtradas} linkPara="/qualidade-tempo" />
                ),
              },

              {
                key: "grafico-visitas-dia",
                titulo: "Visitas por dia",
                tamanho: "medio",
                conteudo: (
                  <div className="panel p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="size-4 text-primary" /> Visitas por dia
                    </h2>
                    <div className="mt-4 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={indicadores.serieDias}>
                          <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} />
                          <XAxis dataKey="dia" fontSize={11} stroke={COR_EIXO} />
                          <YAxis allowDecimals={false} fontSize={11} stroke={COR_EIXO} />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(0 0% 12%)",
                              border: "1px solid hsl(0 0% 26%)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="visitas" radius={[6, 6, 0, 0]} fill={COR_PRIMARIA} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ),
              },
              {
                key: "grafico-checklist",
                titulo: "Respostas do checklist",
                tamanho: "medio",
                conteudo: (
                  <div className="panel p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 className="size-4 text-primary" /> Respostas do checklist
                    </h2>
                    <div className="mt-4 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={indicadores.pizza}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                          >
                            {indicadores.pizza.map((f) => (
                              <Cell key={f.name} fill={f.cor} />
                            ))}
                          </Pie>
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(0 0% 12%)",
                              border: "1px solid hsl(0 0% 26%)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ),
              },
              {
                key: "grafico-realizadores",
                titulo: "Visitas e conformidade por realizador",
                tamanho: "medio",
                conteudo: (
                  <div className="panel p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Users className="size-4 text-primary" /> Visitas e conformidade por
                      realizador
                    </h2>
                    <div className="mt-4 h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={indicadores.serieRealizadores} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} />
                          <XAxis type="number" fontSize={11} stroke={COR_EIXO} />
                          <YAxis
                            type="category"
                            dataKey="nome"
                            width={110}
                            fontSize={11}
                            stroke={COR_EIXO}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(0 0% 12%)",
                              border: "1px solid hsl(0 0% 26%)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="visitas" name="Visitas" fill={COR_PRIMARIA} radius={4} />
                          <Bar
                            dataKey="conformidade"
                            name="Conformidade %"
                            fill={COR_CONFORME}
                            radius={4}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ),
              },
              {
                key: "grafico-itens-reprovam",
                titulo: "Itens que mais reprovam",
                tamanho: "medio",
                conteudo: (
                  <div className="panel p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <TriangleAlert className="size-4 text-destructive" /> Itens que mais reprovam
                    </h2>
                    {indicadores.perguntas.length === 0 ? (
                      <p className="mt-6 text-sm text-muted-foreground">
                        Nenhuma não conformidade no período filtrado.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-2">
                        {indicadores.perguntas.map((p) => {
                          const max = indicadores.perguntas[0]?.qtd || 1;
                          return (
                            <li key={p.pergunta}>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0 flex-1 truncate" title={p.pergunta}>
                                  {p.pergunta}
                                </span>
                                <span className="font-semibold text-destructive">{p.qtd}</span>
                              </div>
                              <div className="mt-1 h-2 rounded-full bg-secondary">
                                <div
                                  className="h-2 rounded-full bg-destructive"
                                  style={{ width: `${Math.round((p.qtd / max) * 100)}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ),
              },
              {
                key: "top9",
                titulo: "Top 9 realizadores de tarefas",
                tamanho: "grande",
                conteudo: (
                  <section className="panel p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <Users className="size-4 text-primary" /> Top 9 realizadores de tarefas
                      </h2>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          De
                          <input
                            type="date"
                            value={topDataInicio}
                            max={topDataFim || undefined}
                            onChange={(e) => setTopDataInicio(e.target.value)}
                            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          Até
                          <input
                            type="date"
                            value={topDataFim}
                            min={topDataInicio || undefined}
                            onChange={(e) => setTopDataFim(e.target.value)}
                            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                          />
                        </label>
                      </div>
                    </div>
                    {indicadores.top9.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Nenhuma visita realizada no período filtrado.
                      </p>
                    ) : (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {indicadores.top9.map((r, idx) => (
                          <Link
                            key={r.nome}
                            to="/realizadores"
                            search={{ nome: r.nome }}
                            title={`Ver perfil de ${r.nome}`}
                            className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3 transition-colors hover:border-primary/50 hover:bg-secondary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <span
                              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                idx === 0
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {idx + 1}º
                            </span>
                            <div className="min-w-0">
                              <p className="block truncate text-sm font-semibold transition-colors group-hover:text-primary group-hover:underline">
                                {r.nome}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.total}{" "}
                                {r.total === 1 ? "tarefa realizada" : "tarefas realizadas"}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                ),
              },
              {
                key: "tabela-top10",
                titulo: "Top 10 relatórios — maior duração",
                tamanho: "grande",
                conteudo: (
                  <section className="panel p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-sm font-semibold">Top 10 relatórios — maior duração</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Filtre por data para ver as visitas mais longas de um período.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          De
                          <input
                            type="date"
                            value={dataInicio}
                            max={dataFim || undefined}
                            onChange={(e) => setDataInicio(e.target.value)}
                            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          Até
                          <input
                            type="date"
                            value={dataFim}
                            min={dataInicio || undefined}
                            onChange={(e) => setDataFim(e.target.value)}
                            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[46rem] text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="py-2 pr-3 font-medium">Data</th>
                            <th className="py-2 pr-3 font-medium">Local</th>
                            <th className="py-2 pr-3 font-medium">Realizador</th>
                            <th className="py-2 pr-3 font-medium">Duração</th>
                            <th className="py-2 pr-3 font-medium">Itens</th>
                            <th className="py-2 pr-3 font-medium">Não conf.</th>
                            <th className="py-2 font-medium" />
                          </tr>
                        </thead>
                        <tbody>
                          {[...filtradas]
                            .sort((a, b) => (b.duracaoMin ?? 0) - (a.duracaoMin ?? 0))
                            .slice(0, 10)
                            .map((v) => (
                              <tr key={v.id} className="border-b border-border/60">
                                <td className="py-2 pr-3 whitespace-nowrap">{v.inicio ?? "—"}</td>
                                <td className="py-2 pr-3">{(v.local || v.cliente).trim()}</td>
                                <td className="py-2 pr-3">{v.responsavel || "—"}</td>
                                <td className="py-2 pr-3 whitespace-nowrap">
                                  {v.duracaoMin != null ? `${v.duracaoMin} min` : "—"}
                                </td>
                                <td className="py-2 pr-3">{v.respostas.length}</td>
                                <td
                                  className={`py-2 pr-3 font-semibold ${v.naoConformes > 0 ? "text-destructive" : "text-success"}`}
                                >
                                  {v.naoConformes}
                                </td>
                                <td className="py-2">
                                  <button
                                    type="button"
                                    onClick={() => setDetalhe(v)}
                                    className="rounded-md border border-border px-2 py-1 font-medium hover:bg-muted"
                                  >
                                    Ver
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {filtradas.length > 10 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Mostrando as 10 visitas com maior duração do filtro.
                      </p>
                    ) : null}
                  </section>
                ),
              },
            ]}
          />
        )}
      </div>

      {detalhe ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          onClick={() => setDetalhe(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{(detalhe.local || detalhe.cliente).trim()}</h3>
                <p className="text-xs text-muted-foreground">
                  {detalhe.responsavel} · {detalhe.inicio ?? "sem data"} →{" "}
                  {detalhe.fim ?? "sem término"}
                </p>
                {detalhe.cidade ? (
                  <p className="text-xs text-muted-foreground">
                    {detalhe.endereco} {detalhe.bairro} · {detalhe.cidade}/{detalhe.uf}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDetalhe(null)}
                className="rounded-md border border-border p-1.5"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {detalhe.respostas.map((r, i) => {
                const classe = classificarResposta(r.answer, r.question);
                return (
                  <li key={i} className="rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-xs font-medium text-foreground">{r.question}</p>
                    <p
                      className={`mt-1 text-xs ${
                        classe === "nao_conforme"
                          ? "text-destructive"
                          : classe === "conforme"
                            ? "text-success"
                            : "text-muted-foreground"
                      }`}
                    >
                      {r.answer || "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
            {detalhe.relatos.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Relatos da visita
                </p>
                {detalhe.relatos.map((t, i) => (
                  <p key={i} className="mt-1 text-xs text-muted-foreground">
                    {t}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
