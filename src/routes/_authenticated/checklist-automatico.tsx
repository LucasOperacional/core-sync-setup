import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ListChecks } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { ChecklistAutomaticoCard } from "@/components/ChecklistAutomaticoCard";

export const Route = createFileRoute("/_authenticated/checklist-automatico")({
  head: () => ({
    meta: [
      { title: "Checklist automático | Coordenação" },
      {
        name: "description",
        content:
          "Monte o checklist de visita por função, edite as perguntas e imprima o roteiro completo da supervisão.",
      },
      { property: "og:title", content: "Checklist automático | Coordenação" },
      {
        property: "og:description",
        content:
          "Checklist de supervisão montado automaticamente por função, com edição e impressão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChecklistAutomaticoPage,
});

function ChecklistAutomaticoPage() {
  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Link
            to="/coordenacao"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar à Coordenação
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <ListChecks className="size-8 text-primary" />
            Checklist automático
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <ChecklistAutomaticoCard />
      </div>

      <FloatingNav />
    </main>
  );
}
