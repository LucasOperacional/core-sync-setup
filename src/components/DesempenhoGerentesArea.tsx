import { useMemo, useState } from "react";
import { ChevronDown, Clock, MapPin, ShieldCheck, UserRound } from "lucide-react";

import { classificarResposta, parseDateBR, type Visit } from "@/lib/report-parser";
import { GERENTES_AREA_A, gerenteAreaACanonico } from "@/lib/gerentes-area-a";
import { formatarDuracao } from "@/components/QualidadeTempoSupervisores";

type LinhaPosto = {
  posto: string;
  visitas: number;
  minutos: number;
  mediaMin: number | null;
  qualidade: number;
  ultima: string;
};

type BlocoGerente = {
  gerente: string;
  visitas: number;
  postos: number;
  minutos: number;
  mediaMin: number | null;
  qualidade: number;
  conformes: number;
  naoConformes: number;
  ultima: string;
  linhas: LinhaPosto[];
};

function duracaoValida(v: Visit): number | null {
  return typeof v.duracaoMin === "number" && v.duracaoMin > 0 && v.duracaoMin < 24 * 60
    ? v.duracaoMin
    : null;
}

function contar(v: Visit) {
  let conformes = 0;
  let naoConformes = 0;
  for (const r of v.respostas) {
    const classe = classificarResposta(r.answer, r.question);
    if (classe === "conforme") conformes += 1;
    else if (classe === "nao_conforme") naoConformes += 1;
  }
  return { conformes, naoConformes };
}

function dataDe(valor: string | null): string {
  const d = parseDateBR(valor);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function maisRecente(vs: Visit[]): string {
  let melhor: Date | null = null;
  for (const v of vs) {
    const d = parseDateBR(v.inicio ?? v.fim);
    if (d && (!melhor || d > melhor)) melhor = d;
  }
  return melhor ? melhor.toLocaleDateString("pt-BR") : "—";
}

function tomQualidade(pct: number) {
  if (pct >= 90) return "bg-success/15 text-success";
  if (pct >= 70) return "bg-accent/15 text-accent";
  return "bg-destructive/15 text-destructive";
}

/** Identifica o gerente de área responsável pela visita. */
function gerenteDe(v: Visit): string | null {
  return (
    gerenteAreaACanonico(v.responsavel ?? "") ??
    gerenteAreaACanonico(v.posto ?? "") ??
    gerenteAreaACanonico(v.local ?? "") ??
    gerenteAreaACanonico(v.cliente ?? "")
  );
}

function agregar(vs: Visit[]) {
  let conformes = 0;
  let naoConformes = 0;
  let minutos = 0;
  let comTempo = 0;
  for (const v of vs) {
    const c = contar(v);
    conformes += c.conformes;
    naoConformes += c.naoConformes;
    const d = duracaoValida(v);
    if (d != null) {
      minutos += d;
      comTempo += 1;
    }
  }
  const itens = conformes + naoConformes;
  return {
    conformes,
    naoConformes,
    minutos,
    mediaMin: comTempo > 0 ? Math.round(minutos / comTempo) : null,
    qualidade: itens > 0 ? Math.round((conformes / itens) * 100) : 0,
  };
}

/**
 * Indicadores de performance de cada Gerente de Área A, calculados a partir
 * das visitas importadas no dashboard (Control), detalhados posto a posto.
 */
export function DesempenhoGerentesArea({
  visitas,
  limite,
}: {
  visitas: Visit[];
  limite?: number;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const blocos = useMemo<BlocoGerente[]>(() => {
    const porGerente = new Map<string, Visit[]>();
    for (const nome of GERENTES_AREA_A) porGerente.set(nome, []);
    for (const v of visitas) {
      const g = gerenteDe(v);
      if (!g) continue;
      porGerente.get(g)?.push(v);
    }

    return Array.from(porGerente, ([gerente, vs]) => {
      const total = agregar(vs);
      const porPosto = new Map<string, Visit[]>();
      for (const v of vs) {
        const posto = (v.posto || v.local || v.cliente || "").trim() || "Posto não informado";
        const lista = porPosto.get(posto) ?? [];
        lista.push(v);
        porPosto.set(posto, lista);
      }
      const linhas: LinhaPosto[] = Array.from(porPosto, ([posto, lista]) => {
        const a = agregar(lista);
        return {
          posto,
          visitas: lista.length,
          minutos: a.minutos,
          mediaMin: a.mediaMin,
          qualidade: a.qualidade,
          ultima: maisRecente(lista),
        };
      }).sort((a, b) => b.visitas - a.visitas || a.posto.localeCompare(b.posto, "pt-BR"));

      return {
        gerente,
        visitas: vs.length,
        postos: linhas.length,
        minutos: total.minutos,
        mediaMin: total.mediaMin,
        qualidade: total.qualidade,
        conformes: total.conformes,
        naoConformes: total.naoConformes,
        ultima: maisRecente(vs),
        linhas,
      };
    }).sort((a, b) => b.visitas - a.visitas || b.qualidade - a.qualidade);
  }, [visitas]);

  const exibidos = typeof limite === "number" ? blocos.slice(0, limite) : blocos;

  return (
    <div className="panel p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-primary" /> Performance dos Gerentes de Área
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Indicadores alimentados pelos relatórios importados no dashboard: visitas em posto, tempo em
        posto e qualidade de cada gerente de área.
      </p>

      {exibidos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhuma visita importada até agora para calcular a performance.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {exibidos.map((b) => {
            const aberto = abertos.has(b.gerente);
            return (
              <div key={b.gerente} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() =>
                    setAbertos((prev) => {
                      const proximo = new Set(prev);
                      if (proximo.has(b.gerente)) proximo.delete(b.gerente);
                      else proximo.add(b.gerente);
                      return proximo;
                    })
                  }
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "" : "-rotate-90"}`}
                  />
                  <UserRound className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.gerente}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {b.postos} posto(s)
                  </span>
                  <span className="text-xs text-muted-foreground">{b.visitas} visita(s)</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> média {formatarDuracao(b.mediaMin)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tomQualidade(b.qualidade)}`}
                  >
                    {b.qualidade}% qualidade
                  </span>
                </button>

                {aberto && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Tempo total em posto</p>
                        <p className="text-sm font-semibold">{formatarDuracao(b.minutos)}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Itens conformes</p>
                        <p className="text-sm font-semibold text-success">{b.conformes}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Não conformidades</p>
                        <p className="text-sm font-semibold text-destructive">{b.naoConformes}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Última visita</p>
                        <p className="text-sm font-semibold">{b.ultima}</p>
                      </div>
                    </div>

                    {b.linhas.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sem visitas registradas para este gerente no período filtrado.
                      </p>
                    ) : (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1 font-medium">Posto</th>
                              <th className="px-2 py-1 font-medium">Visitas</th>
                              <th className="px-2 py-1 font-medium">Tempo total</th>
                              <th className="px-2 py-1 font-medium">Média por visita</th>
                              <th className="px-2 py-1 font-medium">Qualidade</th>
                              <th className="px-2 py-1 font-medium">Última visita</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.linhas.map((l) => (
                              <tr key={l.posto} className="border-t border-border/60">
                                <td className="px-2 py-1.5">{l.posto}</td>
                                <td className="px-2 py-1.5">{l.visitas}</td>
                                <td className="px-2 py-1.5">{formatarDuracao(l.minutos)}</td>
                                <td className="px-2 py-1.5">{formatarDuracao(l.mediaMin)}</td>
                                <td className="px-2 py-1.5">
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-semibold ${tomQualidade(l.qualidade)}`}
                                  >
                                    {l.qualidade}%
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">{l.ultima}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { dataDe };
