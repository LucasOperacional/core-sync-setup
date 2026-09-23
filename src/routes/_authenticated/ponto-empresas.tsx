import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-empresas")({
  head: () => ({
    meta: [
      { title: "Empresas e postos | Ponto NXS" },
      { name: "description", content: "Empresas, unidades e área permitida para registro." },
      { property: "og:title", content: "Empresas e postos | Ponto NXS" },
      { property: "og:description", content: "Empresas, unidades e área permitida para registro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="empresas" />,
});
