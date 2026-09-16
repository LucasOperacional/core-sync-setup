import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { QualidadeTempoSupervisores } from "@/components/QualidadeTempoSupervisores";
import { listVisitas } from "@/lib/visitas-db";
import type { Visit } from "@/lib/report-parser";

export const Route = createFileRoute("/_authenticated/qualidade-tempo")({
  head: () => ({
    meta: [
      { title: "Qualidade e tempo por local de visita" },
      {
        name: "description",
        content:
          "Qualidade e tempo das visitas separadas por local e por Gerente de Área A, com data, entrada, saída e tempo exato no posto.",
      },
    ],
  }),
  component: QualidadeTempoPage,
});

function QualidadeTempoPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    listVisitas()
      .then((lista) => {
        if (ativo) setVisits(lista);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[88rem] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/control"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Voltar ao Control
          </Link>
          <h1 className="font-display text-xl font-semibold">
            Qualidade e tempo por local de visita
          </h1>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando visitas…</p>
        ) : (
          <QualidadeTempoSupervisores visitas={visits} />
        )}
      </div>
    </main>
  );
}
