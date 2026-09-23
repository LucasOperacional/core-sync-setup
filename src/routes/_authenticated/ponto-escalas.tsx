import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-escalas")({
  head: () => ({
    meta: [
      { title: "Escalas e jornadas | Ponto NXS" },
      { name: "description", content: "Jornadas, intervalos, tolerância e dias de trabalho." },
      { property: "og:title", content: "Escalas e jornadas | Ponto NXS" },
      { property: "og:description", content: "Jornadas, intervalos, tolerância e dias de trabalho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="escalas" />,
});
