import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileSignature,
  Loader2,
  MailCheck,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PadAssinatura } from "@/components/assinatura/PadAssinatura";
import { ROTULO_CAMPO, TIPOS_ASSINATURA, type CampoDocumento } from "@/lib/assinatura/tipos";

export const Route = createFileRoute("/assinar/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Assinar documento | Assinatura eletrônica pelo celular" },
      {
        name: "description",
        content:
          "Leia o documento, preencha os campos e assine com o dedo. Assinatura eletrônica com protocolo, hash e trilha de auditoria.",
      },
      { property: "og:title", content: "Assinar documento" },
      {
        property: "og:description",
        content: "Assine o documento eletronicamente pelo celular, com segurança e validação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AssinarPage,
});

interface DadosDocumento {
  documento: {
    titulo: string;
    protocolo: string;
    status: string;
    exigeCodigo: boolean;
    pdfUrl: string | null;
  };
  signatario: {
    nome: string;
    ordem: number;
    status: string;
    temEmail: boolean;
    temTelefone: boolean;
  };
  campos: CampoDocumento[];
}

type Etapa = "carregando" | "erro" | "assinar" | "concluido" | "recusado";

async function postJson<T>(url: string, corpo: unknown): Promise<T> {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = (await resposta.json().catch(() => ({}))) as T & { erro?: string };
  if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
  return dados;
}

function AssinarPage() {
  const { token } = Route.useParams();
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<DadosDocumento | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [assinaturas, setAssinaturas] = useState<Record<string, string>>({});
  const [aceite, setAceite] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mostrarRecusa, setMostrarRecusa] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [protocoloFinal, setProtocoloFinal] = useState("");
  const [statusFinal, setStatusFinal] = useState("");

  const carregar = useCallback(async () => {
    setEtapa("carregando");
    try {
      const resultado = await postJson<DadosDocumento>("/api/public/assinatura/documento", {
        token,
      });
      setDados(resultado);
      if (resultado.signatario.status === "assinado") {
        setProtocoloFinal(resultado.documento.protocolo);
        setStatusFinal(resultado.documento.status);
        setEtapa("concluido");
      } else if (resultado.signatario.status === "recusado") {
        setEtapa("recusado");
      } else {
        setEtapa("assinar");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Link inválido.");
      setEtapa("erro");
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const meusCampos = useMemo(
    () => (dados?.campos ?? []).filter((c) => c.signatario === dados?.signatario.ordem),
    [dados],
  );
  const camposTexto = meusCampos.filter((c) => !TIPOS_ASSINATURA.includes(c.tipo));
  const camposAssinatura = meusCampos.filter((c) => TIPOS_ASSINATURA.includes(c.tipo));

  const pendentes = meusCampos.filter((c) => {
    if (!c.obrigatorio) return false;
    return TIPOS_ASSINATURA.includes(c.tipo) ? !assinaturas[c.id] : !(valores[c.id] ?? "").trim();
  });

  async function enviarCodigo() {
    setOcupado(true);
    try {
      await postJson("/api/public/assinatura/codigo", { token });
      setCodigoEnviado(true);
      toast.success("Código enviado para o seu e-mail.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o código.");
    } finally {
      setOcupado(false);
    }
  }

  async function assinar() {
    if (!dados) return;
    if (pendentes.length > 0) {
      toast.error(`Preencha: ${pendentes.map((c) => c.rotulo || ROTULO_CAMPO[c.tipo]).join(", ")}`);
      return;
    }
    if (!aceite) {
      toast.error("É necessário aceitar o termo de consentimento.");
      return;
    }
    if (dados.documento.exigeCodigo && codigo.trim().length < 6) {
      toast.error("Informe o código de confirmação recebido por e-mail.");
      return;
    }
    setOcupado(true);
    try {
      const resultado = await postJson<{ ok: true; status: string; protocolo: string }>(
        "/api/public/assinatura/assinar",
        { token, aceite: true, codigo: codigo.trim() || undefined, valores, assinaturas },
      );
      setProtocoloFinal(resultado.protocolo);
      setStatusFinal(resultado.status);
      setEtapa("concluido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível assinar.");
    } finally {
      setOcupado(false);
    }
  }

  async function recusar() {
    if (motivoRecusa.trim().length < 3) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    setOcupado(true);
    try {
      await postJson("/api/public/assinatura/recusar", { token, motivo: motivoRecusa.trim() });
      setEtapa("recusado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a recusa.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-red-600/15 text-red-500">
            <FileSignature className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">Assinatura de documento</h1>
            <p className="text-xs text-muted-foreground">
              Assinatura eletrônica com protocolo e trilha de auditoria
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-28">
        {etapa === "carregando" && (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Abrindo documento…
          </div>
        )}

        {etapa === "erro" && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <XCircle className="mx-auto size-10 text-red-500" />
            <h2 className="mt-3 text-lg font-bold">Não foi possível abrir o documento</h2>
            <p className="mt-1 text-sm text-muted-foreground">{erro}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Peça a quem enviou o documento um novo link de assinatura.
            </p>
          </section>
        )}

        {etapa === "concluido" && dados && (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h2 className="mt-3 text-lg font-bold">Assinatura registrada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Obrigado, {dados.signatario.nome}. Sua assinatura em{" "}
              <strong>{dados.documento.titulo}</strong> foi registrada com sucesso.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-card p-3 text-left text-sm">
              <p>
                <span className="text-muted-foreground">Protocolo:</span>{" "}
                <span className="font-mono font-semibold">{protocoloFinal}</span>
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Situação:</span>{" "}
                {statusFinal === "concluido"
                  ? "Documento concluído por todos os signatários."
                  : "Aguardando os demais signatários."}
              </p>
            </div>
            <a
              href={`/validar?p=${encodeURIComponent(protocoloFinal)}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <ShieldCheck className="size-4" /> Validar autenticidade
            </a>
          </section>
        )}

        {etapa === "recusado" && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <XCircle className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-bold">Assinatura recusada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A recusa foi registrada e o emissor do documento será informado.
            </p>
          </section>
        )}

        {etapa === "assinar" && dados && (
          <>
            <section className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Documento</p>
              <h2 className="text-lg font-bold leading-tight">{dados.documento.titulo}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Protocolo <span className="font-mono">{dados.documento.protocolo}</span> ·
                Signatário: <strong>{dados.signatario.nome}</strong>
              </p>
              {dados.documento.pdfUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white">
                  <iframe
                    title="Documento para assinatura"
                    src={`${dados.documento.pdfUrl}#toolbar=0&view=FitH`}
                    className="h-[60vh] w-full"
                  />
                </div>
              ) : null}
              {dados.documento.pdfUrl ? (
                <a
                  href={dados.documento.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-primary underline"
                >
                  Abrir o documento em tela cheia
                </a>
              ) : null}
            </section>

            {camposTexto.length > 0 && (
              <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <h3 className="text-sm font-bold">Preencha seus dados</h3>
                {camposTexto.map((campo) => (
                  <label key={campo.id} className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                      {campo.rotulo || ROTULO_CAMPO[campo.tipo]}
                      {campo.obrigatorio ? " *" : ""}
                    </span>
                    {campo.tipo === "observacao" ? (
                      <textarea
                        value={valores[campo.id] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [campo.id]: e.target.value }))}
                        rows={3}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base"
                      />
                    ) : (
                      <input
                        type={campo.tipo === "data" ? "date" : "text"}
                        inputMode={
                          campo.tipo === "cpf" || campo.tipo === "matricula" ? "numeric" : "text"
                        }
                        value={valores[campo.id] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [campo.id]: e.target.value }))}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base"
                      />
                    )}
                  </label>
                ))}
              </section>
            )}

            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">Sua assinatura</h3>
              {camposAssinatura.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este documento não possui campo de assinatura destinado a você. Ao confirmar, sua
                  concordância será registrada no certificado de conclusão.
                </p>
              )}
              {camposAssinatura.map((campo) => (
                <PadAssinatura
                  key={campo.id}
                  rotulo={campo.rotulo || ROTULO_CAMPO[campo.tipo]}
                  altura={campo.tipo === "rubrica" ? 120 : 180}
                  onChange={(dataUrl) =>
                    setAssinaturas((a) => {
                      const proximo = { ...a };
                      if (dataUrl) proximo[campo.id] = dataUrl;
                      else delete proximo[campo.id];
                      return proximo;
                    })
                  }
                />
              ))}
            </section>

            {dados.documento.exigeCodigo && (
              <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <MailCheck className="size-4 text-primary" /> Confirmação por código
                </h3>
                <p className="text-xs text-muted-foreground">
                  Este documento exige um código de confirmação enviado ao seu e-mail.
                </p>
                <div className="flex gap-2">
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="000000"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em]"
                  />
                  <button
                    type="button"
                    disabled={ocupado || !dados.signatario.temEmail}
                    onClick={enviarCodigo}
                    className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {codigoEnviado ? "Reenviar" : "Enviar código"}
                  </button>
                </div>
                {!dados.signatario.temEmail && (
                  <p className="text-xs text-red-500">
                    Não há e-mail cadastrado para você. Peça ao emissor para corrigir o cadastro.
                  </p>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-1 size-4"
                />
                <span>
                  Declaro que li o documento e concordo em assiná-lo eletronicamente. Estou ciente
                  de que serão registrados data, hora, endereço IP e dispositivo para fins de
                  auditoria (MP 2.200-2/2001, art. 10, §2º).
                </span>
              </label>
            </section>

            {mostrarRecusa && (
              <section className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                <h3 className="text-sm font-bold">Recusar assinatura</h3>
                <textarea
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo da recusa"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMostrarRecusa(false)}
                    className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={recusar}
                    className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Confirmar recusa
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {etapa === "assinar" && dados && !mostrarRecusa && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            <button
              type="button"
              onClick={() => setMostrarRecusa(true)}
              className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground"
            >
              Recusar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={assinar}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {ocupado ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Assinar documento
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
