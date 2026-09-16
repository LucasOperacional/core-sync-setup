import { Link } from "@tanstack/react-router";
import { CalendarX2 } from "lucide-react";

export function ConsultaFaltasPorNome() {
  return (
    <Link
      to="/pesquisa-faltas"
      className="panel flex h-full min-h-[160px] flex-col block gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-orange-500"
    >
      <div className="flex flex-col gap-3 h-full w-full">
        <span className="flex size-11 mx-auto shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
          <CalendarX2 className="size-5" />
        </span>
        <div className="w-full flex-1">
          <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
            FALTAS
          </span>
          <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
            Consulte as faltas dos funcionários importadas no sistema.
          </span>
        </div>
      </div>
    </Link>
  );
}
