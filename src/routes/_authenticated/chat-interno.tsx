import { createFileRoute, Link } from "@tanstack/react-router";
import { ChatInterno } from "@/components/ChatInterno";
import { FloatingNav } from "@/components/FloatingNav";
import { Home } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat-interno")({
  head: () => ({
    meta: [
      { title: "Chat Interno" },
      {
        name: "description",
        content:
          "Chat em tempo real entre os membros da equipe. Sala geral, conversas privadas, emojis e envio de arquivos.",
      },
    ],
  }),
  component: ChatInternoPage,
});

function ChatInternoPage() {
  return (
    <main className="min-h-screen pb-24 flex flex-col">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">Chat Interno</h1>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Home className="size-4" />
              Painel Inicial
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Converse com a equipe em tempo real.</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        <ChatInterno />
      </div>

      <FloatingNav />
    </main>
  );
}
