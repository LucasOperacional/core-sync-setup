import { Moon, Sun } from "lucide-react";

import { useTema } from "@/hooks/use-tema";
import { Button } from "@/components/ui/button";

/** Botão para alternar entre tema claro e escuro. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { tema, alternarTema } = useTema();
  const escuro = tema === "escuro";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={alternarTema}
      className={className}
      aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
    >
      {escuro ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      <span className="truncate">{escuro ? "Tema claro" : "Tema escuro"}</span>
    </Button>
  );
}
