import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-painel")({
  head: () => ({
    meta: [
      { title: "Painel do ponto | Ponto NXS" },
      { name: "description", content: "Presença do dia, atrasos, pendências e horas extras." },
      { property: "og:title", content: "Painel do ponto | Ponto NXS" },
      { property: "og:description", content: "Presença do dia, atrasos, pendências e horas extras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="dashboard" />,
});
