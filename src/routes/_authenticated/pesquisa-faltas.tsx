import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarX2, Search, X, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { LancarFaltaNextiCard } from "@/components/LancarFaltaNextiCard";
import { pesquisarFaltasNexti } from "@/lib/nexti-ativos.functions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/pesquisa-faltas")({
  head: () => ({
    meta: [
      { title: "Pesquisar Faltas | Supervisor" },
      { name: "description", content: "Consulte faltas e ausências diretamente na NEXTI." },
      { property: "og:title", content: "Pesquisar Faltas | Supervisor" },
      { property: "og:description", content: "Consulte faltas e ausências diretamente na NEXTI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PesquisaFaltasPage,
});

function PesquisaFaltasPage() {
  const [termo, setTermo] = useState("");
  const [apenasFaltas, setApenasFaltas] = useState(true);
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: faltasCache = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["nexti-faltas", apenasFaltas],
    queryFn: async () => {
      const res = await pesquisarFaltasNexti({ data: { apenasFaltas } });
      if (!res.ok) throw new Error(res.erro || "Erro ao consultar a API da NEXTI.");
      return res.faltas;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await pesquisarFaltasNexti({ data: { forcarSincronizar: true, apenasFaltas } });
      if (!res.ok) {
        throw new Error(res.erro || "Erro ao consultar faltas na API NEXTI.");
      }
      await queryClient.invalidateQueries({ queryKey: ["nexti-faltas"] });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const faltas = faltasCache.filter((f) => {
    if (!termo.trim()) return true;
    const alvo = `${f.colaborador} ${f.cargo} ${f.periodo} ${f.tipo}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const termos = termo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/);
    return termos.every((t) => alvo.includes(t));
  });

  const handleClear = () => {
    setTermo("");
  };

  return (
    <main className="min-h-screen flex flex-col pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <Link
              to="/supervisor"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Voltar para Supervisão
            </Link>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl text-foreground uppercase">
              Pesquisar Faltas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Busca de ocorrências e registros de faltas integrados automaticamente da API NEXTI.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 py-8">
        <section className="panel space-y-4 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarX2 className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Pesquisar faltas na NEXTI</h2>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Sincronizando..." : "Atualizar da API"}
            </button>
          </div>

          <div className="flex items-center space-x-2 py-1">
            <Switch
              id="apenas-faltas"
              checked={apenasFaltas}
              onCheckedChange={setApenasFaltas}
              disabled={isLoading}
            />
            <Label
              htmlFor="apenas-faltas"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Exibir apenas registros de FALTAS e AUSÊNCIAS
            </Label>
          </div>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-1 text-xs font-medium text-muted-foreground mt-2"
          >
            Buscar resultados instantaneamente (tempo real)
            <span className="relative flex items-center w-full">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Busque por colaborador, cargo, data ou tipo de ocorrência..."
                className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
                disabled={isLoading && faltasCache.length === 0}
              />
              {termo ? (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Limpar busca"
                  className="absolute right-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </span>
          </form>

          {error ? (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <p>
                {error instanceof Error ? error.message : "Erro desconhecido ao carregar faltas."}
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground uppercase">
                    NOME DO COLABORADOR
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground uppercase">CARGO</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground uppercase">TIPO</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground uppercase">PERÍODO</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && faltasCache.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="size-6 animate-spin text-primary" />
                        <span>
                          Resgatando ocorrências da NEXTI (isso pode levar alguns segundos)...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : faltas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {termo
                        ? "Nenhuma ocorrência encontrada para essa pesquisa."
                        : "Nenhum registro listado no momento."}
                    </td>
                  </tr>
                ) : (
                  faltas.map((i, idx) => (
                    <tr
                      key={`${i.colaborador}-${i.periodo}-${idx}`}
                      className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
                    >
                      <td className="px-3 py-3 text-foreground font-medium">{i.colaborador}</td>
                      <td className="px-3 py-3 text-foreground">{i.cargo || "—"}</td>
                      <td className="px-3 py-3 text-foreground">
                        <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          {i.tipo || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-foreground whitespace-nowrap">
                        {i.periodo || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && faltasCache.length > 0 && (
            <div className="text-right text-xs text-muted-foreground mt-2">
              Mostrando {faltas.length} {faltas.length === 1 ? "registro" : "registros"}
            </div>
          )}
        </section>

        <LancarFaltaNextiCard />
      </div>
      <FloatingNav />
    </main>
  );
}
