import { useMemo, useState } from "react";
import { ChevronDown, Clock, MapPin } from "lucide-react";

import { classificarResposta, parseDateBR, type Visit } from "@/lib/report-parser";

type LinhaPosto = {
  posto: string;
  visitas: number;
  minutos: number;
  qualidade: number;
  itens: number;
  naoConformes: number;
  detalhes: {
    id: string;
    data: string;
    inicio: string;
    fim: string;
    duracao: number | null;
    qualidade: number;
  }[];
};

type LinhaSupervisor = {
  nome: string;
  visitas: number;
  minutos: number;
  mediaMin: number | null;
  menorMin: number | null;
  maiorMin: number | null;
  qualidade: number;
  itens: number;
  naoConformes: number;
  postos: LinhaPosto[];
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

export function QualidadeTempoSupervisores({ visitas }: { visitas: Visit[] }) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  const linhas = useMemo<LinhaSupervisor[]>(() => {
    const porSupervisor = new Map<string, Visit[]>();
    for (const v of visitas) {
      const nome = v.responsavel.trim() || "Não informado";
      const lista = porSupervisor.get(nome) ?? [];
      lista.push(v);
      porSupervisor.set(nome, lista);
    }

    return Array.from(porSupervisor.entries())
      .map(([nome, lista]) => {
        const duracoes = lista.map(duracaoValida).filter((d): d is number => d != null);
        let itens = 0;
        let naoConformes = 0;

        const porPosto = new Map<string, Visit[]>();
        for (const v of lista) {
          const c = contar(v);
          itens += c.itens;
          naoConformes += c.naoConformes;
          const posto = (v.posto || v.local || v.cliente).trim() || "Posto não informado";
          const arr = porPosto.get(posto) ?? [];
          arr.push(v);
          porPosto.set(posto, arr);
        }

        const postos: LinhaPosto[] = Array.from(porPosto.entries())
          .map(([posto, vs]) => {
            let pItens = 0;
            let pNao = 0;
            let minutos = 0;
            const detalhes = vs
              .slice()
              .sort(
                (a, b) =>
                  (parseDateBR(b.inicio)?.getTime() ?? 0) - (parseDateBR(a.inicio)?.getTime() ?? 0),
              )
              .map((v) => {
                const c = contar(v);
                pItens += c.itens;
                pNao += c.naoConformes;
                const dur = duracaoValida(v);
                if (dur) minutos += dur;
                return {
                  id: v.id,
                  data: dataDe(v.inicio),
                  inicio: horaDe(v.inicio),
                  fim: horaDe(v.fim),
                  duracao: dur,
                  qualidade: c.itens > 0 ? Math.round((c.conformes / c.itens) * 100) : 0,
                };
              });
            return {
              posto,
              visitas: vs.length,
              minutos,
              itens: pItens,
              naoConformes: pNao,
              qualidade: pItens > 0 ? Math.round(((pItens - pNao) / pItens) * 100) : 0,
              detalhes,
            };
          })
          .sort((a, b) => b.visitas - a.visitas || a.posto.localeCompare(b.posto, "pt-BR"));

        return {
          nome,
          visitas: lista.length,
          minutos: duracoes.reduce((a, b) => a + b, 0),
          mediaMin: duracoes.length
            ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
            : null,
          menorMin: duracoes.length ? Math.min(...duracoes) : null,
          maiorMin: duracoes.length ? Math.max(...duracoes) : null,
          itens,
          naoConformes,
          qualidade: itens > 0 ? Math.round(((itens - naoConformes) / itens) * 100) : 0,
          postos,
        };
      })
      .sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [visitas]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 size-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Qualidade e tempo por supervisor</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Percentual de qualidade das visitas e o tempo exato gasto por cada supervisor em cada
            posto. Clique no supervisor para ver posto a posto, com horário de entrada e saída.
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Nenhuma visita no filtro selecionado.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {linhas.map((s) => {
            const expandido = !fechados.has(s.nome);
            return (
              <li key={s.nome} className="rounded-xl border border-border/70">
                <button
                  type="button"
                  onClick={() =>
                    setFechados((prev) => {
                      const next = new Set(prev);
                      if (expandido) next.add(s.nome);
                      else next.delete(s.nome);
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
                  <span className="min-w-[10rem] flex-1 text-xs font-semibold">{s.nome}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {s.visitas} visita(s) · {s.postos.length} posto(s)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Total {formatarDuracao(s.minutos || null)} · média{" "}
                    {formatarDuracao(s.mediaMin)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Menor {formatarDuracao(s.menorMin)} · maior {formatarDuracao(s.maiorMin)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${tomQualidade(s.qualidade)}`}
                  >
                    {s.qualidade}% qualidade
                  </span>
                </button>

                {expandido ? (
                  <div className="space-y-3 border-t border-border/70 p-3">
                    {s.postos.map((p) => (
                      <div key={p.posto} className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <MapPin className="size-3 text-primary" />
                          <span className="text-[11px] font-semibold">{p.posto}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {p.visitas} visita(s) · tempo total {formatarDuracao(p.minutos || null)}
                          </span>
                          <span
                            className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-semibold ${tomQualidade(p.qualidade)}`}
                          >
                            {p.qualidade}%
                          </span>
                        </div>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[30rem] text-left text-[11px]">
                            <thead className="text-muted-foreground">
                              <tr className="border-b border-border/60">
                                <th className="py-1 pr-3 font-medium">Data</th>
                                <th className="py-1 pr-3 font-medium">Entrada</th>
                                <th className="py-1 pr-3 font-medium">Saída</th>
                                <th className="py-1 pr-3 font-medium">Tempo no posto</th>
                                <th className="py-1 font-medium">Qualidade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.detalhes.map((d) => (
                                <tr key={d.id} className="border-b border-border/40 last:border-0">
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.data}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.inicio}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">{d.fim}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">
                                    {formatarDuracao(d.duracao)}
                                  </td>
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
