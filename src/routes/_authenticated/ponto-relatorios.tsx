import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios do ponto | Ponto NXS" },
      { name: "description", content: "Espelho, atrasos, faltas, horas extras e banco de horas." },
      { property: "og:title", content: "Relatórios do ponto | Ponto NXS" },
      { property: "og:description", content: "Espelho, atrasos, faltas, horas extras e banco de horas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="relatorios" />,
});
