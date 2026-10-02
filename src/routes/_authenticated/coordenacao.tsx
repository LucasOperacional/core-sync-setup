import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/coordenacao")({
  head: () => ({
    meta: [
      { title: "Coordenação" },
      {
        name: "description",
        content:
          "Central da coordenação com acesso à abertura de vagas e à conferência automática das solicitações.",
      },
      { property: "og:title", content: "Coordenação" },
      {
        property: "og:description",
        content: "Acesse a abertura de vagas e a conferência das solicitações da supervisão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoordenacaoPage,
});

const ATALHOS = [
  { to: "/abertura-de-vagas", label: "ABERTURA DE VAGAS", icon: ShieldCheck },
  { to: "/coordenacao-crt", label: "CRT PARA LANÇAMENTO", icon: ClipboardList },
  { to: "/coordenacao-movimentacoes", label: "MOVIMENTAÇÕES DE POSTO", icon: ArrowRightLeft },
  { to: "/supervisao-campo", label: "SUPERVISÃO EM CAMPO", icon: ListChecks },
  {
    to: "/avaliacao-gerentes",
    label: "FICHA DE AVALIAÇÃO DOS GERENTES DE ÁREA",
    icon: ClipboardCheck,
  },
] as const;

function CoordenacaoPage() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <main className="min-h-screen">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <ShieldCheck className="size-8 text-primary" />
            Coordenação
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl md:flex md:min-h-[calc(100vh-205px)]">
        <div className="border-b border-border px-6 py-3 md:hidden">
          <Button variant="outline" className="w-full justify-between" onClick={() => setMenuAberto((aberto) => !aberto)} aria-expanded={menuAberto} aria-controls="menu-coordenacao">
            <span className="flex items-center gap-2"><Menu className="size-4" /> Menu da coordenação</span>
            {menuAberto ? <X className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
        <aside id="menu-coordenacao" className={`${menuAberto ? "block" : "hidden"} shrink-0 border-b border-border bg-muted/20 px-4 py-6 md:block md:w-72 md:border-b-0 md:border-r md:px-5 md:py-8`}>
          <nav aria-label="Menu da coordenação">
            <p className="mb-4 px-3 text-xs font-semibold uppercase text-muted-foreground">Coordenação</p>
            <div className="space-y-1">
              {ATALHOS.map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  onClick={() => setMenuAberto(false)}
                  className="group flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium leading-snug text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <a.icon className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">{a.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </nav>
        </aside>
        <section className="flex min-h-64 flex-1 flex-col justify-center px-6 py-12 md:px-12" aria-labelledby="titulo-central">
          <ShieldCheck className="mb-6 size-10 text-primary" strokeWidth={1.5} />
          <h2 id="titulo-central" className="font-display text-2xl font-semibold text-foreground">Central da Coordenação</h2>
          <p className="mt-2 text-sm text-muted-foreground">Selecione uma área no menu lateral.</p>
        </section>
      </div>
    </main>
  );
}
