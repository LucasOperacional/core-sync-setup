import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { RoteiroVisitaCampo } from "@/components/RoteiroVisitaCampo";

export type BuscaSupervisaoCampo = {
  posto?: number | undefined;
  nome?: string | undefined;
  iniciar?: boolean | undefined;
};

export const Route = createFileRoute("/_authenticated/supervisor-campo")({
  // Permite abrir a página já com o posto da chegada e o cronômetro ligado.
  validateSearch: (busca: Record<string, unknown>): BuscaSupervisaoCampo => ({
    posto: Number.isFinite(Number(busca["posto"])) ? Number(busca["posto"]) : undefined,
    nome: typeof busca["nome"] === "string" ? busca["nome"] : undefined,
    iniciar: busca["iniciar"] === true || busca["iniciar"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Roteiro de Visitas | Supervisão de Campo" },
      {
        name: "description",
        content:
          "Roteiro de visitas para supervisores de facilities com checklists de auxiliar de limpeza, porteiro e vigia.",
      },
      { property: "og:title", content: "Roteiro de Visitas | Supervisão de Campo" },
      {
        property: "og:description",
        content:
          "Checklists de supervisão de campo por função: auxiliar de limpeza, porteiro e vigia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupervisorCampoPage,
});

function SupervisorCampoPage() {
  return (
    <main className="min-h-screen flex flex-col pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap flex-col gap-6 px-6 py-10">
          <Link
            to="/supervisor"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar à Supervisão
          </Link>
          <div>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl text-foreground">
              SUPERVISÃO DE CAMPO
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Controle de visita técnica integrado aos postos da NEXTI, com checklists de porteiro,
              vigia e auxiliar de limpeza.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <RoteiroVisitaCampo />
      </div>
      <FloatingNav />
    </main>
  );
}
