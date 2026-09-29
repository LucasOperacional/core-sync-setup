import { createFileRoute } from "@tanstack/react-router";
import { DPWorkspace } from "@/components/dp/DPWorkspace";

export const Route = createFileRoute("/_authenticated/dp-folha")({
  head: () => ({
    meta: [
      { title: "Folha de pagamento | Departamento pessoal NXS" },
      { name: "description", content: "Folha de pagamento integrada ao ponto digital, com holerite em PDF." },
      { property: "og:title", content: "Folha de pagamento | Departamento pessoal NXS" },
      { property: "og:description", content: "Folha de pagamento integrada ao ponto digital, com holerite em PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DPWorkspace modo="folha" />,
});
