/**
 * Dossiê do médico investigado pela Manus AI no verificador de atestados.
 */
import { ExternalLink, ShieldAlert, ShieldCheck, Stethoscope } from "lucide-react";
import type { DossieMedico } from "@/lib/manus-medico";

function ListaChips({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((i, idx) => (
          <span
            key={`${i}-${idx}`}
            className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground"
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DossieMedicoCard({ dossie }: { dossie?: DossieMedico | undefined }) {
  if (!dossie) return null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Stethoscope className="size-4 text-amber-600" />
        Dossiê do médico (Manus AI)
      </h2>

      {!dossie.disponivel ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {dossie.mensagem || "Dossiê do médico indisponível."}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-amber-200/60 bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                dossie.registroValido === "sim"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : dossie.registroValido === "nao"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {dossie.registroValido === "nao" ? (
                <ShieldAlert className="size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Registro:{" "}
              {dossie.registroValido === "sim"
                ? "confirmado"
                : dossie.registroValido === "nao"
                  ? "não confirmado"
                  : "indeterminado"}
            </span>
            <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Risco de fraude: {dossie.riscoFraude}%
            </span>
            <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Confiabilidade: {dossie.confiabilidade}%
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Nome completo", dossie.nomeCompleto],
              ["CRM", [dossie.crm, dossie.ufCrm].filter(Boolean).join(" / ")],
              ["Situação do registro", dossie.situacaoRegistro],
              ["Inscrição primária", dossie.inscricaoPrimaria],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-xs uppercase text-muted-foreground">{k}</p>
                  <p className="text-sm font-medium text-foreground">{v}</p>
                </div>
              ))}
          </div>

          <ListaChips titulo="Especialidades" itens={dossie.especialidades} />
          <ListaChips titulo="Outras inscrições" itens={dossie.outrasInscricoes} />
          <ListaChips titulo="Locais de atendimento" itens={dossie.locaisAtendimento} />
          <ListaChips titulo="Telefones" itens={dossie.telefones} />
          <ListaChips titulo="Endereços" itens={dossie.enderecos} />
          <ListaChips titulo="Vínculos" itens={dossie.vinculos} />

          {dossie.sancoes.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-semibold uppercase text-destructive">
                Sanções / processos encontrados
              </p>
              {dossie.sancoes.map((s, i) => (
                <p key={i} className="text-sm text-destructive">
                  {s}
                </p>
              ))}
            </div>
          ) : null}

          {dossie.alertas.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">
                Alertas
              </p>
              {dossie.alertas.map((a, i) => (
                <p key={i} className="text-sm text-amber-700 dark:text-amber-200">
                  {a}
                </p>
              ))}
            </div>
          ) : null}

          {dossie.detalhes.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Campo</th>
                    <th className="px-3 py-2 font-semibold">O que foi encontrado</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {dossie.detalhes.map((d, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{d.campo}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.valor || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            d.situacao === "divergente"
                              ? "text-destructive"
                              : d.situacao === "nao_encontrado"
                                ? "text-muted-foreground"
                                : "text-emerald-600 dark:text-emerald-400"
                          }
                        >
                          {d.situacao === "divergente"
                            ? "Divergente"
                            : d.situacao === "nao_encontrado"
                              ? "Não encontrado"
                              : "Confirmado"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {d.fonte ? (
                          <a
                            href={d.fonte}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            abrir
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {dossie.conclusao ? (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground">
              {dossie.conclusao}
            </p>
          ) : null}

          {dossie.fontes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Fontes consultadas
              </p>
              {dossie.fontes.map((f, i) => (
                <a
                  key={`${f.url}-${i}`}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
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
