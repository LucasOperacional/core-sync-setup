import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-ajustes")({
  head: () => ({
    meta: [
      { title: "Solicitação de ajuste | Ponto NXS" },
      { name: "description", content: "Pedidos de correção das marcações de ponto." },
      { property: "og:title", content: "Solicitação de ajuste | Ponto NXS" },
      { property: "og:description", content: "Pedidos de correção das marcações de ponto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="ajustes" />,
});
