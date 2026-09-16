import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Trash2 } from "lucide-react";
import {
  GEMINI_LOG_EVENT,
  lerLogGemini,
  limparLogGemini,
  resumirLogGemini,
  type GeminiChamadaLog,
} from "@/lib/gemini-log";

function ms(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`;
}

export function GeminiLeiturasTab() {
  const [itens, setItens] = useState<GeminiChamadaLog[]>([]);
  const [filtro, setFiltro] = useState<"todas" | "ok" | "erro">("todas");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    setItens(lerLogGemini());
    const sync = () => setItens(lerLogGemini());
    window.addEventListener(GEMINI_LOG_EVENT, sync);
    return () => window.removeEventListener(GEMINI_LOG_EVENT, sync);
  }, []);

  const resumo = useMemo(() => resumirLogGemini(itens), [itens]);
  const lista = useMemo(
    () => itens.filter((i) => (filtro === "ok" ? i.ok : filtro === "erro" ? !i.ok : true)),
    [itens, filtro],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { r: "Chamadas", v: String(resumo.total) },
          { r: "Sucessos", v: String(resumo.sucessos) },
          { r: "Falhas", v: String(resumo.falhas) },
          { r: "Em cache", v: String(resumo.cacheados) },
          { r: "Tempo médio", v: ms(resumo.tempoMedioMs) },
          { r: "Tokens", v: resumo.tokens.toLocaleString("pt-BR") },
        ].map((c) => (
          <div key={c.r} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.r}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{c.v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["todas", "ok", "erro"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "todas" ? "Todas" : f === "ok" ? "Sucesso" : "Com erro"}
            </button>
          ))}
        </div>
        {itens.length > 0 ? (
          <button
            type="button"
            onClick={() => setItens(limparLogGemini())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Trash2 className="size-3.5" />
            Limpar registros
          </button>
        ) : null}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
          Nenhuma chamada registrada ainda. Analise um atestado ou use a IA para ver o monitoramento
          aqui.
        </p>
      ) : null}

      {lista.map((i) => (
        <article key={i.id} className="rounded-xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setAberto(aberto === i.id ? null : i.id)}
            className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {i.ok ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <AlertTriangle className="size-4 text-destructive" />
                )}
                <span className="truncate">{i.rotulo}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(i.inicio).toLocaleString("pt-BR")} · {i.modelo} · HTTP {i.status || "—"} ·{" "}
                {i.promptChars.toLocaleString("pt-BR")} caracteres
                {i.temImagem ? " · com imagem" : ""}
                {i.tentativas > 1 ? ` · ${i.tentativas} tentativa(s)` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {i.cached ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  cache
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                {ms(i.duracaoMs)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  i.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                }`}
              >
                {i.ok ? "Sucesso" : "Erro"}
              </span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${
                  aberto === i.id ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {aberto === i.id ? (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Tokens: {i.promptTokens} entrada / {i.completionTokens} saída
              </p>
              {i.erro ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {i.erro}
                </p>
              ) : (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-xs text-foreground">
                  {i.resposta || "(resposta vazia)"}
                </pre>
              )}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
