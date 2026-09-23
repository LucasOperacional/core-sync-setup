import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-aprovacoes")({
  head: () => ({
    meta: [
      { title: "Aprovações pendentes | Ponto NXS" },
      { name: "description", content: "Pedidos de correção aguardando decisão." },
      { property: "og:title", content: "Aprovações pendentes | Ponto NXS" },
      { property: "og:description", content: "Pedidos de correção aguardando decisão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="aprovacoes" />,
});
