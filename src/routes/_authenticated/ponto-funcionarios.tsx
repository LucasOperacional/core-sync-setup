import { createFileRoute } from "@tanstack/react-router";
import { PontoWorkspace } from "@/components/ponto/PontoWorkspace";

export const Route = createFileRoute("/_authenticated/ponto-funcionarios")({
  head: () => ({
    meta: [
      { title: "Funcionários do ponto | Ponto NXS" },
      { name: "description", content: "Cadastro de funcionários, empresa, posto e supervisor." },
      { property: "og:title", content: "Funcionários do ponto | Ponto NXS" },
      { property: "og:description", content: "Cadastro de funcionários, empresa, posto e supervisor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PontoWorkspace modo="funcionarios" />,
});
