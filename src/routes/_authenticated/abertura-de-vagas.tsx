import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { aguardarSessao } from "@/lib/aguardar-sessao";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingNav } from "@/components/FloatingNav";

import {
  decidirVaga,
  limparVagasAprovacao,
  linkPdfVaga,
  listarVagasAprovacao,
  reavaliarVagasPendentes,
  reenviarEmailVaga,
  type VagaSolicitacao,
} from "@/lib/vagas-aprovacao.functions";

export const Route = createFileRoute("/_authenticated/abertura-de-vagas")({
  head: () => ({
    meta: [
      { title: "Coordenação - Abertura de Vagas" },
      {
        name: "description",
        content:
          "Central de aprovação das vagas abertas, com conferência automática das regras antes da liberação.",
      },
      { property: "og:title", content: "Coordenação - Abertura de Vagas" },
      {
        property: "og:description",
        content: "Aprovação automática e conferência das vagas abertas pela supervisão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AprovacaoVagasPage,
});

const SITUACOES = {
  aprovada: {
    rotulo: "Aprovada",
    classe: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    icone: CheckCircle2,
  },
  pendente: {
    rotulo: "Aguardando conferência",
    classe: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    icone: Clock,
  },
  recusada: {
    rotulo: "Recusada",
    classe: "bg-destructive/10 text-destructive border-destructive/30",
    icone: XCircle,
  },
} as const;

function situacao(status: string) {
  return SITUACOES[status as keyof typeof SITUACOES] ?? SITUACOES.pendente;
}

function dataBr(valor?: string | null) {
  if (!valor) return "—";
  const d = new Date(valor.length <= 10 ? `${valor}T12:00:00` : valor);
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString("pt-BR");
}

function AprovacaoVagasPage() {
  const listar = useServerFn(listarVagasAprovacao);
  const reavaliar = useServerFn(reavaliarVagasPendentes);
  const decidir = useServerFn(decidirVaga);
  const abrirPdf = useServerFn(linkPdfVaga);
  const limparTudo = useServerFn(limparVagasAprovacao);
  const reenviar = useServerFn(reenviarEmailVaga);

  const [vagas, setVagas] = useState<VagaSolicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "pendente" | "aprovada" | "recusada">("todas");
  const [vagasExpandidas, setVagasExpandidas] = useState<Set<string>>(new Set());

  function alternarDetalhes(id: string) {
    setVagasExpandidas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(id)) {
        proximas.delete(id);
      } else {
        proximas.add(id);
      }
      return proximas;
    });
  }

  const carregar = useCallback(async () => {
    try {
      const sessao = await aguardarSessao();
      if (!sessao) return;
      const dados = await listar({});
      setVagas(dados);
    } catch (erro) {
      toast.error("Não foi possível carregar as vagas abertas.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  async function rodarAutomatico() {
    setProcessando("auto");
    try {
      const r = await reavaliar({});
      toast.success(
        r.aprovadas > 0
          ? `${r.aprovadas} vaga(s) aprovada(s) · ${r.emailsEnviados} e-mail(is) enviado(s).`
          : "Nenhuma vaga atendeu às regras automáticas agora.",
        { description: `${r.analisadas} vaga(s) conferida(s).` },
      );
      await carregar();
    } catch (erro) {
      toast.error("A conferência automática falhou.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setProcessando(null);
    }
  }

  async function limparLista() {
    if (!window.confirm("Apagar todas as vagas? Essa ação não pode ser desfeita.")) {
      return;
    }
    setProcessando("limpar");
    try {
      const r = await limparTudo({});
      toast.success(
        r.removidas > 0 ? `${r.removidas} vaga(s) removida(s).` : "Não havia vagas para remover.",
      );
      await carregar();
    } catch (erro) {
      toast.error("Não foi possível limpar as vagas.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setProcessando(null);
    }
  }

  async function decidirManual(id: string, decisao: "aprovada" | "recusada") {
    setProcessando(id);
    try {
      const r = await decidir({ data: { id, decisao } });
      if (decisao === "aprovada") {
        toast.success("Vaga aprovada.", {
          description:
            r.email === "enviado"
              ? "O e-mail da solicitação foi enviado automaticamente."
              : r.email === "sem_destinatario"
                ? "Nenhum e-mail de destino foi informado na abertura da vaga."
                : "A vaga foi aprovada, mas o e-mail não pôde ser enviado agora.",
        });
      } else {
        toast.success("Vaga recusada.");
      }
      await carregar();
    } catch (erro) {
      toast.error("Não foi possível registrar a decisão.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setProcessando(null);
    }
  }

  async function verPdf(caminho: string) {
    try {
      const { url } = await abrirPdf({ data: { caminho } });
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir o PDF da solicitação.");
    }
  }

  async function reenviarEmail(id: string) {
    setProcessando(`reenviar-${id}`);
    try {
      const r = (await reenviar({ data: { id } })) as { destino?: string };
      toast.success("E-mail enviado novamente.", {
        description: r?.destino ? `Enviado para ${r.destino}` : undefined,
      });
      await carregar();
    } catch (erro) {
      toast.error("Não foi possível reenviar o e-mail.", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setProcessando(null);
    }
  }

  const contagens = useMemo(
    () => ({
      todas: vagas.length,
      pendente: vagas.filter((v) => v.status === "pendente").length,
      aprovada: vagas.filter((v) => v.status === "aprovada").length,
      recusada: vagas.filter((v) => v.status === "recusada").length,
    }),
    [vagas],
  );

  const lista = filtro === "todas" ? vagas : vagas.filter((v) => v.status === filtro);

  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Link
            to="/coordenacao"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <ShieldCheck className="size-8 text-primary" />
            Coordenação - Abertura de Vagas
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-4 px-6 py-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              COORDENAÇÃO - ABERTURA DE VAGAS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {(["todas", "pendente", "aprovada", "recusada"] as const).map((chave) => (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setFiltro(chave)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filtro === chave
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {chave === "todas" ? "Todas" : situacao(chave).rotulo} ({contagens[chave]})
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={rodarAutomatico}
                disabled={processando === "auto"}
              >
                {processando === "auto" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Rodar aprovação automática
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={limparLista}
                disabled={processando === "limpar" || vagas.length === 0}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {processando === "limpar" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Limpar todas as vagas
              </Button>
            </div>
          </CardContent>
        </Card>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando vagas abertas...
          </div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma vaga nesta situação.</p>
        ) : (
          <div className="flex w-full flex-wrap items-start justify-center gap-6">
            {lista.map((vaga) => {
              const info = situacao(vaga.status);
              const Icone = info.icone;
              const expandida = vagasExpandidas.has(vaga.id);

              return (
                <article
                  key={vaga.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => alternarDetalhes(vaga.id)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      alternarDetalhes(vaga.id);
                    }
                  }}
                  className="group flex w-[200px] max-w-full shrink-0 flex-col overflow-hidden rounded-[14px] border-t-2 border-red-500 bg-gradient-to-b from-black via-zinc-950 to-red-950/90 text-white shadow-lg shadow-red-950/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-500/70 sm:w-[248px]"
                >
                  <div className="flex h-[334px] flex-col items-center justify-center px-4 py-6 text-center sm:h-[414px] sm:px-6 sm:py-8">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/40 transition-transform duration-300 group-hover:scale-110 sm:size-16">
                      <Icone className="size-7 sm:size-8" />
                    </div>
                    <h2 className="mt-5 line-clamp-2 text-base font-bold uppercase tracking-wide text-white sm:mt-6 sm:text-lg">
                      {vaga.cargo || "Vaga aberta"}
                    </h2>
                    <div className="my-4 h-0.5 w-16 shrink-0 bg-red-500 sm:my-5" />
                    <p className="line-clamp-3 text-xs leading-relaxed text-gray-300 sm:text-sm">
                      {[vaga.posto, vaga.localidade].filter(Boolean).join(" · ") ||
                        "Sem posto definido"}
                    </p>
                    <span className="mt-4 rounded-full border border-red-400/40 bg-red-950/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-100 sm:px-4 sm:py-1.5 sm:text-xs">
                      {info.rotulo}
                    </span>
                    <p className="mt-3 line-clamp-2 text-[10px] text-gray-400 sm:text-xs">
                      Início {dataBr(vaga.data_inicio)} · Aberta em {dataBr(vaga.created_at)}
                    </p>
                    <button
                      type="button"
                      onClick={(evento) => {
                        evento.stopPropagation();
                        alternarDetalhes(vaga.id);
                      }}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 sm:mt-6 sm:px-5 sm:py-3"
                    >
                      {expandida ? "Fechar" : "Acessar"}
                      <ArrowRight className="size-4" />
                    </button>
                  </div>

                  {expandida ? (
                    <div
                      className="border-t border-red-500/30 bg-black/40 px-5 py-5 text-left"
                      onClick={(evento) => evento.stopPropagation()}
                    >
                      <dl className="grid gap-3 text-xs">
                        {[
                          ["Solicitante", vaga.solicitante],
                          ["Fiscal responsável", vaga.fiscal_responsavel],
                          ["Tipo", vaga.tipo],
                          ["Salário", vaga.salario],
                          ["Horário", vaga.horario],
                        ].map(([rotulo, valor]) => (
                          <div key={rotulo as string}>
                            <dt className="text-gray-400">{rotulo}</dt>
                            <dd className="font-medium text-white">{valor || "—"}</dd>
                          </div>
                        ))}
                      </dl>

                      {vaga.motivo_decisao ? (
                        <p className="mt-4 flex items-start gap-2 text-xs text-gray-300">
                          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                          {vaga.motivo_decisao}
                        </p>
                      ) : null}

                      {vaga.pendencias?.length ? (
                        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                          {vaga.pendencias.map((p) => (
                            <li key={p}>• {p}</li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-2">
                        {vaga.caminho_pdf ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verPdf(vaga.caminho_pdf!)}
                          >
                            <FileText className="size-4" /> Ver PDF
                          </Button>
                        ) : null}
                        {vaga.status === "aprovada" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reenviarEmail(vaga.id)}
                            disabled={processando === `reenviar-${vaga.id}`}
                          >
                            {processando === `reenviar-${vaga.id}` ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Mail className="size-4" />
                            )}
                            Enviar novamente
                          </Button>
                        ) : null}
                        {vaga.status !== "aprovada" ? (
                          <Button
                            size="sm"
                            onClick={() => decidirManual(vaga.id, "aprovada")}
                            disabled={processando === vaga.id}
                          >
                            {processando === vaga.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            Aprovar
                          </Button>
                        ) : null}
                        {vaga.status !== "recusada" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decidirManual(vaga.id, "recusada")}
                            disabled={processando === vaga.id}
                          >
                            <XCircle className="size-4" /> Recusar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <FloatingNav />
    </main>
  );
}
