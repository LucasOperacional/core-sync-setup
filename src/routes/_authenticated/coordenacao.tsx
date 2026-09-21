import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRightLeft,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

import { FloatingNav } from "@/components/FloatingNav";
import { RelatoriosVisitaCoordenacaoCard } from "@/components/RelatoriosVisitaCoordenacaoCard";
import { PostosServicoMapaCard } from "@/components/PostosServicoMapaCard";

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
  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
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

      <nav
        aria-label="Atalhos da coordenação"
        className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
          {ATALHOS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
            >
              <a.icon className="size-4" />
              {a.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto mt-8 max-w-7xl space-y-8 px-4">
        <RelatoriosVisitaCoordenacaoCard />
        <PostosServicoMapaCard />
      </div>

      <FloatingNav />
    </main>
  );
}
