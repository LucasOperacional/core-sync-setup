import { createFileRoute } from "@tanstack/react-router";
import { DPWorkspace } from "@/components/dp/DPWorkspace";

export const Route = createFileRoute("/_authenticated/dp-ferias")({
  head: () => ({
    meta: [
      { title: "Férias | Departamento pessoal NXS" },
      { name: "description", content: "Programação e cálculo de férias com um terço e abono." },
      { property: "og:title", content: "Férias | Departamento pessoal NXS" },
      { property: "og:description", content: "Programação e cálculo de férias com um terço e abono." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DPWorkspace modo="ferias" />,
});
