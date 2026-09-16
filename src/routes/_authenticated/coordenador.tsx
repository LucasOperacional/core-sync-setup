import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Plus, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingNav } from "@/components/FloatingNav";

export const Route = createFileRoute("/_authenticated/coordenador")({
  head: () => ({
    meta: [
      { title: "Coordenador | Painel de Coordenação" },
      {
        name: "description",
        content: "Gestão e controle de operações da coordenação.",
      },
    ],
  }),
  component: CoordenadorPage,
});

function CoordenadorPage() {
  const [controlesAberto, setControlesAberto] = useState(true);

  return (
    <main className="min-h-screen flex flex-col pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Painel Inicial
            </Link>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">COORDENADOR</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Gestão, controles e exportação de dados da coordenação.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        <section className="panel overflow-hidden">
          <button
            type="button"
            onClick={() => setControlesAberto((v) => !v)}
            aria-expanded={controlesAberto}
            className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-accent/50"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckSquare className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold">Apoio à Supervisão</span>
              <span className="block text-xs text-muted-foreground">
                Ferramentas complementares para controle manual e exportação geral.
              </span>
            </span>
            {controlesAberto ? (
              <ChevronUp className="size-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-5 text-muted-foreground" />
            )}
          </button>
          {controlesAberto ? (
            <div className="border-t border-border p-5">
              <p className="text-sm text-muted-foreground">
                Os botões de exportação do relatório foram movidos para a página de Aprovação de
                Vagas.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <FloatingNav />
    </main>
  );
}
