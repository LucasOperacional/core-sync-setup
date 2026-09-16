import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/dashboard-utils";
import { aguardarSessao } from "@/lib/aguardar-sessao";
import {
  listarVagasAprovacao,
  fecharVagas,
  type VagaSolicitacao,
} from "@/lib/vagas-aprovacao.functions";

export const Route = createFileRoute("/_authenticated/rh")({
  head: () => ({
    meta: [
      { title: "RH" },
      {
        name: "description",
        content: "Central de recursos humanos do sistema operacional.",
      },
    ],
  }),
  component: RhPage,
});

function RhPage() {
  const listar = useServerFn(listarVagasAprovacao);
  const fechar = useServerFn(fecharVagas);
  const [vagas, setVagas] = useState<VagaSolicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [fechandoPosto, setFechandoPosto] = useState<string | null>(null);

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

  async function fecharPosto(posto: string, ids: string[]) {
    if (
      !window.confirm(
        `Fechar ${ids.length} vaga(s) em aberto do posto ${posto}? Elas saem da lista de vagas abertas.`,
      )
    )
      return;
    setFechandoPosto(posto);
    try {
      const r = await fechar({ data: { ids, posto } });
      toast.success(`${r.fechadas} vaga(s) fechada(s) em ${posto}.`);
      await buscar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível fechar as vagas.");
    } finally {
      setFechandoPosto(null);
    }
  }

  function nomePosto(v: VagaSolicitacao) {
    return (v.posto || v.localidade || "—").trim() || "—";
  }

  function statusVaga(v: VagaSolicitacao) {
    return v.status === "fechada" ? "FECHADA" : "ABERTA";
  }

  function linhasRelatorio() {
    const totalPorPosto = new Map<string, number>();
    for (const v of vagas) {
      const chave = nomePosto(v).toUpperCase();
      totalPorPosto.set(chave, (totalPorPosto.get(chave) ?? 0) + 1);
    }
    return vagas.map((v) => [
      nomePosto(v),
      v.cargo || "—",
      String(totalPorPosto.get(nomePosto(v).toUpperCase()) ?? 1),
      statusVaga(v),
    ]);
  }

  function exportarCsv() {
    if (vagas.length === 0) {
      toast.error("Não há vagas para exportar.");
      return;
    }
    downloadCsv(
      "relatorio-vagas",
      ["POSTO", "CARGO", "VAGAS ABERTAS NO POSTO", "STATUS"],
      linhasRelatorio(),
    );
    toast.success("Relatório CSV gerado.");
  }

  function exportarExcel() {
    if (vagas.length === 0) {
      toast.error("Não há vagas para exportar.");
      return;
    }
    const esc = (t: string) => String(t).replace(/</g, "&lt;");
    const linhas = linhasRelatorio()
      .map((colunas) => `<tr>${colunas.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table border="1"><thead><tr><th>POSTO</th><th>CARGO</th><th>VAGAS ABERTAS NO POSTO</th><th>STATUS</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-vagas.xls";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Relatório Excel (XLS) gerado.");
  }

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

  const abertasPorPosto = useMemo(() => {
    const mapa = new Map<
      string,
      { pendentes: number; aprovadas: number; total: number; ids: string[] }
    >();
    for (const v of vagas) {
      if (v.status === "recusada" || v.status === "fechada") continue;
      const posto = (v.posto || v.localidade || "SEM POSTO").trim().toUpperCase();
      const atual = mapa.get(posto) ?? { pendentes: 0, aprovadas: 0, total: 0, ids: [] };
      if (v.status === "aprovada") atual.aprovadas += 1;
      else atual.pendentes += 1;
      atual.total += 1;
      atual.ids.push(v.id);
      mapa.set(posto, atual);
    }
    return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  }, [vagas]);

  const totalAbertas = abertasPorPosto.reduce((s, [, q]) => s + q.total, 0);

  return (
    <main className="min-h-screen pb-24 flex flex-col">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Building2 className="size-10 text-rose-500" />
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">RH</h1>
              <p className="text-sm text-muted-foreground">
                Central de recursos humanos — em desenvolvimento.
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
                <MapPin className="size-5 text-primary" />
                Vagas abertas por posto
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Um card por posto criado automaticamente quando uma vaga é aberta, com a quantidade
                em andamento.
              </p>
            </div>
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600">
              {totalAbertas} vaga(s) em aberto · {abertasPorPosto.length} posto(s)
            </span>
          </div>

          {carregando ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando vagas...
            </div>
          ) : abertasPorPosto.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhuma vaga aberta até agora.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {abertasPorPosto.map(([posto, dados]) => (
                <div key={posto} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {posto}
                    </p>
                    <MapPin className="size-4 text-sky-500" />
                  </div>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {dados.total}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      vaga(s) em aberto
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600">
                      {dados.pendentes} aguardando aprovação
                    </span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600">
                      {dados.aprovadas} aprovada(s)
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={fechandoPosto === posto}
                    onClick={() => void fecharPosto(posto, dados.ids)}
                  >
                    {fechandoPosto === posto ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Lock className="size-4" />
                    )}
                    Fechar vagas
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

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

        <section className="panel p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold uppercase">Relatório de vagas</h2>
            <p className="text-xs text-muted-foreground">
              Exporte ou limpe as vagas abertas no sistema.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportarExcel}
              disabled={vagas.length === 0}
            >
              <FileSpreadsheet className="size-4" /> Excel (XLS)
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={vagas.length === 0}>
              <Download className="size-4" /> CSV
            </Button>
          </div>
        </section>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Building2 className="mx-auto size-16 text-muted-foreground/30" />
          <h2 className="mt-4 text-lg font-semibold">Página em construção</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O módulo de RH será configurado em breve. Enquanto isso, utilize os demais cards do
            painel central.
          </p>
        </div>
      </div>
    </main>
  );
}
