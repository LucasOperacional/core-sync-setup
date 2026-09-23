import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria do ponto | Ponto NXS" },
      { name: "description", content: "Histórico de registros, alterações e aprovações." },
      { property: "og:title", content: "Auditoria do ponto | Ponto NXS" },
      { property: "og:description", content: "Histórico de registros, alterações e aprovações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="auditoria" />,
});
