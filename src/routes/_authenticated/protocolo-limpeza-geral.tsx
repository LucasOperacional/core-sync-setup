import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/protocolo-limpeza-geral")({
  head: () => ({
    meta: [
      { title: "Protocolo de Limpeza Geral" },
      { name: "description", content: "Protocolo de limpeza geral." },
    ],
  }),
  component: ProtocoloLimpezaGeralPage,
});

function ProtocoloLimpezaGeralPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <Sparkles className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Protocolo de Limpeza Geral</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Protocolo de limpeza geral do sistema.
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <Sparkles className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Módulo de limpeza geral.</p>
        </div>
      </div>
    </main>
  );
}
