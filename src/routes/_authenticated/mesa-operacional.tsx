import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Loader2, Plus, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { FloatingNav } from "@/components/FloatingNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AREAS_GERENTES } from "@/lib/areas-gerentes";
import { normalizarNome } from "@/lib/gerentes-area-a";
import {
  cadastrarPostoMesa,
  hojeBrasilia,
  listarPostosMesa,
  registrarCheckinMesa,
  removerPostoMesa,
  type PostoServicoMesa,
} from "@/lib/mesa-operacional.functions";

export const Route = createFileRoute("/_authenticated/mesa-operacional")({
  head: () => ({
    meta: [
      { title: "Mesa Operacional — Check-in dos postos" },
      {
        name: "description",
        content:
          "Check-in diário de cada posto de serviço por gerente de área e cadastro de novos postos.",
      },
      { property: "og:title", content: "Mesa Operacional — Check-in dos postos" },
      {
        property: "og:description",
        content:
          "Check-in diário de cada posto de serviço por gerente de área e cadastro de novos postos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MesaOperacionalPage,
});

function MesaOperacionalPage() {
  const queryClient = useQueryClient();
  const carregar = useServerFn(listarPostosMesa);
  const cadastrar = useServerFn(cadastrarPostoMesa);
  const remover = useServerFn(removerPostoMesa);
  const marcar = useServerFn(registrarCheckinMesa);

  const [dia, setDia] = useState(() => hojeBrasilia());
  const [busca, setBusca] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoGerente, setNovoGerente] = useState<string>(AREAS_GERENTES[0]);
  const [novaLocalidade, setNovaLocalidade] = useState("");
  const [novoCliente, setNovoCliente] = useState("");

  const chave = ["mesa-operacional", dia] as const;

  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => carregar({ data: { data: dia } }),
    staleTime: 30_000,
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["mesa-operacional"] });

  const cadastrarMut = useMutation({
    mutationFn: () =>
      cadastrar({
        data: {
          nome: novoNome,
          gerenteNome: novoGerente,
          localidade: novaLocalidade,
          cliente: novoCliente,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível cadastrar o posto");
        return;
      }
      toast.success("Posto de serviço cadastrado");
      setNovoNome("");
      setNovaLocalidade("");
      setNovoCliente("");
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar"),
  });

  const checkMut = useMutation({
    mutationFn: (v: { postoId: string; feito: boolean }) =>
      marcar({ data: { postoId: v.postoId, data: dia, feito: v.feito } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.erro || "Não foi possível salvar o check-in");
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar o check-in"),
  });

  const removerMut = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível remover o posto");
        return;
      }
      toast.success("Posto removido");
      atualizar();
    },
  });

  const postos = data?.postos ?? [];

  const grupos = useMemo(() => {
    const termo = normalizarNome(busca);
    const filtrados = termo
      ? postos.filter(
          (p) =>
            normalizarNome(p.nome).includes(termo) ||
            normalizarNome(p.gerenteNome).includes(termo) ||
            normalizarNome(p.localidade ?? "").includes(termo) ||
            normalizarNome(p.cliente ?? "").includes(termo),
        )
      : postos;

    const mapa = new Map<string, PostoServicoMesa[]>();
    for (const gerente of AREAS_GERENTES) mapa.set(gerente, []);
    for (const p of filtrados) {
      const lista = mapa.get(p.gerenteNome) ?? [];
      lista.push(p);
      mapa.set(p.gerenteNome, lista);
    }
    return [...mapa.entries()]
      .map(([gerente, lista]) => ({
        gerente,
        lista,
        feitos: lista.filter((p) => p.checkFeito).length,
      }))
      .filter((g) => g.lista.length > 0 || !termo);
  }, [postos, busca]);

  const totalFeitos = postos.filter((p) => p.checkFeito).length;

  return (
    <main className="min-h-screen px-4 py-8 pb-32">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Mesa Operacional</h1>
          <p className="text-sm text-muted-foreground">
            Check-in diário de cada posto de serviço, organizado por gerente de área.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4" />
              Check-in do dia
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Data</label>
              <Input
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value || hojeBrasilia())}
                className="w-44"
              />
            </div>
            <div className="min-w-56 flex-1 space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Buscar posto ou gerente
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome do posto, gerente, cliente..."
                  className="pl-9"
                />
              </div>
            </div>
            <Badge variant="secondary" className="h-9 px-3 text-sm">
              {totalFeitos} de {postos.length} com check-in
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" />
              Cadastrar posto de serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (novoNome.trim().length < 2) {
                  toast.error("Informe o nome do posto");
                  return;
                }
                cadastrarMut.mutate();
              }}
            >
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do posto"
                className="md:col-span-2"
              />
              <select
                value={novoGerente}
                onChange={(e) => setNovoGerente(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Gerente de área"
              >
                {AREAS_GERENTES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <Input
                value={novaLocalidade}
                onChange={(e) => setNovaLocalidade(e.target.value)}
                placeholder="Localidade (opcional)"
              />
              <div className="flex gap-2">
                <Input
                  value={novoCliente}
                  onChange={(e) => setNovoCliente(e.target.value)}
                  placeholder="Cliente"
                />
                <Button type="submit" disabled={cadastrarMut.isPending}>
                  {cadastrarMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando postos...
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grupos.map((grupo) => {
              const total = grupo.lista.length;
              const pct = total ? Math.round((grupo.feitos / total) * 100) : 0;
              return (
                <Card key={grupo.gerente}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <UserRound className="size-4" />
                        {grupo.gerente}
                      </span>
                      <Badge variant={pct === 100 && total > 0 ? "default" : "secondary"}>
                        {grupo.feitos}/{total}
                      </Badge>
                    </CardTitle>
                    <Progress value={pct} className="h-1.5" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {total === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum posto de serviço cadastrado para esta área.
                      </p>
                    ) : (
                      grupo.lista.map((posto) => (
                        <div
                          key={posto.id}
                          className="flex items-start gap-3 rounded-lg border border-border px-3 py-2"
                        >
                          <Checkbox
                            checked={posto.checkFeito}
                            onCheckedChange={(v) =>
                              checkMut.mutate({ postoId: posto.id, feito: v === true })
                            }
                            aria-label={`Check-in do posto ${posto.nome}`}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{posto.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[posto.cliente, posto.localidade].filter(Boolean).join(" · ") ||
                                "Sem localidade"}
                            </p>
                            {posto.checkFeito && posto.checkEm ? (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                Check-in às{" "}
                                {new Date(posto.checkEm).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removerMut.mutate(posto.id)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Remover posto ${posto.nome}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!isLoading && postos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" /> Cadastre o primeiro posto de serviço acima.
          </p>
        ) : null}
      </div>
      <FloatingNav />
    </main>
  );
}
