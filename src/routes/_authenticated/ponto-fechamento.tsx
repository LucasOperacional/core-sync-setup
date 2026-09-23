import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-fechamento")({
  head: () => ({
    meta: [
      { title: "Fechamento mensal | Ponto NXS" },
      { name: "description", content: "Períodos de apuração do ponto." },
      { property: "og:title", content: "Fechamento mensal | Ponto NXS" },
      { property: "og:description", content: "Períodos de apuração do ponto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="fechamento" />,
});
