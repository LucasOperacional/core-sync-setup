/**
 * Leitura e validação do QR Code do atestado (Manus AI).
 */
import { ExternalLink, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import type { QrCodeValidacao } from "@/lib/manus-qrcode";

const CORES: Record<string, string> = {
  confere: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  divergente: "border-red-500/40 bg-red-500/10 text-red-700",
  nao_encontrado: "border-amber-500/40 bg-amber-500/10 text-amber-700",
};

export function QrCodeAtestadoCard({ qr }: { qr?: QrCodeValidacao | undefined }) {
  if (!qr) return null;

  const confirmado = qr.documentoConfirmado === "sim" && qr.medicoConfere !== "nao";

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <QrCode className="size-4 text-primary" />
        QR Code do atestado (Manus AI)
      </h2>

      {qr.codigos.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Códigos lidos no documento
          </p>
          {qr.codigos.map((c, i) => (
            <p key={`${c.conteudo}-${i}`} className="break-all text-sm text-foreground">
              <span className="text-muted-foreground">Página {c.pagina}: </span>
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {c.conteudo}
                </a>
              ) : (
                c.conteudo
              )}
            </p>
          ))}
        </div>
      ) : null}

      {!qr.disponivel ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {qr.mensagem || "Validação do QR Code indisponível."}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${
                confirmado
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : "border-red-500/40 bg-red-500/10 text-red-700"
              }`}
            >
              {confirmado ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <ShieldAlert className="size-3.5" />
              )}
              {confirmado
                ? "Documento confirmado pelo emissor"
                : qr.documentoConfirmado === "nao"
                  ? "Emissor não confirmou o documento"
                  : "Confirmação não conclusiva"}
            </span>
            {qr.emissor ? (
              <span className="text-xs text-muted-foreground">Emissor: {qr.emissor}</span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Médico no QR Code", qr.nomeMedicoNoQrCode],
              ["CRM no QR Code", qr.crmNoQrCode],
              ["Paciente no QR Code", qr.nomePacienteNoQrCode],
              ["Data no QR Code", qr.dataNoQrCode],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-input bg-background p-2">
                <p className="text-xs uppercase text-muted-foreground">{rotulo}</p>
                <p className="text-sm text-foreground">{valor || "Não informado"}</p>
              </div>
            ))}
          </div>

          <p
            className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
              qr.medicoConfere === "sim"
                ? CORES["confere"]
                : qr.medicoConfere === "nao"
                  ? CORES["divergente"]
                  : CORES["nao_encontrado"]
            }`}
          >
            {qr.medicoConfere === "sim"
              ? "O nome do médico do QR Code confere com o atestado."
              : qr.medicoConfere === "nao"
                ? "O nome do médico do QR Code NÃO confere com o atestado."
                : "Não foi possível comparar o nome do médico."}
          </p>

          {qr.campos.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Comparação campo por campo
              </p>
              {qr.campos.map((c, i) => (
                <div
                  key={`${c.campo}-${i}`}
                  className={`rounded-lg border p-2 text-xs ${CORES[c.situacao]}`}
                >
                  <p className="font-semibold">{c.campo}</p>
                  <p>QR Code: {c.valorNoQrCode || "—"}</p>
                  <p>Atestado: {c.valorNoAtestado || "—"}</p>
                </div>
              ))}
            </div>
          ) : null}

          {qr.alertas.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {qr.alertas.map((a, i) => (
                <li key={`${a}-${i}`}>{a}</li>
              ))}
            </ul>
          ) : null}

          {qr.conclusao ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {qr.conclusao}
            </p>
          ) : null}

          {qr.fontes.length > 0 ? (
            <div className="space-y-1">
              {qr.fontes.map((f, i) => (
                <a
                  key={`${f.url}-${i}`}
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
