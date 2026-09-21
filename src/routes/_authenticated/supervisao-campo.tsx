import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ListChecks } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { ChecklistAutomaticoCard } from "@/components/ChecklistAutomaticoCard";
import { RelatoriosVisitaCoordenacaoCard } from "@/components/RelatoriosVisitaCoordenacaoCard";
import { PostosServicoMapaCard } from "@/components/PostosServicoMapaCard";

export const Route = createFileRoute("/_authenticated/supervisao-campo")({
  head: () => ({
    meta: [
      { title: "Supervisão em Campo | Coordenação" },
      {
        name: "description",
        content:
          "Acesse o checklist automático e os relatórios de visita de campo enviados pela supervisão.",
      },
      { property: "og:title", content: "Supervisão em Campo | Coordenação" },
      {
        property: "og:description",
        content: "Checklist automático e relatórios de visita de campo em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisaoCampoPage,
});

function SupervisaoCampoPage() {
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
            Supervisão em Campo
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <ChecklistAutomaticoCard />
          <RelatoriosVisitaCoordenacaoCard />
        </div>
        <PostosServicoMapaCard />
      </div>

      <FloatingNav />
    </main>
  );
}
