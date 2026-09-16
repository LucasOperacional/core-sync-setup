import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin } from "lucide-react";
import { RastreioSupervisoresCard } from "@/components/RastreioSupervisoresCard";
import { CompartilharLocalizacaoCard } from "@/components/CompartilharLocalizacaoCard";
import { RelatorioAcompanhamentoCard } from "@/components/RelatorioAcompanhamentoCard";

export const Route = createFileRoute("/_authenticated/gps")({
  head: () => ({
    meta: [
      { title: "GPS | Rastreamento em tempo real" },
      {
        name: "description",
        content:
          "Monitoramento em tempo real da localização dos supervisores via GPS e rede 4G/5G.",
      },
      { property: "og:title", content: "GPS | Rastreamento em tempo real" },
      {
        property: "og:description",
        content: "Acompanhe a posição dos supervisores no mapa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GpsPage,
});

function GpsPage() {
  return (
    <main className="min-h-screen">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Painel Inicial
            </Link>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold uppercase sm:text-4xl">
              <MapPin className="size-8 text-primary" />
              GPS
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Rastreamento em tempo real dos supervisores. A posição é enviada pelo celular via GPS
              + rede 4G/5G e atualizada automaticamente a cada 20 segundos.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        <CompartilharLocalizacaoCard />
        <RastreioSupervisoresCard />
        <RelatorioAcompanhamentoCard />
      </div>
    </main>
  );
}
