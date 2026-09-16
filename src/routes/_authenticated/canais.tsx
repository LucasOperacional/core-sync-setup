import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/canais")({
  head: () => ({
    meta: [{ title: "Canais" }, { name: "description", content: "Canais de comunicação." }],
  }),
  component: CanaisPage,
});

function CanaisPage() {
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
          <Radio className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Canais</h1>
            <p className="mt-1 text-sm text-muted-foreground">Canais de comunicação do sistema.</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <Radio className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum canal configurado.</p>
        </div>
      </div>
    </main>
  );
}
