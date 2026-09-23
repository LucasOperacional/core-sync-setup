import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-banco-horas")({
  head: () => ({
    meta: [
      { title: "Banco de horas | Ponto NXS" },
      { name: "description", content: "Saldo de horas acumulado por funcionário." },
      { property: "og:title", content: "Banco de horas | Ponto NXS" },
      { property: "og:description", content: "Saldo de horas acumulado por funcionário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="banco" />,
});
