import { ArrowLeft } from "lucide-react";
import { useRouter, useRouterState } from "@tanstack/react-router";

/** Rotas onde o botão de voltar não faz sentido (tela inicial e login). */
const ROTAS_SEM_VOLTAR = ["/", "/auth"];

/**
 * Botão flutuante de voltar, exibido em todas as páginas.
 * Volta no histórico quando possível; caso contrário vai para o painel inicial.
 */
export function BotaoVoltar() {
  const router = useRouter();
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  if (ROTAS_SEM_VOLTAR.includes(caminho)) return null;

  const voltar = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    void router.navigate({ to: "/" });
  };

  return (
    <button
      type="button"
      onClick={voltar}
      aria-label="Voltar"
      title="Voltar"
      className="fixed left-4 top-4 z-50 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
