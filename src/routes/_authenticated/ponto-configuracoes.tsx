import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do ponto | Ponto NXS" },
      { name: "description", content: "Tolerância, localização, banco de horas e feriados." },
      { property: "og:title", content: "Configurações do ponto | Ponto NXS" },
      { property: "og:description", content: "Tolerância, localização, banco de horas e feriados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="configuracoes" />,
});
