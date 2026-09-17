import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ChevronDown, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  importarPostosVagasNexti,
  listarCargosPorPosto,
  listarPostosVagas,
} from "@/lib/postos-vagas.functions";
import { useNextiDiferido } from "@/lib/use-nexti-diferido";

export const Route = createFileRoute("/_authenticated/postos")({
  head: () => ({
    meta: [
      { title: "Postos de Serviço | CIOP" },
      {
        name: "description",
        content:
          "Postos de serviço importados da NEXTI com a quantidade de vagas disponíveis em cada posto.",
      },
      { property: "og:title", content: "Postos de Serviço | CIOP" },
      {
        property: "og:description",
        content: "Importe automaticamente os postos da NEXTI e veja as vagas disponíveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostosPage,
});

function PostosPage() {
  const listar = useServerFn(listarPostosVagas);
  const importar = useServerFn(importarPostosVagasNexti);
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [somenteComVaga, setSomenteComVaga] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const listarCargos = useServerFn(listarCargosPorPosto);

  // A página abre primeiro; os dados da NEXTI entram depois (regra global).
  const pronto = useNextiDiferido();
  const postosQuery = useQuery({
    queryKey: ["postos-vagas"],
    queryFn: () => listar(),
    enabled: pronto,
    staleTime: 60_000,
  });

  const cargosQuery = useQuery({
    queryKey: ["postos-cargos"],
    queryFn: () => listarCargos(),
    enabled: pronto,
    staleTime: 300_000,
  });

  const importacao = useMutation({
    mutationFn: () => importar(),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível importar os postos da NEXTI.");
        return;
      }
      toast.success(
        `${r.gravados} postos importados da NEXTI · ${r.totalVagas} vagas disponíveis.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["postos-vagas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const todos = postosQuery.data?.postos ?? [];

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todos.filter((p) => {
      if (somenteComVaga && p.vagas <= 0) return false;
      if (!termo) return true;
      return [p.nome, p.cliente, p.empresa, p.cidade, p.uf]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [todos, busca, somenteComVaga]);

  const totalVagas = todos.reduce((s, p) => s + p.vagas, 0);
  const comVagas = todos.filter((p) => p.vagas > 0).length;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Postos de serviço"
        eyebrow="Operação"
        icon={Building2}
        description="Importe os postos direto da NEXTI, reconhecendo automaticamente a quantidade de vagas disponíveis em cada posto."
        actions={
          <Button
            onClick={() => importacao.mutate()}
            disabled={importacao.isPending}
            className="gap-2"
          >
            {importacao.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {importacao.isPending ? "Importando..." : "Importar postos da NEXTI"}
          </Button>
        }
      />

      <div className="mx-auto max-w-[88rem] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Postos cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{todos.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Vagas disponíveis</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-primary">{totalVagas}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Postos com vaga</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{comVagas}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Postos e vagas
              {postosQuery.data?.atualizadoEm ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  atualizado em{" "}
                  {new Date(postosQuery.data.atualizadoEm).toLocaleString("pt-BR")}
                </span>
              ) : null}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar posto, cliente ou cidade"
                  className="w-64 pl-8"
                />
              </div>
              <Button
                type="button"
                variant={somenteComVaga ? "default" : "outline"}
                size="sm"
                onClick={() => setSomenteComVaga((v) => !v)}
              >
                Somente com vagas
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {postosQuery.isLoading || !pronto ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando postos...</p>
            ) : filtrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum posto encontrado. Use o botão “Importar postos da NEXTI”.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Posto</th>
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Cidade / UF</th>
                      <th className="py-2 pr-3">Situação</th>
                      <th className="py-2 pr-3 text-right">Vagas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((p) => (
                      <tr key={`${p.nextiId ?? p.nome}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{p.nome}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{p.cliente ?? "—"}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {[p.cidade, p.uf].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={p.ativo ? "secondary" : "outline"}>
                            {p.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Badge variant={p.vagas > 0 ? "default" : "outline"}>{p.vagas}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
