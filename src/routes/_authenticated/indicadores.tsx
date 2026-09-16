import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Gauge, Timer, TrendingUp, ClipboardCheck, ListChecks } from "lucide-react";

import { FloatingNav } from "@/components/FloatingNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  carregarIndicadoresExecucao,
  type BlocoIndicador,
  type IndicadorGerente,
  type RegistroExecucao,
} from "@/lib/indicadores-execucao.functions";
import { iniciaisGerente, nomeAmigavel } from "@/lib/areas-gerentes";

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicador de Execução | CIOP" },
      {
        name: "description",
        content:
          "Acompanhe o tempo de execução dos relatórios de supervisão de campo e das fichas de avaliação dos gerentes de área.",
      },
      { property: "og:title", content: "Indicador de Execução | CIOP" },
      {
        property: "og:description",
        content: "Tempo médio de preenchimento e índice de trabalho da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IndicadoresPage,
});

function formatarTempo(segundos: number | null) {
  if (segundos === null || segundos <= 0) return "—";
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  if (min === 0) return `${seg}s`;
  return `${min}min ${String(seg).padStart(2, "0")}s`;
}

function BlocoCard({ bloco }: { bloco: BlocoIndicador }) {
  const Icone = bloco.chave === "supervisao-campo" ? ListChecks : ClipboardCheck;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icone className="size-5 text-primary" />
          {bloco.titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-lg font-bold">{bloco.total}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Tempo médio</p>
            <p className="text-lg font-bold">{formatarTempo(bloco.mediaSegundos)}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Mais rápido</p>
            <p className="text-lg font-bold">{formatarTempo(bloco.menorSegundos)}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Mais demorado</p>
            <p className="text-lg font-bold">{formatarTempo(bloco.maiorSegundos)}</p>
          </div>
        </div>

        {bloco.registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado ainda.</p>
        ) : (
          <div className="grid gap-2">
            {bloco.registros.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.referencia}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.responsavel} · {new Date(r.criadoEm).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant={r.duracaoSegundos ? "secondary" : "outline"}>
                  <Timer className="mr-1 size-3" />
                  {r.duracaoSegundos ? formatarTempo(r.duracaoSegundos) : "sem medição"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {bloco.comTempo < bloco.total && (
          <p className="text-xs text-muted-foreground">
            {bloco.total - bloco.comTempo} registro(s) foram feitos antes da medição de tempo e não
            entram na média.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ListaRegistros({
  titulo,
  registros,
  vazio,
}: {
  titulo: string;
  registros: RegistroExecucao[];
  vazio: string;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">
        {titulo} <span className="text-muted-foreground">({registros.length})</span>
      </h3>
      {registros.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        registros.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.referencia}</p>
              <p className="text-xs text-muted-foreground">
                {r.responsavel} · {new Date(r.criadoEm).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <Badge variant={r.duracaoSegundos ? "secondary" : "outline"}>
              <Timer className="mr-1 size-3" />
              {r.duracaoSegundos ? formatarTempo(r.duracaoSegundos) : "sem medição"}
            </Badge>
          </div>
        ))
      )}
    </section>
  );
}

function PainelGerente({
  gerente,
  aoFechar,
}: {
  gerente: IndicadorGerente | null;
  aoFechar: () => void;
}) {
  return (
    <Sheet open={gerente !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {gerente && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3 text-left">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {iniciaisGerente(gerente.nome)}
                </span>
                <span className="min-w-0 truncate">{nomeAmigavel(gerente.nome)}</span>
              </SheetTitle>
            </SheetHeader>

            <div className="grid gap-5 px-4 pb-8">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Índice de execução</p>
                  <p className="text-xl font-bold">{gerente.indice}%</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Índice das fichas</p>
                  <p className="text-xl font-bold">
                    {gerente.indiceFichas === null ? "—" : `${gerente.indiceFichas}%`}
                  </p>
                </div>
              </div>
              {gerente.indiceFichas !== null && <Progress value={gerente.indiceFichas} />}

              <ListaRegistros
                titulo="Relatórios de supervisão de campo"
                registros={gerente.listaVisitas}
                vazio="Nenhum relatório de supervisão registrado para esta área."
              />
              <ListaRegistros
                titulo="Fichas de avaliação"
                registros={gerente.listaFichas}
                vazio="Nenhuma ficha de avaliação registrada para este gerente."
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CardGerente({
  gerente,
  aoAbrir,
}: {
  gerente: IndicadorGerente;
  aoAbrir: (g: IndicadorGerente) => void;
}) {
  const cor =
    gerente.indice >= 80
      ? "text-emerald-500"
      : gerente.indice >= 50
        ? "text-amber-500"
        : "text-muted-foreground";
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => aoAbrir(gerente)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          aoAbrir(gerente);
        }
      }}
      className="cursor-pointer transition hover:border-primary/60 hover:shadow-md"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-sm">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {iniciaisGerente(gerente.nome)}
          </span>
          <span className="min-w-0 truncate">{nomeAmigavel(gerente.nome)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-end justify-between gap-2">
          <p className={`font-display text-3xl font-bold ${cor}`}>{gerente.indice}%</p>
          <Badge variant={gerente.comTempo > 0 ? "secondary" : "outline"}>
            <Timer className="mr-1 size-3" />
            {gerente.comTempo > 0 ? formatarTempo(gerente.mediaSegundos) : "sem medição"}
          </Badge>
        </div>
        <Progress value={gerente.indice} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border px-2 py-1.5">
            <p className="text-muted-foreground">Supervisões</p>
            <p className="text-base font-bold">{gerente.visitas}</p>
          </div>
          <div className="rounded-lg border border-border px-2 py-1.5">
            <p className="text-muted-foreground">Fichas</p>
            <p className="text-base font-bold">{gerente.fichas}</p>
          </div>
          <div className="rounded-lg border border-border px-2 py-1.5">
            <p className="text-muted-foreground">Mais rápido</p>
            <p className="text-sm font-semibold">{formatarTempo(gerente.menorSegundos)}</p>
          </div>
          <div className="rounded-lg border border-border px-2 py-1.5">
            <p className="text-muted-foreground">Mais demorado</p>
            <p className="text-sm font-semibold">{formatarTempo(gerente.maiorSegundos)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {gerente.ultimoRegistro
            ? `Último registro em ${new Date(gerente.ultimoRegistro).toLocaleDateString("pt-BR")}`
            : "Nenhum registro no período."}
        </p>
      </CardContent>
    </Card>
  );
}

function IndicadoresPage() {
  const carregar = useServerFn(carregarIndicadoresExecucao);
  const consulta = useQuery({
    queryKey: ["indicadores-execucao"],
    queryFn: () => carregar(),
  });

  const dados = consulta.data;
  const [gerenteSelecionado, setGerenteSelecionado] = useState<IndicadorGerente | null>(null);

  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Início
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-2xl font-bold sm:text-3xl">
            <Gauge className="size-7 text-primary" />
            Indicador de Execução
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tempo gasto para preencher o relatório de supervisão de campo e a ficha de avaliação dos
            gerentes de área, com o índice de trabalho da equipe.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-5 text-primary" />
              Índice de trabalho
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="font-display text-4xl font-bold">{dados?.indiceTrabalho ?? 0}%</p>
            <Progress value={dados?.indiceTrabalho ?? 0} />
            <p className="text-xs text-muted-foreground">
              Combina a quantidade de registros entregues com a agilidade no preenchimento.
            </p>
          </CardContent>
        </Card>

        {consulta.isLoading && <p className="text-sm text-muted-foreground">Carregando dados...</p>}
        {dados && !dados.ok && (
          <p className="text-sm text-destructive">
            {dados.erro ?? "Não foi possível carregar os indicadores."}
          </p>
        )}

        {dados?.gerentes && dados.gerentes.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Indicador por gerente de área
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dados.gerentes.map((g) => (
                <CardGerente key={g.nome} gerente={g} aoAbrir={setGerenteSelecionado} />
              ))}
            </div>
          </section>
        )}

        {dados?.blocos.map((b) => (
          <BlocoCard key={b.chave} bloco={b} />
        ))}
      </div>

      <PainelGerente gerente={gerenteSelecionado} aoFechar={() => setGerenteSelecionado(null)} />

      <FloatingNav />
    </main>
  );
}
