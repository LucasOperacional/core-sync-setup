import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-faltas")({
  head: () => ({
    meta: [
      { title: "Faltas e justificativas | Ponto NXS" },
      { name: "description", content: "Registro e justificativa de ausências." },
      { property: "og:title", content: "Faltas e justificativas | Ponto NXS" },
      { property: "og:description", content: "Registro e justificativa de ausências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="faltas" />,
});
