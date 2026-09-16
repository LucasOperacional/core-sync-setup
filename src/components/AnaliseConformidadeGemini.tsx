import { useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, CheckCircle2, Info, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import {
  analisarConformidadeGemini,
  type AnaliseConformidadeGemini as Analise,
} from "@/lib/analise-conformidade.functions";
import type { PerguntaResumo } from "@/lib/nexti-visitas";

type ItemEntrada = { pergunta: string; resposta: string; quantidade: number };

const chave = (p: string, r: string) => `${p.trim().toUpperCase()}||${r.trim().toUpperCase()}`;

function montarItens(perguntas: PerguntaResumo[]): ItemEntrada[] {
  const itens: ItemEntrada[] = [];
  for (const p of perguntas) {
    for (const r of p.respostas) {
      itens.push({ pergunta: p.pergunta, resposta: r.resposta, quantidade: r.quantidade });
    }
  }
  return itens.sort((a, b) => b.quantidade - a.quantidade).slice(0, 120);
}

const CORES = {
  conforme: "bg-success/15 text-success",
  nao_conforme: "bg-destructive/15 text-destructive",
  neutro: "bg-muted text-muted-foreground",
} as const;

const ROTULOS = {
  conforme: "Conforme",
  nao_conforme: "Não conforme",
  neutro: "Neutro / não aplicável",
} as const;

export function AnaliseConformidadeGemini({
  perguntas,
  contexto,
}: {
  perguntas: PerguntaResumo[];
  contexto: string;
}) {
  const analisar = useServerFn(analisarConformidadeGemini);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const itens = useMemo(() => montarItens(perguntas), [perguntas]);

  const executar = useCallback(async () => {
    if (!itens.length) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await analisar({ data: { itens, contexto } });
      setAnalise(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na análise com Gemini.");
    } finally {
      setCarregando(false);
    }
  }, [analisar, itens, contexto]);

  const totais = useMemo(() => {
    if (!analise) return null;
    const mapa = new Map(itens.map((i) => [chave(i.pergunta, i.resposta), i.quantidade]));
    let conformes = 0;
    let naoConformes = 0;
    let neutros = 0;
    for (const c of analise.classificacoes) {
      const q = mapa.get(chave(c.pergunta, c.resposta)) ?? 0;
      if (c.classificacao === "conforme") conformes += q;
      else if (c.classificacao === "nao_conforme") naoConformes += q;
      else neutros += q;
    }
    const base = conformes + naoConformes;
    return {
      conformes,
      naoConformes,
      neutros,
      taxa: base ? Math.round((conformes / base) * 100) : 0,
    };
  }, [analise, itens]);

  const criticas = useMemo(
    () =>
      (analise?.classificacoes ?? [])
        .filter((c) => c.classificacao === "nao_conforme")
        .sort((a, b) => {
          const ordem = { alta: 3, media: 2, baixa: 1, nenhuma: 0 } as const;
          return ordem[b.severidade] - ordem[a.severidade];
        }),
    [analise],
  );

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent">
            <Brain className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Análise de conformidade com Gemini</h3>
            <p className="text-xs text-muted-foreground">
              O Gemini lê cada pergunta e resposta do NEXTI CONTROL 2.0 e separa o que é
              conformidade, não conformidade e resposta neutra (não aplicável) — {itens.length}{" "}
              combinação(ões) de resposta.
            </p>
            {analise ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Modelo: {analise.modelo}</p>
            ) : null}
            {erro ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <TriangleAlert className="size-3" /> {erro}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void executar()}
          disabled={carregando || !itens.length}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {carregando ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {analise ? "Reanalisar com Gemini" : "Analisar com Gemini"}
        </button>
      </div>

      {totais ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Conformidade revisada</p>
            <p className="mt-1 font-display text-2xl font-bold text-primary">{totais.taxa}%</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Respostas conformes</p>
            <p className="mt-1 font-display text-2xl font-bold text-success">{totais.conformes}</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Não conformidades reais</p>
            <p className="mt-1 font-display text-2xl font-bold text-destructive">
              {totais.naoConformes}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Neutras (não aplicáveis)</p>
            <p className="mt-1 font-display text-2xl font-bold">{totais.neutros}</p>
          </div>
        </div>
      ) : null}

      {analise?.resumo ? (
        <p className="rounded-lg border border-border bg-secondary/60 p-3 text-sm leading-relaxed">
          {analise.resumo}
        </p>
      ) : null}

      {analise?.prioridades.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ações prioritárias
          </h4>
          <ol className="mt-2 space-y-1 text-sm">
            {analise.prioridades.map((p, i) => (
              <li key={p} className="flex gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                <span className="font-semibold text-primary">{i + 1}.</span> {p}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {criticas.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Não conformidades identificadas
          </h4>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {criticas.slice(0, 12).map((c) => (
              <article
                key={chave(c.pergunta, c.resposta)}
                className="rounded-lg border border-destructive/40 p-3"
              >
                <p className="text-xs font-semibold leading-snug">{c.pergunta}</p>
                <p className="mt-1 text-xs text-destructive">“{c.resposta || "(vazia)"}”</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{c.motivo}</p>
                {c.acao ? <p className="mt-1 text-[11px] font-medium">Ação: {c.acao}</p> : null}
                <span className="mt-2 inline-block rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                  severidade {c.severidade}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {analise ? (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
            Ver classificação completa ({analise.classificacoes.length} resposta(s))
          </summary>
          <ul className="max-h-80 space-y-1 overflow-auto p-3 text-xs">
            {analise.classificacoes.map((c) => (
              <li key={`${chave(c.pergunta, c.resposta)}-lista`} className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${CORES[c.classificacao]}`}
                >
                  {ROTULOS[c.classificacao]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.pergunta}</span>
                  <span className="text-muted-foreground">{c.resposta || "(vazia)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {carregando ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> O Gemini está analisando as respostas...
            </>
          ) : (
            <>
              <Info className="size-3.5" /> Clique em “Analisar com Gemini” para reclassificar
              respostas como conformidade, não conformidade ou neutra.
            </>
          )}
        </p>
      )}

      {!itens.length ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" /> Nenhuma resposta disponível no filtro atual.
        </p>
      ) : null}
    </div>
  );
}
