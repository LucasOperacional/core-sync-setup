import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { FaltasSemCoberturaTabela } from "@/components/FaltasSemCoberturaTabela";
import { FloatingNav } from "@/components/FloatingNav";

export const Route = createFileRoute("/_authenticated/supervisor-faltas")({
  head: () => ({
    meta: [{ title: "Faltas sem cobertura | Supervisor" }],
  }),
  component: SupervisorFaltasPage,
});

function SupervisorFaltasPage() {
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
              Faltas sem cobertura
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Gestão e alertas de postos operacionais descobertos.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        <div className="panel p-5">
          <FaltasSemCoberturaTabela />
        </div>
      </div>
      <FloatingNav />
    </main>
  );
}
