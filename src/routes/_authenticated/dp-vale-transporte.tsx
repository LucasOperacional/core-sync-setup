import { createFileRoute } from "@tanstack/react-router";
import { DPWorkspace } from "@/components/dp/DPWorkspace";

export const Route = createFileRoute("/_authenticated/dp-vale-transporte")({
  head: () => ({
    meta: [
      { title: "Vale transporte | Departamento pessoal NXS" },
      { name: "description", content: "Cálculo do vale transporte pelos dias trabalhados no ponto." },
      { property: "og:title", content: "Vale transporte | Departamento pessoal NXS" },
      { property: "og:description", content: "Cálculo do vale transporte pelos dias trabalhados no ponto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DPWorkspace modo="vt" />,
});
