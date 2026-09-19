import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { aguardarSessao } from "@/lib/aguardar-sessao";
import {
  listarVagasAprovacao,
  type VagaSolicitacao,
} from "@/lib/vagas-aprovacao.functions";

export const Route = createFileRoute("/_authenticated/vagas-aprovadas")({
  head: () => ({
    meta: [
      { title: "Vagas aprovadas" },
      {
        name: "description",
        content: "Indicadores de vagas aprovadas por posto.",
      },
      { property: "og:title", content: "Vagas aprovadas" },
      {
        property: "og:description",
        content: "Indicadores de vagas aprovadas por posto.",
      },
    ],
  }),
  component: VagasAprovadasPage,
});

function VagasAprovadasPage() {
  const listar = useServerFn(listarVagasAprovacao);
  const [vagas, setVagas] = useState<VagaSolicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    try {
      const sessao = await aguardarSessao();
      if (!sessao) return;
      const resultado = await listar();
      setVagas(resultado);
    } catch (erro) {
      toast.error("Não foi possível carregar as vagas.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void buscar();
    const intervalo = setInterval(() => void buscar(), 60_000);
    return () => clearInterval(intervalo);
  }, [buscar]);

  const aprovadasPorPosto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of vagas) {
      if (v.status !== "aprovada") continue;
      const posto = (v.posto || v.localidade || "SEM POSTO").trim().toUpperCase();
      mapa.set(posto, (mapa.get(posto) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [vagas]);

  const totalAprovadas = aprovadasPorPosto.reduce((s, [, q]) => s + q, 0);

  return (
    <main className="min-h-screen pb-24 flex flex-col">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/rh">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <BarChart3 className="size-10 text-emerald-500" />
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Vagas aprovadas</h1>
              <p className="text-sm text-muted-foreground">
                Indicadores de vagas aprovadas por posto.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 space-y-6">
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold uppercase">
                <BarChart3 className="size-5 text-primary" />
                Indicadores de vagas aprovadas
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Quantidade de vagas aprovadas por posto.
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
              {totalAprovadas} aprovada(s) · {aprovadasPorPosto.length} posto(s)
            </span>
          </div>

          {carregando ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando indicadores...
            </div>
          ) : aprovadasPorPosto.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhuma vaga aprovada até agora.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aprovadasPorPosto.map(([posto, quantidade]) => (
                <div key={posto} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {posto}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">{quantidade}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${Math.max(
                          8,
                          (quantidade / (aprovadasPorPosto[0]?.[1] || 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Building2 className="mx-auto size-16 text-muted-foreground/30" />
          <h2 className="mt-4 text-lg font-semibold">Indicadores atualizados automaticamente</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Os totais são recarregados a cada minuto com as vagas aprovadas no sistema.
          </p>
        </div>
      </div>
    </main>
  );
}
