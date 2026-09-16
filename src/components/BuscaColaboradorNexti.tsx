import { Link } from "@tanstack/react-router";
import { UserSearch } from "lucide-react";

/**
 * Card clicável que redireciona o usuário para a página dedicada de pesquisa de colaboradores na NEXTI.
 */
export function BuscaColaboradorNexti() {
  return (
    <Link
      to="/pesquisa-colaborador-nexti"
      className="panel flex h-full min-h-[160px] flex-col gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-primary"
    >
      <div className="flex flex-col gap-3 h-full w-full">
        <span className="flex mx-auto size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserSearch className="size-5" />
        </span>
        <div className="w-full flex-1">
          <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
            PESQUISAR COLABORADOR · NEXTI
          </span>
          <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
            Acesse a página de pesquisa para filtrar colaboradores, cargo, posto e empresa.
            Sincronização automática com a NEXTI.
          </span>
        </div>
      </div>
    </Link>
  );
}
