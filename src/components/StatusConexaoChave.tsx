import { CheckCircle2, Loader2, PlugZap, Save, TriangleAlert } from "lucide-react";
import type { ConexaoEstado } from "@/hooks/useAutoConexaoChave";

/**
 * Selo de status da chave de API: salvamento automático + conexão verificada.
 */
export function StatusConexaoChave({
  estado,
  erro,
  verificadoEm,
  className = "",
}: {
  estado: ConexaoEstado;
  erro?: string | null;
  verificadoEm?: number | null;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium";

  if (estado === "conectado") {
    return (
      <span
        className={`${base} border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ${className}`}
        title={
          verificadoEm
            ? `Verificada às ${new Date(verificadoEm).toLocaleTimeString("pt-BR")}`
            : undefined
        }
      >
        <CheckCircle2 className="size-3.5" />
        Conexão estabelecida — chave salva
      </span>
    );
  }

  if (estado === "salvando") {
    return (
      <span className={`${base} border-border bg-muted text-muted-foreground ${className}`}>
        <Save className="size-3.5" />
        Salvando chave...
      </span>
    );
  }

  if (estado === "verificando") {
    return (
      <span
        className={`${base} border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 ${className}`}
      >
        <Loader2 className="size-3.5 animate-spin" />
        Verificando conexão...
      </span>
    );
  }

  if (estado === "erro") {
    return (
      <span
        className={`${base} border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 ${className}`}
        title={erro ?? undefined}
      >
        <TriangleAlert className="size-3.5" />
        Chave salva, sem conexão
      </span>
    );
  }

  if (estado === "curta") {
    return (
      <span className={`${base} border-border bg-muted text-muted-foreground ${className}`}>
        <PlugZap className="size-3.5" />
        Continue digitando a chave
      </span>
    );
  }

  return (
    <span className={`${base} border-border bg-muted text-muted-foreground ${className}`}>
      <PlugZap className="size-3.5" />
      Nenhuma chave configurada
    </span>
  );
}
