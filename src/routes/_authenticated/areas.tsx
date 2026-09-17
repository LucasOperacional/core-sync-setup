import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  DownloadCloud,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { FloatingNav } from "@/components/FloatingNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AREAS_GERENTES, iniciaisGerente, nomeAmigavel } from "@/lib/areas-gerentes";
import { normalizarNome } from "@/lib/gerentes-area-a";
import {
  listarPostosDoGerente,
  adicionarPostoAoGerente,
  removerPostoDoGerente,
  buscarPostosNexti,
} from "@/lib/areas-gerentes.functions";
import { importarPostosNexti } from "@/lib/areas-nexti.functions";
import { meuVinculoGerente } from "@/lib/vinculo-gerente.functions";
import { useSessao, useIsAdmin } from "@/hooks/use-sessao";
import { toast } from "sonner";
import { COORDENADORES, coordenadorDoGerente, rotuloCoordenador } from "@/lib/coordenadores";

export const Route = createFileRoute("/_authenticated/areas")({
  head: () => ({
    meta: [
      { title: "Áreas — Portal Operacional" },
      {
        name: "description",
        content: "Áreas operacionais organizadas por gerente responsável.",
      },
      { property: "og:title", content: "Áreas — Portal Operacional" },
      {
        property: "og:description",
        content: "Áreas operacionais organizadas por gerente responsável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AreasPage,
});

function AreasPage() {
  const [busca, setBusca] = useState("");
  const [gerenteSelecionado, setGerenteSelecionado] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const { user } = useSessao();
  const { data: isAdmin } = useIsAdmin(user);
  const queryClient = useQueryClient();
  const importar = useServerFn(importarPostosNexti);

  async function handleImportar() {
    setImportando(true);
    try {
      const resultado = await importar({ data: undefined });
      if (resultado.ok) {
        queryClient.invalidateQueries({ queryKey: ["postos-gerente"] });
        toast.success(
          `${resultado.postosSalvos} postos atualizados da NEXTI · ${resultado.vinculosCriados} vinculados às áreas`,
          {
            description:
              resultado.semGerente > 0
                ? `${resultado.semGerente} postos sem gerente identificado.`
                : undefined,
          },
        );
      } else {
        toast.error(resultado.erro || "Não foi possível importar os postos da NEXTI");
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao falar com a NEXTI");
    } finally {
      setImportando(false);
    }
  }

  const carregarVinculo = useServerFn(meuVinculoGerente);
  const { data: vinculo } = useQuery({
    queryKey: ["meu-vinculo-gerente"],
    queryFn: () => carregarVinculo(),
    staleTime: 60_000,
  });

  // Gerente de área (não admin) enxerga somente a própria área.
  const restrito = !isAdmin && !!vinculo?.gerenteNome;

  const areas = useMemo(() => {
    const base: string[] = restrito ? [vinculo!.gerenteNome!] : [...AREAS_GERENTES];
    const termo = normalizarNome(busca);
    if (!termo) return base;
    return base.filter((nome) => normalizarNome(nome).includes(termo));
  }, [busca, restrito, vinculo]);

  return (
    <main className="min-h-screen px-4 py-8 pb-32">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Áreas</h1>
          <p className="text-sm text-muted-foreground">
            Áreas operacionais organizadas pelo gerente responsável. Clique em uma área para ver os
            postos.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar área ou gerente"
              className="pl-9"
              aria-label="Buscar área ou gerente"
            />
          </div>
          {isAdmin && (
            <Button onClick={handleImportar} disabled={importando} className="gap-2">
              {importando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <DownloadCloud className="size-4" />
              )}
              Puxar postos da NEXTI
            </Button>
          )}
        </div>

        {COORDENADORES.map((coordenador) => {
          const doCoordenador = areas.filter(
            (nome) => coordenadorDoGerente(nome) === coordenador,
          );
          if (doCoordenador.length === 0) return null;
          return (
            <section key={coordenador} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <h2 className="font-display text-base font-semibold">
                  {rotuloCoordenador(coordenador)}
                </h2>
                <Badge variant="secondary">{doCoordenador.length} área(s)</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {doCoordenador.map((nome) => (
                  <Card
                    key={nome}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setGerenteSelecionado(nome)}
                  >
                    <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {iniciaisGerente(nome)}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{nomeAmigavel(nome)}</CardTitle>
                        <p className="text-xs text-muted-foreground">Gerente de área</p>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <Badge variant="secondary" className="gap-1">
                        <UserRound className="size-3" />
                        Área ativa
                      </Badge>
                      <span className="text-xs text-muted-foreground">Ver postos</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}

        {areas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma área encontrada.</p>
        )}
      </div>

      <Sheet
        open={!!gerenteSelecionado}
        onOpenChange={(aberto) => !aberto && setGerenteSelecionado(null)}
      >
        <SheetContent className="w-full max-w-md sm:max-w-lg">
          {gerenteSelecionado && (
            <PainelPostos
              gerente={gerenteSelecionado}
              isAdmin={!!isAdmin}
              onFechar={() => setGerenteSelecionado(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <FloatingNav />
    </main>
  );
}

function PainelPostos({
  gerente,
  isAdmin,
  onFechar,
}: {
  gerente: string;
  isAdmin: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarPostosDoGerente);
  const adicionar = useServerFn(adicionarPostoAoGerente);
  const remover = useServerFn(removerPostoDoGerente);

  const [novoPosto, setNovoPosto] = useState("");
  const [novaLocalidade, setNovaLocalidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [buscaNexti, setBuscaNexti] = useState("");
  const [termoNexti, setTermoNexti] = useState("");

  const buscarNexti = useServerFn(buscarPostosNexti);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["postos-gerente", gerente],
    queryFn: () => listar({ data: { nome: gerente } }),
    enabled: !!gerente,
  });

  useEffect(() => {
    if (gerente) refetch();
  }, [gerente, refetch]);

  useEffect(() => {
    const t = setTimeout(() => setTermoNexti(buscaNexti.trim()), 350);
    return () => clearTimeout(t);
  }, [buscaNexti]);

  const { data: resultadoNexti, isFetching: buscandoNexti } = useQuery({
    queryKey: ["postos-nexti", termoNexti],
    queryFn: () => buscarNexti({ data: { termo: termoNexti, limite: 50 } }),
    enabled: isAdmin && nextiPronto,
  });

  const todosPostos = data?.ok ? data.postos : [];
  const postos = useMemo(() => {
    const termo = normalizarNome(filtro);
    if (!termo) return todosPostos;
    return todosPostos.filter(
      (p) =>
        normalizarNome(p.posto_nome).includes(termo) ||
        normalizarNome(p.posto_localidade ?? "").includes(termo),
    );
  }, [todosPostos, filtro]);

  const jaVinculados = useMemo(
    () => new Set(todosPostos.map((p) => normalizarNome(p.posto_nome))),
    [todosPostos],
  );

  async function vincularDaNexti(nome: string, localidade: string | null) {
    const resultado = await adicionar({
      data: { gerenteNome: gerente, postoNome: nome, postoLocalidade: localidade ?? "" },
    });
    if (resultado.ok) {
      queryClient.invalidateQueries({ queryKey: ["postos-gerente", gerente] });
      toast.success(`${nome} vinculado à área`);
    } else {
      toast.error(resultado.erro || "Não foi possível vincular o posto");
    }
  }

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoPosto.trim()) return;
    setEnviando(true);
    const resultado = await adicionar({
      data: {
        gerenteNome: gerente,
        postoNome: novoPosto.trim(),
        postoLocalidade: novaLocalidade.trim(),
      },
    });
    setEnviando(false);
    if (resultado.ok) {
      setNovoPosto("");
      setNovaLocalidade("");
      queryClient.invalidateQueries({ queryKey: ["postos-gerente", gerente] });
      toast.success("Posto adicionado");
    } else {
      toast.error(resultado.erro || "Não foi possível adicionar o posto");
    }
  }

  async function handleRemover(id: string) {
    const resultado = await remover({ data: { id } });
    if (resultado.ok) {
      queryClient.invalidateQueries({ queryKey: ["postos-gerente", gerente] });
      toast.success("Posto removido");
    } else {
      toast.error(resultado.erro || "Não foi possível remover o posto");
    }
  }

  return (
    <>
      <SheetHeader className="space-y-1 pr-8">
        <SheetTitle className="flex items-center gap-2 text-lg">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {iniciaisGerente(gerente)}
          </span>
          {nomeAmigavel(gerente)}
        </SheetTitle>
        <SheetDescription>Postos registrados na área deste gerente.</SheetDescription>
      </SheetHeader>

      <div className="mt-6 flex h-[calc(100%-5rem)] flex-col gap-4">
        {isAdmin && (
          <div className="space-y-3">
            <div className="grid gap-2">
              <label htmlFor="busca-nexti" className="text-sm font-medium">
                Buscar posto da NEXTI
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-nexti"
                  value={buscaNexti}
                  onChange={(e) => setBuscaNexti(e.target.value)}
                  placeholder="Nome, cliente, cidade, UF ou centro de custo"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {buscandoNexti
                  ? "Buscando na base da NEXTI..."
                  : resultadoNexti?.ok
                    ? `${resultadoNexti.postos.length} de ${resultadoNexti.total} postos encontrados`
                    : (resultadoNexti?.erro ?? "")}
              </p>
            </div>

            {resultadoNexti?.ok && resultadoNexti.postos.length > 0 && (
              <ScrollArea className="max-h-56 rounded-lg border border-border">
                <ul className="divide-y divide-border">
                  {resultadoNexti.postos.map((p) => {
                    const vinculado = jaVinculados.has(normalizarNome(p.nome));
                    return (
                      <li key={p.nexti_id} className="flex items-center justify-between gap-2 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.nome}</p>
                          {p.localidade && (
                            <p className="truncate text-xs text-muted-foreground">{p.localidade}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={vinculado ? "ghost" : "secondary"}
                          disabled={vinculado}
                          className="shrink-0 gap-1"
                          onClick={() => vincularDaNexti(p.nome, p.localidade)}
                        >
                          <Plus className="size-3" />
                          {vinculado ? "Vinculado" : "Vincular"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}

            <form onSubmit={handleAdicionar} className="space-y-3">
              <div className="grid gap-2">
                <label htmlFor="posto-nome" className="text-sm font-medium">
                  Novo posto manual
                </label>
                <Input
                  id="posto-nome"
                  value={novoPosto}
                  onChange={(e) => setNovoPosto(e.target.value)}
                  placeholder="Nome do posto"
                  disabled={enviando}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="posto-localidade" className="text-sm font-medium">
                  Localidade (opcional)
                </label>
                <Input
                  id="posto-localidade"
                  value={novaLocalidade}
                  onChange={(e) => setNovaLocalidade(e.target.value)}
                  placeholder="Cidade / estado"
                  disabled={enviando}
                />
              </div>
              <Button
                type="submit"
                disabled={enviando || !novoPosto.trim()}
                className="w-full gap-1"
              >
                {enviando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Adicionar posto
              </Button>
            </form>
          </div>
        )}

        <Separator />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={`Filtrar postos desta área (${todosPostos.length})`}
            className="pl-9"
            aria-label="Filtrar postos desta área"
          />
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Carregando postos...
            </div>
          ) : postos.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Building2 className="size-8 opacity-50" />
              <p>Nenhum posto registrado para esta área.</p>
              {!isAdmin && (
                <p className="text-xs">Entre como administrador para adicionar postos.</p>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full pr-2">
              <ul className="space-y-2">
                {postos.map((posto) => (
                  <li
                    key={posto.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{posto.posto_nome}</p>
                      {posto.posto_localidade && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {posto.posto_localidade}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => handleRemover(posto.id)}
                        aria-label={`Remover ${posto.posto_nome}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        onClick={onFechar}
        aria-label="Fechar"
      >
        <X className="size-4" />
      </Button>
    </>
  );
}
