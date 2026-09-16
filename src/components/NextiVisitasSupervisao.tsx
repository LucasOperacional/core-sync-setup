import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CheckCircle2, ClipboardCheck, MapPin, TriangleAlert, Users } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { AnaliseConformidadeGemini } from "@/components/AnaliseConformidadeGemini";
import { GerentesAreaACards } from "@/components/GerentesAreaACards";
import { syncNextiVisitas } from "@/lib/nexti-visitas.functions";
import { nextiApiAtiva, useNextiApiAtiva } from "@/lib/nexti-api-status";
import {
  assinarVisitasRealtime,
  carregarVisitasSupervisao,
  type PerguntaResumo,
  type ResumoVisitas,
  type VisitaSupervisao,
} from "@/lib/nexti-visitas";

const CHAVE_ULTIMA = "nexti-visitas-ultima-sync-v1";
const INTERVALO_MS = 10 * 60 * 1000;

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function PerguntaGrid({ perguntas }: { perguntas: PerguntaResumo[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {perguntas.map((p) => (
        <article key={p.pergunta} className="panel flex flex-col gap-3 p-4">
          <h4 className="text-xs font-semibold leading-snug">{p.pergunta}</h4>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold">{p.total}</span>
            <span className="text-xs text-muted-foreground">resposta(s)</span>
            <span
              className={`ml-auto rounded-md px-2 py-1 text-xs font-semibold ${
                p.conformidade >= 90
                  ? "bg-success/15 text-success"
                  : p.conformidade >= 70
                    ? "bg-accent/15 text-accent"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {p.conformidade}% conforme
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full ${p.conformidade >= 70 ? "bg-success" : "bg-destructive"}`}
              style={{ width: `${p.conformidade}%` }}
            />
          </div>
          <ul className="space-y-1 text-xs">
            {p.respostas.slice(0, 5).map((r) => (
              <li key={r.resposta} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted-foreground">{r.resposta}</span>
                <span className="shrink-0 font-semibold">{r.quantidade}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-[11px] text-muted-foreground">
            <span className="text-success">{p.conformes} conforme(s)</span> ·{" "}
            <span className="font-semibold text-destructive">{p.naoConformes} não conforme(s)</span>
          </p>
        </article>
      ))}
    </div>
  );
}

function RelatoriosGrid({ visitas }: { visitas: VisitaSupervisao[] }) {
  const [limite, setLimite] = useState(12);
  // Relatórios com itens detalhados aparecem primeiro; depois por data mais recente.
  const ordenadas = [...visitas].sort(
    (a, b) =>
      (b.itens.length ? 1 : 0) - (a.itens.length ? 1 : 0) ||
      (b.data ?? "").localeCompare(a.data ?? ""),
  );
  const lista = ordenadas.slice(0, limite);

  if (!visitas.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum relatório de visita disponível para este filtro.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((v) => {
          const total = v.conformes + v.naoConformes;
          const conformidade = total ? Math.round((v.conformes / total) * 100) : 0;
          return (
            <Link
              key={v.id}
              to="/relatorios-visita/$id"
              params={{ id: v.id }}
              className="panel group flex flex-col gap-2 p-4 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-2">
                <h5 className="text-xs font-semibold leading-snug">{v.posto}</h5>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
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
              <p className="text-[11px] text-muted-foreground">
                {formatarData(v.data)} · {[v.cidade, v.uf].filter(Boolean).join("/") || "—"}
              </p>
              <p className="text-[11px] font-medium">{v.supervisor}</p>
              <p className="mt-auto flex items-center gap-2 text-[11px]">
                <span className="text-success">
                  <CheckCircle2 className="mr-1 inline size-3" />
                  {v.conformes}
                </span>
                <span className="font-semibold text-destructive">
                  <TriangleAlert className="mr-1 inline size-3" />
                  {v.naoConformes}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {v.itens.length || v.total} pergunta(s)
                </span>
              </p>
              <span className="text-[11px] font-semibold text-primary group-hover:underline">
                Ver relatório completo →
              </span>
            </Link>
          );
        })}
      </div>
      {limite < visitas.length ? (
        <button
          type="button"
          onClick={() => setLimite((l) => l + 12)}
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
        >
          Mostrar mais relatórios ({visitas.length - limite} restante(s))
        </button>
      ) : null}
    </div>
  );
}

export function NextiVisitasSupervisao({
  inicio,
  fim,
}: {
  inicio?: string | null;
  fim?: string | null;
} = {}) {
  const executarSync = useServerFn(syncNextiVisitas);
  const [resumo, setResumo] = useState<ResumoVisitas | null>(null);
  const [gerenteAtivo, setGerenteAtivo] = useState<string>("TODOS");
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const apiAtiva = useNextiApiAtiva();

  const recarregar = useCallback(() => {
    void carregarVisitasSupervisao(1500, { inicio, fim })
      .then(setResumo)
      .catch(() => setResumo(null));
  }, [inicio, fim]);

  const sincronizar = useCallback(
    async (completo: boolean) => {
      // Regra: com a API NEXTI desligada não importamos nada dela.
      if (!(await nextiApiAtiva(completo))) {
        setErro(null);
        setMensagem("API NEXTI desligada: os dashboards usam apenas os arquivos importados.");
        recarregar();
        return;
      }
      setSincronizando(true);
      setErro(null);
      try {
        const r = await executarSync({ data: { dias: 540, completo } });
        if (r.ok) {
          localStorage.setItem(CHAVE_ULTIMA, String(Date.now()));
          setMensagem(
            `${r.respostas} relatório(s) de visita · ${r.checklists} checklist(s)${r.postosVarridos ? ` · ${r.postosVarridos} postos varridos` : ""}`,
          );
          recarregar();
        } else {
          setErro(r.erro ?? "Falha ao sincronizar visitas.");
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao sincronizar visitas.");
      } finally {
        setSincronizando(false);
      }
    },
    [executarSync, recarregar],
  );

  useEffect(() => {
    recarregar();
    const cancelar = assinarVisitasRealtime(recarregar);
    const ultima = Number(localStorage.getItem(CHAVE_ULTIMA) ?? 0);
    if (Date.now() - ultima > INTERVALO_MS) void sincronizar(false);
    const timer = window.setInterval(() => void sincronizar(false), INTERVALO_MS);
    return () => {
      cancelar();
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar]);

  const ultimasVisitas = useMemo(() => resumo?.visitas.slice(0, 12) ?? [], [resumo]);

  return (
    <section className="space-y-4">
      {mensagem ? <p className="text-xs text-primary">{mensagem}</p> : null}
      {erro ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <TriangleAlert className="size-3" /> {erro}
        </p>
      ) : null}

      {resumo && resumo.totalVisitas > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={ClipboardCheck}
              label="Visitas totais"
              value={String(resumo.totalVisitas)}
            />
            <KpiCard
              icon={ClipboardCheck}
              label="Visitas no mês"
              value={String(resumo.visitasMes)}
              hint={`${resumo.visitasHoje} hoje`}
            />
            <KpiCard
              icon={MapPin}
              label="Postos visitados"
              value={String(resumo.postosVisitados)}
            />
            <KpiCard icon={Users} label="Supervisores" value={String(resumo.supervisores)} />
            <KpiCard
              icon={ClipboardCheck}
              label="Perguntas respondidas"
              value={String(resumo.totalPerguntasRespondidas)}
              hint={`${resumo.perguntasDistintas} pergunta(s) distinta(s)`}
            />
            <KpiCard
              icon={CheckCircle2}
              label="Conformidade"
              value={`${resumo.conformidade}%`}
              tone="success"
            />
            <KpiCard
              icon={TriangleAlert}
              label="Não conformidades"
              value={String(resumo.naoConformidades)}
              tone="destructive"
            />
            <KpiCard
              icon={ClipboardCheck}
              label="Checklists usados"
              value={String(resumo.checklists.length)}
              hint={resumo.checklists[0]?.nome ?? undefined}
            />
          </div>

          <GerentesAreaACards
            resumo={resumo}
            gerenteAtivo={gerenteAtivo}
            onSelecionar={setGerenteAtivo}
          />

          <AnaliseConformidadeGemini
            perguntas={
              gerenteAtivo === "TODOS"
                ? resumo.perguntas
                : (resumo.perguntasPorGerente.find((g) => g.nome === gerenteAtivo)?.perguntas ?? [])
            }
            contexto={
              gerenteAtivo === "TODOS"
                ? "Todos os Gerentes de Área A · checklists NEXTI CONTROL 2.0"
                : `Gerente de Área A: ${gerenteAtivo} · checklists NEXTI CONTROL 2.0`
            }
          />

          <div className="panel p-5">
            <h3 className="text-sm font-semibold">Ranking · quem mais fez visitas</h3>
            <p className="text-xs text-muted-foreground">
              Total de relatórios de visita por supervisor (dados da NEXTI).
            </p>
            <div
              className="mt-4"
              style={{ height: Math.max(220, Math.min(resumo.porSupervisor.length, 15) * 34) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resumo.porSupervisor.slice(0, 15)}
                  layout="vertical"
                  margin={{ left: 8, right: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="nome" width={170} fontSize={10} />
                  <Tooltip />
                  <Bar
                    dataKey="visitas"
                    name="Visitas"
                    fill="var(--color-primary)"
                    radius={[0, 4, 4, 0]}
                  >
                    <LabelList dataKey="visitas" position="right" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Visitas por dia (últimos 30 dias)</h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={resumo.porDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="visitas"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Itens com mais não conformidades</h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resumo.porItem} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="pergunta" width={160} fontSize={9} />
                    <Tooltip />
                    <Bar
                      dataKey="naoConformes"
                      fill="var(--color-destructive)"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Perguntas dos relatórios de visita</h3>
                <p className="text-xs text-muted-foreground">
                  Separado por Gerente de Área A — cada card mostra uma pergunta do checklist NEXTI
                  CONTROL 2.0 com o total de respostas e a distribuição.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGerenteAtivo("TODOS")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  gerenteAtivo === "TODOS"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary hover:bg-muted"
                }`}
              >
                Todos os gerentes
              </button>
              {resumo.perguntasPorGerente.map((g) => (
                <button
                  key={g.nome}
                  type="button"
                  onClick={() => setGerenteAtivo(g.nome)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    gerenteAtivo === g.nome
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary hover:bg-muted"
                  }`}
                >
                  {g.nome}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({g.visitas})
                  </span>
                </button>
              ))}
            </div>

            {gerenteAtivo === "TODOS"
              ? resumo.perguntasPorGerente.map((g) => (
                  <div key={g.nome} className="space-y-3 rounded-xl border border-border/70 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-sm font-semibold">{g.nome}</h4>
                      <p className="text-xs text-muted-foreground">
                        {g.visitas} visita(s) · {g.total} resposta(s) ·{" "}
                        <span className="font-semibold text-destructive">{g.naoConformes} N/C</span>{" "}
                        · {g.conformidade}% conforme
                      </p>
                    </div>
                    {g.perguntas.length ? (
                      <PerguntaGrid perguntas={g.perguntas} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum relatório de visita registrado para este gerente.
                      </p>
                    )}
                  </div>
                ))
              : (() => {
                  const g = resumo.perguntasPorGerente.find((x) => x.nome === gerenteAtivo);
                  if (!g) return null;
                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {g.visitas} visita(s) · {g.total} resposta(s) ·{" "}
                        <span className="font-semibold text-destructive">{g.naoConformes} N/C</span>{" "}
                        · {g.conformidade}% conforme
                      </p>
                      {g.perguntas.length ? (
                        <PerguntaGrid perguntas={g.perguntas} />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Nenhum relatório de visita registrado para este gerente.
                        </p>
                      )}
                    </div>
                  );
                })()}

            <div className="space-y-3 border-t border-border/70 pt-4">
              <div>
                <h4 className="text-sm font-semibold">Relatórios de visita completos</h4>
                <p className="text-xs text-muted-foreground">
                  Clique em um card para abrir o relatório de visita completo, com todas as
                  perguntas, respostas e observações.
                </p>
              </div>
              <RelatoriosGrid
                visitas={
                  gerenteAtivo === "TODOS"
                    ? resumo.visitas
                    : resumo.visitas.filter((v) => v.supervisor === gerenteAtivo)
                }
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Ranking detalhado de supervisores</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {resumo.porSupervisor.slice(0, 12).map((s, i) => (
                  <li
                    key={s.nome}
                    className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.visitas} visita(s) · {s.postos} posto(s) · {s.naoConformes} N/C
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-success/15 px-2 py-1 text-xs font-semibold text-success">
                      {s.conformidade}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel overflow-hidden p-0">
              <div className="border-b border-border p-5">
                <h3 className="text-sm font-semibold">Últimas visitas registradas</h3>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-secondary text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Supervisor</th>
                      <th className="px-4 py-2 font-medium">Posto</th>
                      <th className="px-4 py-2 text-right font-medium">Perg.</th>
                      <th className="px-4 py-2 text-right font-medium">Conf.</th>
                      <th className="px-4 py-2 text-right font-medium">N/C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasVisitas.map((v) => (
                      <tr key={v.id} className="border-t border-border/60">
                        <td className="whitespace-nowrap px-4 py-2">{formatarData(v.data)}</td>
                        <td className="px-4 py-2">{v.supervisor}</td>
                        <td className="px-4 py-2">
                          <span className="block max-w-[220px] truncate">{v.posto}</span>
                          <span className="text-[10px] text-muted-foreground">{v.cliente}</span>
                        </td>
                        <td className="px-4 py-2 text-right">{v.total}</td>
                        <td className="px-4 py-2 text-right text-success">{v.conformes}</td>
                        <td className="px-4 py-2 text-right font-semibold text-destructive">
                          {v.naoConformes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
