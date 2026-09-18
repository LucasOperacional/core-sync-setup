import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { FloatingNav } from "@/components/FloatingNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { normalizarNome } from "@/lib/gerentes-area-a";
import { Textarea } from "@/components/ui/textarea";
import {
  buscarRelatorioGeralMesa,
  chavePosto,
  hojeBrasilia,
  listarFolhasPendentesMesa,
  listarPostosMesa,
  registrarCheckinMesa,
  removerPostoMesa,
  removerTodosPostosMesa,
  salvarRelatorioGeralMesa,
  salvarRelatorioMesa,
} from "@/lib/mesa-operacional.functions";

export const Route = createFileRoute("/_authenticated/mesa-operacional/$gerente")({
  head: ({ params }) => ({
    meta: [
      { title: `Postos — ${params.gerente}` },
      { name: "description", content: `Check-in dos postos do gerente ${params.gerente}.` },
      { property: "og:title", content: `Postos — ${params.gerente}` },
      {
        property: "og:description",
        content: `Check-in dos postos do gerente ${params.gerente}.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GerentePostosPage,
});

function GerentePostosPage() {
  const { gerente } = Route.useParams();
  const queryClient = useQueryClient();
  const carregar = useServerFn(listarPostosMesa);
  const marcar = useServerFn(registrarCheckinMesa);
  const remover = useServerFn(removerPostoMesa);

  const [dia, setDia] = useState(() => hojeBrasilia());
  const [busca, setBusca] = useState("");

  const chave = ["mesa-operacional", dia] as const;
  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => carregar({ data: { data: dia } }),
    staleTime: 30_000,
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["mesa-operacional"] });

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

  const removerTodos = useServerFn(removerTodosPostosMesa);
  const removerTodosMut = useMutation({
    mutationFn: () => removerTodos({ data: { gerenteNome: gerente } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível remover todos os postos");
        return;
      }
      toast.success("Todos os postos deste gerente foram removidos");
      atualizar();
    },
  });

  const salvarRelatorio = useServerFn(salvarRelatorioMesa);
  const relatorioMut = useMutation({
    mutationFn: (v: { postoId: string; relatorio: string }) =>
      salvarRelatorio({ data: { postoId: v.postoId, data: dia, relatorio: v.relatorio } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível salvar o relatório");
        return;
      }
      toast.success("Relatório registrado com data e hora");
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar o relatório"),
  });

  const postosDoGerente = useMemo(() => {
    const base = data?.postos ?? [];
    const doGerente = base.filter(
      (p) => normalizarNome(p.gerenteNome) === normalizarNome(gerente),
    );
    const termo = normalizarNome(busca);
    if (!termo) return doGerente;
    return doGerente.filter(
      (p) =>
        normalizarNome(p.nome).includes(termo) ||
        normalizarNome(p.localidade ?? "").includes(termo) ||
        normalizarNome(p.cliente ?? "").includes(termo),
    );
  }, [data, gerente, busca]);

  // Folhas com inconsistência ou pedido de justificativa na NEXTI no dia.
  const carregarFolhas = useServerFn(listarFolhasPendentesMesa);
  const folhas = useQuery({
    queryKey: ["mesa-folhas", dia],
    queryFn: () => carregarFolhas({ data: { data: dia } }),
    staleTime: 5 * 60_000,
  });
  const pendenciaPorPosto = useMemo(() => {
    const mapa = new Map<string, { total: number; colaboradores: { nome: string; motivos: string[] }[] }>();
    for (const p of folhas.data?.pendencias ?? [])
      mapa.set(p.chave, { total: p.total, colaboradores: p.colaboradores });
    return mapa;
  }, [folhas.data]);
  const pendenciaDoPosto = (nome: string) => pendenciaPorPosto.get(chavePosto(nome)) ?? null;

  const feitos = postosDoGerente.filter(
    (p) => p.checkFeito && !pendenciaDoPosto(p.nome),
  ).length;
  const total = postosDoGerente.length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;

  return (
    <main className="min-h-screen px-4 py-8 pb-32">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <Link
            to="/mesa-operacional"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Voltar à Mesa Operacional
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UserRound className="size-6" />
            {gerente}
          </h1>
          <p className="text-sm text-muted-foreground">
            Check-in dos postos de serviço do gerente de área.
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
                Buscar posto
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome do posto, cliente ou localidade..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="h-9 px-3 text-sm">
                {feitos} de {total} com check-in
              </Badge>
              <Badge
                variant={pct === 100 && total > 0 ? "default" : "outline"}
                className="h-9 px-3 text-sm font-semibold"
              >
                {pct}%
              </Badge>
            </div>
            <Progress value={pct} className="h-2 w-full" />
            <div className="flex w-full justify-end pt-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={postosDoGerente.length === 0 || removerTodosMut.isPending}
                  >
                    {removerTodosMut.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Remover todos os postos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover todos os postos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação vai apagar todos os {postosDoGerente.length} posto(s) do gerente{" "}
                      <strong>{gerente}</strong>. Os check-ins históricos também serão perdidos.
                      Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => removerTodosMut.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, remover todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <RelatorioGeralCard gerente={gerente} dia={dia} />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando postos...
          </div>
        ) : postosDoGerente.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum posto encontrado para este gerente nesta data.
          </p>
        ) : (
          <div className="space-y-2">
            {postosDoGerente.map((posto) => (
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
                  <RelatorioPosto
                    postoId={posto.id}
                    relatorio={posto.relatorio}
                    relatorioEm={posto.relatorioEm}
                    salvando={relatorioMut.isPending}
                    onSalvar={(texto) =>
                      relatorioMut.mutate({ postoId: posto.id, relatorio: texto })
                    }
                  />
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
            ))}
          </div>
        )}
      </div>
      <FloatingNav />
    </main>
  );
}

/** Relatório geral do dia do gerente (não vinculado a um posto). */
function RelatorioGeralCard({ gerente, dia }: { gerente: string; dia: string }) {
  const buscar = useServerFn(buscarRelatorioGeralMesa);
  const salvar = useServerFn(salvarRelatorioGeralMesa);
  const queryClient = useQueryClient();
  const chave = ["mesa-relatorio-geral", gerente, dia] as const;

  const { data } = useQuery({
    queryKey: chave,
    queryFn: () => buscar({ data: { gerenteNome: gerente, data: dia } }),
    staleTime: 30_000,
  });

  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);

  const salvarMut = useMutation({
    mutationFn: (v: string) =>
      salvar({ data: { gerenteNome: gerente, data: dia, relatorio: v } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível salvar o relatório geral");
        return;
      }
      toast.success("Relatório geral registrado com data e hora");
      setEditando(false);
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const temRelatorio = Boolean(data?.relatorio);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Relatório geral do dia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {temRelatorio && data?.registradoEm ? (
          <p className="text-xs text-muted-foreground">
            Registrado em{" "}
            {new Date(data.registradoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum relatório geral registrado nesta data.
          </p>
        )}

        {temRelatorio && !editando ? (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {data?.relatorio}
          </p>
        ) : null}

        {editando || !temRelatorio ? (
          <div className="space-y-2">
            <Textarea
              value={texto || data?.relatorio || ""}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva o relatório geral do dia deste gerente..."
              rows={4}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={salvarMut.isPending || (texto || data?.relatorio || "").trim().length === 0}
                onClick={() => salvarMut.mutate(texto || data?.relatorio || "")}
              >
                {salvarMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar relatório geral
              </Button>
              {editando ? (
                <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTexto(data?.relatorio ?? "");
              setEditando(true);
            }}
          >
            Editar relatório
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RelatorioPosto({
  postoId,
  relatorio,
  relatorioEm,
  salvando,
  onSalvar,
}: {
  postoId: string;
  relatorio: string | null;
  relatorioEm: string | null;
  salvando: boolean;
  onSalvar: (texto: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(relatorio ?? "");

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={aberto}
        aria-label={`Relatório do posto ${postoId}`}
      >
        <FileText className="size-3.5" />
        {relatorio ? "Ver/editar relatório" : "Adicionar relatório"}
      </button>
      {relatorio && relatorioEm ? (
        <p className="text-[11px] text-muted-foreground">
          Registrado em{" "}
          {new Date(relatorioEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      {aberto ? (
        <div className="mt-1.5 space-y-1.5">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva o relatório deste posto..."
            rows={3}
            className="text-sm"
          />
          <Button
            size="sm"
            disabled={salvando || texto.trim().length === 0}
            onClick={() => onSalvar(texto)}
          >
            {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar relatório
          </Button>
        </div>
      ) : null}
    </div>
  );
}
