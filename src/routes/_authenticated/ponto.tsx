import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto")({
  head: () => ({
    meta: [
      { title: "Registro de ponto | Ponto NXS" },
      { name: "description", content: "Registro de entrada, intervalo e saída com horário do servidor." },
      { property: "og:title", content: "Registro de ponto | Ponto NXS" },
      { property: "og:description", content: "Registro de entrada, intervalo e saída com horário do servidor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="registro" />,
});
