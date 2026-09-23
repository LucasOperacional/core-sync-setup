import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-espelho")({
  head: () => ({
    meta: [
      { title: "Espelho de ponto | Ponto NXS" },
      { name: "description", content: "Marcações, horas trabalhadas e saldo do período." },
      { property: "og:title", content: "Espelho de ponto | Ponto NXS" },
      { property: "og:description", content: "Marcações, horas trabalhadas e saldo do período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="espelho" />,
});
