import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardCheck, MapPin, TriangleAlert, UserRound } from "lucide-react";

import { GERENTES_AREA_A } from "@/lib/gerentes-area-a";
import { slugifyGerente } from "@/lib/use-visits";
import type { ResumoVisitas } from "@/lib/nexti-visitas";

type CardGerente = {
  nome: string;
  visitas: number;
  postos: number;
  respostas: number;
  conformes: number;
  naoConformes: number;
  conformidade: number;
  ultimaVisita: string | null;
  piorPergunta: string | null;
  clientes: number;
  visitasPorLocal: { posto: string; visitas: number }[];
};

function formatarData(iso: string | null) {
  if (!iso) return "sem visita";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "sem visita" : d.toLocaleDateString("pt-BR");
}

export function GerentesAreaACards({
  resumo,
  gerenteAtivo,
  onSelecionar,
}: {
  resumo: ResumoVisitas;
  gerenteAtivo?: string;
  onSelecionar?: (nome: string) => void;
}) {
  const cards = useMemo<CardGerente[]>(() => {
    return GERENTES_AREA_A.map((nome) => {
      const visitas = resumo.visitas.filter((v) => v.supervisor === nome);
      const grupo = resumo.perguntasPorGerente.find((g) => g.nome === nome);
      const conformes = visitas.reduce((a, v) => a + v.conformes, 0);
      const naoConformes = visitas.reduce((a, v) => a + v.naoConformes, 0);
      const respostas = conformes + naoConformes;
      const piorPergunta = grupo?.perguntas.find((p) => p.naoConformes > 0)?.pergunta ?? null;
      const contagemLocais = new Map<string, number>();
      for (const v of visitas) {
        const posto = (v.posto || "").trim() || "Posto não informado";
        contagemLocais.set(posto, (contagemLocais.get(posto) ?? 0) + 1);
      }
      const visitasPorLocal = Array.from(contagemLocais, ([posto, qtd]) => ({
        posto,
        visitas: qtd,
      })).sort((a, b) => b.visitas - a.visitas || a.posto.localeCompare(b.posto, "pt-BR"));
      return {
        visitasPorLocal,
        nome,
        visitas: visitas.length,
        postos: new Set(visitas.map((v) => v.posto).filter(Boolean)).size,
        clientes: new Set(visitas.map((v) => v.cliente).filter(Boolean)).size,
        respostas,
        conformes,
        naoConformes,
        conformidade: respostas ? Math.round((conformes / respostas) * 100) : 0,
        ultimaVisita:
          visitas
            .map((v) => v.data)
            .filter((d): d is string => Boolean(d))
            .sort((a, b) => b.localeCompare(a))[0] ?? null,
        piorPergunta,
      };
    }).sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [resumo]);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Gerentes de Área A · Realizador da tarefa</h3>
        <p className="text-xs text-muted-foreground">
          Um card por gerente com visitas, postos, conformidade e não conformidades no período
          filtrado. Clique no card para abrir os relatórios de visita por posto; use "Filtrar aqui"
          para filtrar as perguntas abaixo.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((g) => {
          const ativo = gerenteAtivo === g.nome;
          return (
            <div
              key={g.nome}
              className={`panel flex flex-col gap-3 p-4 text-left transition-colors ${
                ativo ? "border-primary" : "hover:border-primary/60"
              }`}
            >
              <Link
                to="/relatorios-gerente/$slug"
                params={{ slug: slugifyGerente(g.nome) }}
                className="flex flex-col gap-3"
              >
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                    <UserRound className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-semibold leading-snug">{g.nome}</h4>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Cargo: Gerente de Área A
                    </p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold">{g.visitas}</span>
                  <span className="text-xs text-muted-foreground">visita(s)</span>
                  <span
                    className={`ml-auto rounded-md px-2 py-1 text-xs font-semibold ${
                      g.conformidade >= 90
                        ? "bg-success/15 text-success"
                        : g.conformidade >= 70
                          ? "bg-accent/15 text-accent"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {g.conformidade}%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full ${g.conformidade >= 70 ? "bg-success" : "bg-destructive"}`}
                    style={{ width: `${g.conformidade}%` }}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3" /> {g.postos} posto(s)
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ClipboardCheck className="size-3" /> {g.respostas} resposta(s)
                  </div>
                  <div className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3" /> {g.conformes} conforme(s)
                  </div>
                  <div className="flex items-center gap-1 font-semibold text-destructive">
                    <TriangleAlert className="size-3" /> {g.naoConformes} N/C
                  </div>
                </dl>

                <p className="text-[11px] text-muted-foreground">
                  {g.clientes} cliente(s) · última visita {formatarData(g.ultimaVisita)}
                </p>

                <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/30 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Visitas por local ({g.visitasPorLocal.length})
                  </p>
                  {g.visitasPorLocal.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Nenhum local visitado.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {g.visitasPorLocal.slice(0, 5).map((l) => (
                        <li key={l.posto} className="flex items-center gap-2 text-[11px]">
                          <span className="truncate text-muted-foreground">{l.posto}</span>
                          <span className="ml-auto shrink-0 rounded bg-primary/15 px-1.5 font-semibold text-primary">
                            {l.visitas}
                          </span>
                        </li>
                      ))}
                      {g.visitasPorLocal.length > 5 ? (
                        <li className="text-[10px] text-muted-foreground">
                          +{g.visitasPorLocal.length - 5} outro(s) local(is)
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>

                {g.piorPergunta ? (
                  <p className="line-clamp-2 text-[11px] text-destructive">
                    Atenção: {g.piorPergunta}
                  </p>
                ) : (
                  <p className="text-[11px] text-success">Sem não conformidades no período.</p>
                )}
              </Link>

              <button
                type="button"
                onClick={() => onSelecionar?.(ativo ? "TODOS" : g.nome)}
                className={`mt-auto rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  ativo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {ativo ? "Filtro ativo · limpar" : "Filtrar aqui"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
