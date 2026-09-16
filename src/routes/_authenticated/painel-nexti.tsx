import { createFileRoute, Link } from "@tanstack/react-router";
import { PainelNextiCard } from "@/components/PainelNextiCard";

import { FloatingNav } from "@/components/FloatingNav";
import { LayoutDashboard, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel-nexti")({
  head: () => ({
    meta: [
      { title: "Painel NEXTI — Indicadores Operacionais" },
      {
        name: "description",
        content: "Painel de indicadores operacionais sincronizados com a NEXTI.",
      },
      { property: "og:title", content: "Painel NEXTI — Indicadores Operacionais" },
      {
        property: "og:description",
        content: "Painel de indicadores operacionais sincronizados com a NEXTI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PainelNextiPage,
});

function PainelNextiPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12 pb-32">
      <div className="w-full max-w-5xl flex justify-end">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Link>
      </div>
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <LayoutDashboard className="size-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">PAINEL NEXTI</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Indicadores operacionais e filtros sincronizados diretamente com a NEXTI.
        </p>
      </header>

      <div className="w-full max-w-5xl space-y-6">
        <PainelNextiCard />
      </div>

      <FloatingNav />
    </main>
  );
}
