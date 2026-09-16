import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Clock, MapPin, UserRound } from "lucide-react";

import { classificarResposta, parseDateBR, type Visit } from "@/lib/report-parser";
import { gerenteAreaACanonico } from "@/lib/gerentes-area-a";

type Detalhe = {
  id: string;
  data: string;
  inicio: string;
  fim: string;
  duracao: number | null;
  qualidade: number;
  supervisor: string;
  gerente: string;
};

type BlocoGerente = {
  gerente: string;
  visitas: number;
  minutos: number;
  mediaMin: number | null;
  qualidade: number;
  detalhes: Detalhe[];
};

type LinhaLocal = {
  local: string;
  visitas: number;
  minutos: number;
  mediaMin: number | null;
  qualidade: number;
  supervisores: string[];
  gerentes: BlocoGerente[];
};

function duracaoValida(v: Visit) {
  return typeof v.duracaoMin === "number" && v.duracaoMin > 0 && v.duracaoMin < 24 * 60
    ? v.duracaoMin
    : null;
}

/** Converte minutos em texto exato "2h 35min". */
export function formatarDuracao(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

function horaDe(valor: string | null): string {
  const d = parseDateBR(valor);
  if (!d) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dataDe(valor: string | null): string {
  const d = parseDateBR(valor);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function tomQualidade(pct: number) {
  if (pct >= 90) return "bg-success/15 text-success";
  if (pct >= 70) return "bg-accent/15 text-accent";
  return "bg-destructive/15 text-destructive";
}

function contar(v: Visit) {
  let conformes = 0;
  let naoConformes = 0;
  for (const r of v.respostas) {
    const classe = classificarResposta(r.answer, r.question);
    if (classe === "conforme") conformes += 1;
    else if (classe === "nao_conforme") naoConformes += 1;
  }
  return { conformes, naoConformes, itens: conformes + naoConformes };
}

function agregar(vs: Visit[]) {
  let itens = 0;
  let naoConformes = 0;
  let minutos = 0;
  const duracoes: number[] = [];
  const detalhes: Detalhe[] = vs
    .slice()
    .sort(
      (a, b) => (parseDateBR(b.inicio)?.getTime() ?? 0) - (parseDateBR(a.inicio)?.getTime() ?? 0),
    )
    .map((v) => {
      const c = contar(v);
      itens += c.itens;
      naoConformes += c.naoConformes;
      const dur = duracaoValida(v);
      if (dur) {
        minutos += dur;
        duracoes.push(dur);
      }
      return {
        id: v.id,
        data: dataDe(v.inicio),
        inicio: horaDe(v.inicio),
        fim: horaDe(v.fim),
        duracao: dur,
        qualidade: c.itens > 0 ? Math.round((c.conformes / c.itens) * 100) : 0,
        supervisor: v.responsavel.trim() || "Não informado",
        gerente: gerenteDe(v),
      };
    });

  return {
    visitas: vs.length,
    minutos,
    mediaMin: duracoes.length
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null,
    qualidade: itens > 0 ? Math.round(((itens - naoConformes) / itens) * 100) : 0,
    detalhes,
  };
}

/** Gerente de Área A responsável pela visita, quando reconhecido. */
function gerenteDe(v: Visit): string {
  return (
    gerenteAreaACanonico(v.responsavel) ??
    gerenteAreaACanonico(v.posto) ??
    gerenteAreaACanonico(v.local) ??
    "Sem Gerente de Área A identificado"
  );
}

export function QualidadeTempoSupervisores({
  visitas,
  linkPara,
}: {
  visitas: Visit[];
  linkPara?: string;
}) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  const linhas = useMemo<LinhaLocal[]>(() => {
    // Agrupa pelo campo "Local:" extraído dos arquivos importados.
    const porLocal = new Map<string, Visit[]>();
    for (const v of visitas) {
      const local =
        (v.local || v.posto || v.cliente).trim() || "Local não informado";
      const lista = porLocal.get(local) ?? [];
      lista.push(v);
      porLocal.set(local, lista);
    }

    return Array.from(porLocal.entries())
      .map(([local, vs]) => {
        const total = agregar(vs);

        const porGerente = new Map<string, Visit[]>();
        for (const v of vs) {
          const g = gerenteDe(v);
          const lista = porGerente.get(g) ?? [];
          lista.push(v);
          porGerente.set(g, lista);
        }

        const gerentes: BlocoGerente[] = Array.from(porGerente.entries())
          .map(([gerente, lista]) => ({ gerente, ...agregar(lista) }))
          .sort((a, b) => b.visitas - a.visitas || a.gerente.localeCompare(b.gerente, "pt-BR"));

        const supervisores = Array.from(
          new Set(total.detalhes.map((d) => d.supervisor)),
        ).sort((a, b) => a.localeCompare(b, "pt-BR"));

        return { local, ...total, supervisores, gerentes };
      })
      .sort((a, b) => b.visitas - a.visitas || a.local.localeCompare(b.local, "pt-BR"));
  }, [visitas]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 size-4 text-primary" />
        <div className="flex-1">
          {linkPara ? (
            <Link
              to={linkPara}
              className="group inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-primary"
            >
              Qualidade e tempo por local de visita
              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ) : (
            <h2 className="text-sm font-semibold">Qualidade e tempo por local de visita</h2>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Locais lidos do campo "Local:" dos arquivos importados, separados por Gerente de Área A,
            com data, entrada, saída, tempo exato no posto e qualidade de cada visita.
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Nenhuma visita no filtro selecionado.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {linhas.map((l) => {
            const expandido = !fechados.has(l.local);
            return (
              <li key={l.local} className="rounded-xl border border-border/70">
                <button
                  type="button"
                  onClick={() =>
                    setFechados((prev) => {
                      const next = new Set(prev);
                      if (expandido) next.add(l.local);
                      else next.delete(l.local);
                      return next;
                    })
                  }
                  className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      expandido ? "rotate-180" : ""
                    }`}
                  />
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-[10rem] flex-1 text-xs font-semibold">{l.local}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {l.visitas} visita(s) · {l.gerentes.length} gerente(s) ·{" "}
                    {l.supervisores.length} supervisor(es)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Total {formatarDuracao(l.minutos || null)} · média {formatarDuracao(l.mediaMin)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${tomQualidade(l.qualidade)}`}
                  >
                    {l.qualidade}% qualidade
                  </span>
                </button>

                {expandido ? (
                  <div className="space-y-3 border-t border-border/70 p-3">
                    {l.gerentes.map((g) => (
                      <div key={g.gerente} className="rounded-lg border border-border/50">
                        <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-3 py-2">
                          <UserRound className="size-3.5 shrink-0 text-primary" />
                          <span className="min-w-[10rem] flex-1 text-[11px] font-semibold">
                            {g.gerente}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {g.visitas} visita(s) · total {formatarDuracao(g.minutos || null)} ·
                            média {formatarDuracao(g.mediaMin)}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tomQualidade(g.qualidade)}`}
                          >
                            {g.qualidade}%
                          </span>
                        </div>
                        <div className="overflow-x-auto p-3">
                          <table className="w-full min-w-[36rem] text-left text-[11px]">
                            <thead className="text-muted-foreground">
                              <tr className="border-b border-border/60">
                                <th className="py-1 pr-3 font-medium">Data</th>
                                <th className="py-1 pr-3 font-medium">Entrada</th>
                                <th className="py-1 pr-3 font-medium">Saída</th>
                                <th className="py-1 pr-3 font-medium">Tempo no posto</th>
                                <th className="py-1 pr-3 font-medium">Supervisor</th>
                                <th className="py-1 font-medium">Qualidade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.detalhes.map((d) => (
                                <tr key={d.id} className="border-b border-border/40 last:border-0">
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.data}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.inicio}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.fim}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">
                                    {formatarDuracao(d.duracao)}
                                  </td>
                                  <td className="py-1 pr-3">{d.supervisor}</td>
                                  <td className="py-1 font-semibold">{d.qualidade}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
