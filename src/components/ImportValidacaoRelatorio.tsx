import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { RelatorioArquivo } from "@/lib/import-validacao";

const ESTILO = {
  ok: "border-emerald-500/30 bg-emerald-500/5",
  aviso: "border-amber-500/30 bg-amber-500/5",
  erro: "border-destructive/30 bg-destructive/5",
} as const;

function Icone({ status }: { status: RelatorioArquivo["status"] }) {
  if (status === "ok") return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />;
  if (status === "aviso") return <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />;
  return <XCircle className="size-3.5 shrink-0 text-destructive" />;
}

/** Relatório de conferência arquivo por arquivo da importação. */
export function ImportValidacaoRelatorio({ relatorios }: { relatorios: RelatorioArquivo[] }) {
  if (relatorios.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conferência dos arquivos
      </p>
      {relatorios.map((r) => (
        <div key={`${r.arquivo}-${r.tamanho}`} className={`rounded-lg border p-3 ${ESTILO[r.status]}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Icone status={r.status} />
            <span className="font-semibold text-foreground">{r.arquivo}</span>
            <span className="ml-auto text-muted-foreground">
              {r.status === "erro"
                ? "não importado"
                : `${r.novas} nova(s) de ${r.linhas} linha(s)`}
            </span>
          </div>
          {r.reconhecidas.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Colunas reconhecidas: {r.reconhecidas.join(", ")}
            </p>
          )}
          {r.mensagens.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {r.mensagens.map((m, i) => (
                <li key={i} className={r.status === "erro" ? "text-destructive" : "text-amber-500"}>
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
