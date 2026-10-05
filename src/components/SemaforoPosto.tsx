import { cn } from "@/lib/utils";
import { semaforoDe, type Semaforo } from "@/lib/visitas-semaforo";

const DOT: Record<Semaforo, string> = {
  verde: "bg-green-500",
  amarelo: "bg-yellow-500",
  vermelho: "bg-red-500",
};

/**
 * Bolinha de cor + quantidade de visitas do posto.
 * Regra única do sistema: até 2 = verde, 3 a 4 = amarelo, 5 ou mais = vermelho.
 */
export function SemaforoPosto({
  qtd,
  className,
}: {
  qtd: number | null | undefined;
  className?: string;
}) {
  if (qtd === null || qtd === undefined) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  const cor = semaforoDe(qtd);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <span className={cn("size-2.5 rounded-full", DOT[cor])} />
      {qtd} {qtd === 1 ? "visita" : "visitas"}
    </span>
  );
}

/** Só a bolinha, para usar dentro de tabelas e títulos. */
export function BolinhaSemaforo({ qtd, className }: { qtd: number | null | undefined; className?: string }) {
  const cor = qtd === null || qtd === undefined ? null : semaforoDe(qtd);
  if (!cor) return <span className={cn("size-2.5 rounded-full bg-muted", className)} />;
  return <span className={cn("size-2.5 rounded-full", DOT[cor], className)} />;
}
