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
import { COORDENADORES, coordenadorDoGerente, rotuloCoordenador } from "@/lib/coordenadores";
import {
  buscarPostosNexti,
  importarPostosMesaLote,
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
  const carregarNexti = useServerFn(buscarPostosNexti);
  const importarLote = useServerFn(importarPostosMesaLote);

  const [dia, setDia] = useState(() => hojeBrasilia());
  const [busca, setBusca] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoGerente, setNovoGerente] = useState<string>(AREAS_GERENTES[0]);
  const [novaLocalidade, setNovaLocalidade] = useState("");
  const [novoCliente, setNovoCliente] = useState("");
  const [loteGerente, setLoteGerente] = useState<string>(AREAS_GERENTES[0]);
  const [loteBusca, setLoteBusca] = useState("");
  const [loteSelecao, setLoteSelecao] = useState<string[]>([]);
  const [loteTexto, setLoteTexto] = useState("");

  const nexti = useQuery({
    queryKey: ["mesa-postos-nexti"],
    queryFn: () => carregarNexti({ data: undefined as never }),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  const postosNexti = nexti.data?.postos ?? [];

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

  const loteMut = useMutation({
    mutationFn: (
      lista: {
        nome: string;
        gerenteNome: string;
        localidade?: string | undefined;
        cliente?: string | undefined;
      }[],
    ) =>
      importarLote({ data: { postos: lista } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro || "Não foi possível importar os postos");
        return;
      }
      toast.success(
        `${r.criados} posto(s) cadastrado(s)` +
          (r.repetidos ? ` · ${r.repetidos} já existia(m)` : "") +
          (r.falhas ? ` · ${r.falhas} com erro` : ""),
      );
      setLoteSelecao([]);
      setLoteTexto("");
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao importar"),
  });

  const nextiFiltrados = useMemo(() => {
    const termo = normalizarNome(loteBusca);
    const base = termo
      ? postosNexti.filter(
          (p) =>
            normalizarNome(p.nome).includes(termo) ||
            normalizarNome(p.cliente ?? "").includes(termo) ||
            normalizarNome(p.localidade ?? "").includes(termo),
        )
      : postosNexti;
    return base.slice(0, 400);
  }, [postosNexti, loteBusca]);

  const enviarLote = () => {
    const daNexti = postosNexti
      .filter((p) => loteSelecao.includes(p.nome))
      .map((p) => ({
        nome: p.nome,
        gerenteNome: loteGerente,
        localidade: p.localidade ?? undefined,
        cliente: p.cliente ?? undefined,
      }));

    const digitados = loteTexto
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter((linha) => linha.length >= 2)
      .map((linha) => {
        const partes = linha.split(/[;|]/).map((x) => x.trim());
        const nome = partes[0] ?? "";
        const gerenteDigitado = partes[1];
        const gerente = gerenteDigitado
          ? (AREAS_GERENTES.find(
              (g) => normalizarNome(g) === normalizarNome(gerenteDigitado),
            ) ?? loteGerente)
          : loteGerente;
        return { nome, gerenteNome: gerente, cliente: partes[2] || undefined };
      })
      .filter((p) => p.nome.length >= 2);

    const lista = [...daNexti, ...digitados];
    if (lista.length === 0) {
      toast.error("Selecione postos da NEXTI ou cole a lista de postos");
      return;
    }
    loteMut.mutate(lista);
  };

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
              <div className="md:col-span-2">
                <Input
                  value={novoNome}
                  list="postos-nexti"
                  onChange={(e) => {
                    const valor = e.target.value;
                    setNovoNome(valor);
                    const achado = postosNexti.find(
                      (p) => p.nome.toLowerCase() === valor.trim().toLowerCase(),
                    );
                    if (achado) {
                      if (achado.cliente) setNovoCliente(achado.cliente);
                      if (achado.localidade) setNovaLocalidade(achado.localidade);
                    }
                  }}
                  placeholder={
                    nexti.isLoading ? "Carregando postos da NEXTI..." : "Nome do posto (NEXTI)"
                  }
                />
                <datalist id="postos-nexti">
                  {postosNexti.map((p) => (
                    <option key={`${p.nextiId ?? p.nome}`} value={p.nome}>
                      {[p.cliente, p.localidade].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {nexti.isLoading
                    ? "Buscando postos na NEXTI..."
                    : postosNexti.length > 0
                      ? `${postosNexti.length} postos da NEXTI disponíveis`
                      : "Nenhum posto retornado pela NEXTI"}
                </p>
              </div>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Importar postos em lote
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Gerente de área para os postos importados
                </label>
                <select
                  value={loteGerente}
                  onChange={(e) => setLoteGerente(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {AREAS_GERENTES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Buscar postos da NEXTI
                </label>
                <Input
                  className="mt-1"
                  value={loteBusca}
                  onChange={(e) => setLoteBusca(e.target.value)}
                  placeholder="Filtrar por posto, cliente ou cidade"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLoteSelecao(nextiFiltrados.map((p) => p.nome))}
                disabled={nextiFiltrados.length === 0}
              >
                Selecionar todos ({nextiFiltrados.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLoteSelecao([])}
                disabled={loteSelecao.length === 0}
              >
                Limpar seleção
              </Button>
              <span>{loteSelecao.length} selecionado(s)</span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {nexti.isLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Carregando postos da NEXTI...
                </div>
              ) : nextiFiltrados.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  Nenhum posto encontrado na NEXTI.
                </p>
              ) : (
                <ul className="divide-y">
                  {nextiFiltrados.map((p) => (
                    <li key={`${p.nextiId ?? p.nome}`} className="flex items-center gap-3 p-2">
                      <Checkbox
                        checked={loteSelecao.includes(p.nome)}
                        onCheckedChange={(v) =>
                          setLoteSelecao((atual) =>
                            v === true
                              ? [...new Set([...atual, p.nome])]
                              : atual.filter((n) => n !== p.nome),
                          )
                        }
                        aria-label={`Selecionar ${p.nome}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{p.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.cliente, p.localidade].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Ou cole a lista (um posto por linha; opcional "Posto;Gerente;Cliente")
              </label>
              <textarea
                value={loteTexto}
                onChange={(e) => setLoteTexto(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
                placeholder={"POSTO SHOPPING FLAMBOYANT\nPOSTO CENTRO;GABRIEL MENDANHA CABRAL"}
              />
            </div>

            <Button type="button" onClick={enviarLote} disabled={loteMut.isPending}>
              {loteMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Cadastrar em lote
            </Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando postos...
          </div>
        ) : (
          <div className="space-y-6">
            {COORDENADORES.map((coordenador) => {
              const doCoordenador = grupos.filter(
                (g) => coordenadorDoGerente(g.gerente) === coordenador,
              );
              if (doCoordenador.length === 0) return null;
              const feitos = doCoordenador.reduce((s, g) => s + g.feitos, 0);
              const totalPostos = doCoordenador.reduce((s, g) => s + g.lista.length, 0);
              return (
                <section key={coordenador} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <h2 className="font-display text-base font-semibold">
                      {rotuloCoordenador(coordenador)}
                    </h2>
                    <Badge variant="secondary">
                      {feitos}/{totalPostos} check-ins
                    </Badge>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {doCoordenador.map((grupo) => {
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
                </section>
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
