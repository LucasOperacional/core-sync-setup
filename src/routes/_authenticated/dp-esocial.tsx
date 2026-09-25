import { createFileRoute } from "@tanstack/react-router";
import { DPWorkspace } from "@/components/dp/DPWorkspace";

export const Route = createFileRoute("/_authenticated/dp-esocial")({
  head: () => ({
    meta: [
      { title: "eSocial | Departamento pessoal NXS" },
      { name: "description", content: "Eventos do eSocial gerados a partir da folha de pagamento." },
      { property: "og:title", content: "eSocial | Departamento pessoal NXS" },
      { property: "og:description", content: "Eventos do eSocial gerados a partir da folha de pagamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DPWorkspace modo="esocial" />,
});
