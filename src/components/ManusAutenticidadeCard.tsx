/**
 * Investigação de autenticidade do atestado feita pela Manus AI.
 */
import { ExternalLink, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import {
  ROTULO_VEREDITO_MANUS,
  type ManusAutenticidade,
  type VereditoManus,
} from "@/lib/manus-autenticidade";

const CORES: Record<VereditoManus, string> = {
  autentico: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  suspeito: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  falso: "border-red-500/40 bg-red-500/10 text-red-700",
  inconclusivo: "border-muted bg-muted/40 text-muted-foreground",
};

const CORES_SITUACAO: Record<string, string> = {
  confere: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  divergente: "border-red-500/40 bg-red-500/10 text-red-700",
  nao_encontrado: "border-amber-500/40 bg-amber-500/10 text-amber-700",
};

const CORES_GRAVIDADE: Record<string, string> = {
  alta: "border-red-500/40 bg-red-500/10 text-red-700",
  media: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  baixa: "border-input bg-background text-foreground",
};

const ROTULO_TRIO: Record<string, string> = {
  sim: "Confirmado",
  nao: "Não confirmado",
  indeterminado: "Não conclusivo",
};

const ROTULO_RECOMENDACAO: Record<string, string> = {
  aceitar: "Aceitar o atestado",
  revisar: "Revisar manualmente",
  recusar: "Recusar / apurar",
  indisponivel: "Sem recomendação",
};

export function ManusAutenticidadeCard({
  investigacao,
}: {
  investigacao?: ManusAutenticidade | undefined;
}) {
  if (!investigacao) {
    return (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Search className="size-4 text-primary" />
          Investigação de autenticidade (Manus AI)
        </h2>
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          A investigação de autenticidade não foi executada para este documento.
        </p>
      </section>
    );
  }

  const v = investigacao.veredito;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Search className="size-4 text-primary" />
        Investigação de autenticidade (Manus AI)
      </h2>

      {!investigacao.disponivel ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {investigacao.mensagem || "Investigação de autenticidade indisponível."}
        </p>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${CORES[v]}`}
            >
              {v === "autentico" ? (
                <ShieldCheck className="size-3.5" />
              ) : v === "inconclusivo" ? (
                <ShieldQuestion className="size-3.5" />
              ) : (
                <ShieldAlert className="size-3.5" />
              )}
              {ROTULO_VEREDITO_MANUS[v]}
            </span>
            <span className="text-xs text-muted-foreground">
              Risco de falsidade: {investigacao.probabilidadeFalsidade}% · Confiança:{" "}
              {investigacao.confianca}%
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1 text-xs font-semibold text-foreground">
              {ROTULO_RECOMENDACAO[investigacao.recomendacao]}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Registro do médico", investigacao.registroMedicoConfirmado],
              ["Estabelecimento", investigacao.estabelecimentoConfirmado],
              ["Documento no emissor", investigacao.documentoConfirmadoPeloEmissor],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-input bg-background p-2">
                <p className="text-xs uppercase text-muted-foreground">{rotulo}</p>
                <p className="text-sm text-foreground">{ROTULO_TRIO[valor ?? ""] ?? valor}</p>
              </div>
            ))}
          </div>

          {investigacao.parecer ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {investigacao.parecer}
            </p>
          ) : null}

          {investigacao.indiciosFraude.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Indícios encontrados
              </p>
              {investigacao.indiciosFraude.map((i, k) => (
                <div
                  key={`${i.indicio}-${k}`}
                  className={`rounded-lg border p-2 text-xs ${CORES_GRAVIDADE[i.gravidade] ?? CORES_GRAVIDADE["baixa"]}`}
                >
                  <p className="font-semibold">Gravidade {i.gravidade}</p>
                  <p>{i.indicio}</p>
                  {i.fonte ? (
                    <a
                      href={i.fonte}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      <ExternalLink className="size-3" />
                      fonte
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {investigacao.evidencias.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Conferência com as fontes oficiais
              </p>
              {investigacao.evidencias.map((e, k) => (
                <div
                  key={`${e.campo}-${k}`}
                  className={`rounded-lg border p-2 text-xs ${CORES_SITUACAO[e.situacao]}`}
                >
                  <p className="font-semibold">{e.campo}</p>
                  <p>Atestado: {e.valorNoAtestado || "—"}</p>
                  <p>Fonte: {e.valorNaFonte || "—"}</p>
                  {e.comentario ? <p className="mt-1">{e.comentario}</p> : null}
                  {e.fonte ? (
                    <a
                      href={e.fonte}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      <ExternalLink className="size-3" />
                      {e.fonte}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {investigacao.investigacoesRealizadas.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Consultas realizadas
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {investigacao.investigacoesRealizadas.map((c, k) => (
                  <li key={`${c}-${k}`}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {investigacao.limitacoes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Limitações</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {investigacao.limitacoes.map((l, k) => (
                  <li key={`${l}-${k}`}>{l}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {investigacao.relatorioCompleto ? (
            <details className="rounded-lg border border-input bg-background p-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">
                Relatório completo da Manus AI
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                {investigacao.relatorioCompleto}
              </pre>
            </details>
          ) : null}

          {investigacao.fontes.length > 0 ? (
            <div className="space-y-1">
              {investigacao.fontes.map((f, k) => (
                <a
                  key={`${f.url}-${k}`}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                >
                  <ExternalLink className="size-3" />
                  {f.titulo || f.url}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
