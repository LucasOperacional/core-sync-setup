import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, AlertCircle, FileText, Map, ArrowRightLeft } from "lucide-react";
import { NextiVisitasSupervisao } from "@/components/NextiVisitasSupervisao";
import { MinhasFaltasSupervisorCard } from "@/components/MinhasFaltasSupervisorCard";
import { AssistenteSupervisorCard } from "@/components/AssistenteSupervisorCard";


import { BuscaColaboradorNexti } from "@/components/BuscaColaboradorNexti";
import { ConsultaFaltasPorNome } from "@/components/ConsultaFaltasPorNome";
import { CompartilharLocalizacaoCard } from "@/components/CompartilharLocalizacaoCard";
import { FloatingNav } from "@/components/FloatingNav";

export const Route = createFileRoute("/_authenticated/supervisor")({
  head: () => ({
    meta: [
      { title: "Supervisor | Painel de Supervisão" },
      {
        name: "description",
        content:
          "Painel do supervisor com relatórios de visita, indicadores de conformidade e ranking de postos.",
      },
      { property: "og:title", content: "Supervisor | Painel de Supervisão" },
      {
        property: "og:description",
        content: "Painel do supervisor com relatórios de visita e indicadores operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioPadrao = new Date();
  inicioPadrao.setDate(inicioPadrao.getDate() - 30);

  const inicio = inicioPadrao.toISOString().slice(0, 10);
  const fim = hoje;

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
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl text-foreground">SUPERVISOR</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Visão unificada da supervisão operacional: relatórios de visita, indicadores de
              conformidade, ranking de postos e não conformidades.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        <section className="space-y-6">
          <AssistenteSupervisorCard />
          <MinhasFaltasSupervisorCard />
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[1fr]">
          <Link
            to="/supervisor-vagas"
            className="panel flex h-full min-h-[160px] flex-col block gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-primary"
          >
            <div className="flex flex-col gap-3 h-full w-full">
              <span className="flex size-11 mx-auto shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Briefcase className="size-5" />
              </span>
              <div className="w-full flex-1">
                <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
                  ABERTURAS DE VAGAS
                </span>
                <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
                  Solicitação de Pessoas com preenchimento automático e geração do PDF oficial.
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/supervisor-faltas"
            className="panel flex h-full min-h-[160px] flex-col block gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-destructive"
          >
            <div className="flex flex-col gap-3 h-full w-full">
              <span className="flex size-11 mx-auto shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="size-5" />
              </span>
              <div className="w-full flex-1">
                <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
                  FALTAS SEM COBERTURA
                </span>
                <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
                  Gestão e alertas de postos operacionais descobertos.
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/supervisor-crt"
            className="panel flex h-full min-h-[160px] flex-col block gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-blue-500"
          >
            <div className="flex flex-col gap-3 h-full w-full">
              <span className="flex size-11 mx-auto shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                <FileText className="size-5" />
              </span>
              <div className="w-full flex-1">
                <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
                  LANÇAMENTO DE CRT
                </span>
                <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
                  Controle e registro de Certificados de Regularidade Trabalhista.
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/supervisor-campo"
            className="panel flex h-full min-h-[160px] flex-col block gap-4 p-5 transition-colors hover:bg-accent/50 hover:border-emerald-500"
          >
            <div className="flex flex-col gap-3 h-full w-full">
              <span className="flex size-11 mx-auto shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <Map className="size-5" />
              </span>
              <div className="w-full flex-1">
                <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
                  SUPERVISÃO DE CAMPO
                </span>
                <span className="mt-1 text-center block text-xs text-muted-foreground leading-relaxed">
                  Registro e acompanhamento de rotinas e vistorias in loco.
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/movimentacao-posto"
            className="panel flex h-full min-h-[160px] flex-col gap-4 p-5 transition-colors hover:border-primary hover:bg-accent/50"
          >
            <div className="flex h-full w-full flex-col gap-3">
              <span className="mx-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ArrowRightLeft className="size-5" />
              </span>
              <div className="w-full flex-1">
                <span className="block w-full text-center text-base font-semibold uppercase text-foreground">
                  MOVIMENTAÇÃO DE POSTO
                </span>
                <span className="mt-1 block text-center text-xs leading-relaxed text-muted-foreground">
                  Registro de transferência de colaboradores entre postos de serviço.
                </span>
              </div>
            </div>
          </Link>

          <BuscaColaboradorNexti />
          <ConsultaFaltasPorNome />
        </div>

        <div className="hidden">
          <CompartilharLocalizacaoCard />
        </div>

        <NextiVisitasSupervisao inicio={inicio} fim={fim} />
      </div>

      <FloatingNav />
    </main>
  );
}
