import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Home, LayoutDashboard, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { importarGerentesNexti, listarGerentesNexti } from "@/lib/gerentes-nexti.functions";

export const Route = createFileRoute("/_authenticated/gerentes/")({
  head: () => ({
    meta: [
      { title: "Gerentes de Área | CIOP" },
      {
        name: "description",
        content:
          "Cadastro de gerentes de área importado da API NEXTI, com visitas e relatórios por gerente.",
      },
      { property: "og:title", content: "Gerentes de Área | CIOP" },
      {
        property: "og:description",
        content: "Importe e consulte os gerentes de área cadastrados na NEXTI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GerentesIndexPage,
});

function GerentesIndexPage() {
  const listar = useServerFn(listarGerentesNexti);
  const importar = useServerFn(importarGerentesNexti);
  const queryClient = useQueryClient();

  const gerentes = useQuery({
    queryKey: ["gerentes-nexti"],
    queryFn: () => listar(),
  });

  const importacao = useMutation({
    mutationFn: () => importar(),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          `${r.importados} gerente(s) de área importado(s) da NEXTI (cargos: ${r.cargosEncontrados.join(", ")}).`,
        );
      } else {
        toast.error(r.erro ?? "Não foi possível importar os gerentes.");
      }
      void queryClient.invalidateQueries({ queryKey: ["gerentes-nexti"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao consultar a API da NEXTI."),
  });

  const lista = gerentes.data ?? [];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <LayoutDashboard className="size-7 text-primary" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Gerentes de Área</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro sincronizado com a API da NEXTI. Visitas e relatórios por gerente.
            </p>
          </div>
          <button
            type="button"
            disabled={importacao.isPending}
            onClick={() => importacao.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {importacao.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importando da NEXTI...
              </>
            ) : (
              <>
                <Download className="size-4" />
                Importar gerentes da NEXTI
              </>
            )}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {gerentes.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando gerentes...
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
            <LayoutDashboard className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum gerente cadastrado. Use “Importar gerentes da NEXTI” para trazer todos os
              gerentes de área do cadastro.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {lista.length} gerente(s) de área cadastrado(s).
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5"
                >
                  <h2 className="text-base font-semibold text-card-foreground">{g.nome}</h2>
                  <p className="text-sm text-muted-foreground">{g.cargo || "Gerente de Área"}</p>
                  {g.email ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="size-3.5" />
                      {g.email}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
