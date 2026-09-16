import { useMemo, useState } from "react";
import { ExternalLink, Search, Stethoscope } from "lucide-react";
import { buscarCidAlertas, type CidAlerta } from "@/lib/cid-alertas";

const CORES: Record<CidAlerta["risco"], string> = {
  baixo: "bg-primary/10 text-primary",
  medio: "bg-amber-500/10 text-amber-500",
  alto: "bg-destructive/10 text-destructive",
};

export function CidAlertasTab({ cidAtual }: { cidAtual?: string | undefined }) {
  const [termo, setTermo] = useState("");
  const lista = useMemo(() => buscarCidAlertas(termo), [termo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por CID, doença, sintoma ou grupo (ex.: M54.5, lombar, ansiedade)"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        {cidAtual ? (
          <button
            type="button"
            onClick={() => setTermo(cidAtual)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            Ver CID do atestado analisado ({cidAtual})
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {lista.length} CID(s) na lista de consulta. Use como referência clínica e trabalhista antes
        de validar o atestado — não substitui avaliação médica.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {lista.map((c) => (
          <article key={c.codigo} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Stethoscope className="size-4 text-primary" />
                  {c.codigo} — {c.titulo}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.grupo} · afastamento típico: {c.afastamentoTipico}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES[c.risco]}`}
              >
                risco {c.risco}
              </span>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sintomas
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                  {c.sintomas.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tratamentos / conduta
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                  {c.tratamentos.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-foreground">
              <span className="font-semibold">Atenção: </span>
              {c.atencao}
            </p>

            <div className="flex flex-wrap gap-2">
              {c.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <ExternalLink className="size-3" />
                  {l.rotulo}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
