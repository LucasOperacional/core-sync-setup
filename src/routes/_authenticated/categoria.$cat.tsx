import { createFileRoute, notFound } from "@tanstack/react-router";

import { CategoriaCards } from "@/components/CategoriaCards";
import { CATEGORIAS_MENU } from "@/lib/categorias-menu";

export const Route = createFileRoute("/_authenticated/categoria/$cat")({
  beforeLoad: ({ params }) => {
    if (!(params.cat in CATEGORIAS_MENU)) throw notFound();
  },
  head: ({ params }) => {
    const cat = (params as { cat?: string }).cat ?? "";
    const categoria = CATEGORIAS_MENU[cat];
    const titulo = categoria ? `${categoria.titulo} — NXS Sistemas` : "Área — NXS Sistemas";
    const descricao = categoria?.descricao ?? "Área do sistema NXS.";
    return {
      meta: [
        { title: titulo },
        { name: "description", content: descricao },
        { property: "og:title", content: titulo },
        { property: "og:description", content: descricao },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: CategoriaPagina,
});

function CategoriaPagina() {
  const { cat } = Route.useParams();
  const categoria = CATEGORIAS_MENU[cat];
  if (!categoria) return null;
  return (
    <main className="min-h-screen px-4 py-8 pb-32">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{categoria.titulo}</h1>
          <p className="text-sm text-muted-foreground">{categoria.descricao}</p>
        </header>
        <CategoriaCards categoriaKey={categoria.chave} itens={categoria.itens} />
      </div>
    </main>
  );
}
