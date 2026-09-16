import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ClipboardCheck, MapPin, TriangleAlert, User } from "lucide-react";

import { carregarVisitaPorId, type VisitaSupervisao } from "@/lib/nexti-visitas";

export const Route = createFileRoute("/_authenticated/relatorios-visita/$id")({
  component: RelatorioVisitaPage,
  head: () => ({
    meta: [
      { title: "Relatório de visita completo · NEXTI Control" },
      {
        name: "description",
        content:
          "Visualize o relatório de visita do NEXTI Control 2.0 com todas as perguntas, respostas e observações do supervisor.",
      },
      { property: "og:title", content: "Relatório de visita completo · NEXTI Control" },
      {
        property: "og:description",
        content:
          "Perguntas, respostas e observações completas de uma visita de supervisão registrada na NEXTI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function RelatorioVisitaPage() {
  const { id } = Route.useParams();
  const [visita, setVisita] = useState<VisitaSupervisao | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    void carregarVisitaPorId(id)
      .then(setVisita)
      .catch(() => setVisita(null))
      .finally(() => setCarregando(false));
  }, [id]);

  const conformidade =
    visita && visita.conformes + visita.naoConformes
      ? Math.round((visita.conformes / (visita.conformes + visita.naoConformes)) * 100)
      : 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            NEXTI Control 2.0 · Relatório de visita
          </p>
          <h1 className="font-display text-2xl font-bold">
            {visita
              ? visita.posto
              : carregando
                ? "Carregando relatório..."
                : "Relatório não encontrado"}
          </h1>
          {visita ? (
            <p className="text-sm text-muted-foreground">
              {visita.checklist} · {formatarData(visita.data)}
            </p>
          ) : null}
        </div>
        <Link
          to="/control"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao Control
        </Link>
      </div>

      {visita ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="size-3.5" /> Gerente de Área A
              </p>
              <p className="mt-1 text-sm font-semibold">{visita.supervisor}</p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="size-3.5" /> Local
              </p>
              <p className="mt-1 text-sm font-semibold">{visita.cliente || visita.posto}</p>
              <p className="text-xs text-muted-foreground">
                {[visita.cidade, visita.uf].filter(Boolean).join(" / ") || "—"}
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardCheck className="size-3.5" /> Perguntas
              </p>
              <p className="mt-1 font-display text-2xl font-bold">
                {visita.itens.length || visita.total}
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5" /> Conformidade
              </p>
              <p className="mt-1 font-display text-2xl font-bold">{conformidade}%</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-success">{visita.conformes} conforme(s)</span> ·{" "}
                <span className="font-semibold text-destructive">{visita.naoConformes} N/C</span>
              </p>
            </div>
          </div>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Perguntas e respostas do relatório</h2>
            <p className="text-xs text-muted-foreground">
              Conteúdo completo importado da NEXTI, na ordem do checklist.
            </p>
            <ol className="mt-4 space-y-3">
              {visita.itens.length ? (
                visita.itens.map((item, i) => (
                  <li
                    key={`${item.pergunta}-${i}`}
                    className="rounded-xl border border-border/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="max-w-2xl text-sm font-medium">
                        <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                        {item.pergunta}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                          item.conforme
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {item.conforme ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <TriangleAlert className="size-3.5" />
                        )}
                        {item.conforme ? "Conforme" : "Não conforme"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Resposta:{" "}
                      </span>
                      <span className="font-semibold">{item.resposta || "—"}</span>
                    </p>
                    {item.observacao ? (
                      <p className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Observação: </span>
                        {item.observacao}
                      </p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted-foreground">
                  Este relatório não possui itens detalhados importados da NEXTI.
                </li>
              )}
            </ol>
          </section>
        </>
      ) : carregando ? (
        <p className="text-sm text-muted-foreground">Carregando relatório de visita...</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Não localizamos este relatório de visita. Volte ao Control e escolha outro card.
        </p>
      )}
    </div>
  );
}
