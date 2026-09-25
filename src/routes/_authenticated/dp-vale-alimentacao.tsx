import { createFileRoute } from "@tanstack/react-router";
import { DPWorkspace } from "@/components/dp/DPWorkspace";

export const Route = createFileRoute("/_authenticated/dp-vale-alimentacao")({
  head: () => ({
    meta: [
      { title: "Vale alimentação | Departamento pessoal NXS" },
      { name: "description", content: "Cálculo do vale alimentação pelos dias com presença no ponto." },
      { property: "og:title", content: "Vale alimentação | Departamento pessoal NXS" },
      { property: "og:description", content: "Cálculo do vale alimentação pelos dias com presença no ponto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DPWorkspace modo="va" />,
});
