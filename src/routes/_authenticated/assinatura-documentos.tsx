import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Copy,
  Download,
  FileSignature,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { EditorCampos } from "@/components/assinatura/EditorCampos";
import {
  baixarDocumentoAssinatura,
  cancelarDocumentoAssinatura,
  criarDocumentoAssinatura,
  definirSignatarios,
  excluirModeloAssinatura,
  listarDocumentosAssinatura,
  listarModelosAssinatura,
  obterDocumentoAssinatura,
  reenviarLinkSignatario,
  salvarCamposAssinatura,
  salvarModeloAssinatura,
  type DocumentoCompleto,
  type LinkSignatario,
} from "@/lib/assinatura.functions";
import {
  ROTULO_STATUS,
  TIPOS_ASSINATURA,
  camposPadraoCrt,
  pareceCrt,
  type CampoDocumento,
  type DocumentoAssinatura,
  type StatusDocumento,
} from "@/lib/assinatura/tipos";
import { extractPdfText } from "@/lib/report-parser";

export const Route = createFileRoute("/_authenticated/assinatura-documentos")({
  head: () => ({
    meta: [
      { title: "Assinatura de Documentos | CRT e PDFs pelo celular" },
      {
        name: "description",
        content:
          "Importe CRT ou qualquer PDF, posicione os campos, envie o link e colete assinaturas pelo celular com protocolo, hash e QR Code de validação.",
      },
      { property: "og:title", content: "Assinatura de Documentos" },
      {
        property: "og:description",
        content:
          "Preencha, envie e assine documentos CRT e PDFs pelo celular, com validação por QR Code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssinaturaDocumentosPage,
});

type Signatario = { nome: string; email: string; telefone: string };

const CORES_STATUS: Record<StatusDocumento, string> = {
  rascunho: "bg-white/10 text-white",
  enviado: "bg-blue-500/20 text-blue-300",
  visualizado: "bg-amber-500/20 text-amber-300",
  aguardando_assinatura: "bg-amber-500/20 text-amber-300",
  assinado_parcialmente: "bg-orange-500/20 text-orange-300",
  concluido: "bg-emerald-500/20 text-emerald-300",
  recusado: "bg-red-500/25 text-red-300",
  cancelado: "bg-zinc-500/20 text-zinc-300",
  expirado: "bg-zinc-500/20 text-zinc-300",
};

function Etiqueta({ status }: { status: StatusDocumento }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${CORES_STATUS[status] ?? "bg-white/10"}`}
    >
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

function AssinaturaDocumentosPage() {
  const criar = useServerFn(criarDocumentoAssinatura);
  const salvarCampos = useServerFn(salvarCamposAssinatura);
  const enviarSignatarios = useServerFn(definirSignatarios);
  const listar = useServerFn(listarDocumentosAssinatura);
  const obter = useServerFn(obterDocumentoAssinatura);
  const baixar = useServerFn(baixarDocumentoAssinatura);
  const cancelar = useServerFn(cancelarDocumentoAssinatura);
  const reenviar = useServerFn(reenviarLinkSignatario);
  const listarModelos = useServerFn(listarModelosAssinatura);
  const salvarModelo = useServerFn(salvarModeloAssinatura);
  const excluirModelo = useServerFn(excluirModeloAssinatura);

  const [aba, setAba] = useState<"novo" | "lista">("novo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<"crt" | "pdf">("pdf");
  const [campos, setCampos] = useState<CampoDocumento[]>([]);
  const [signatarios, setSignatarios] = useState<Signatario[]>([
    { nome: "", email: "", telefone: "" },
  ]);
  const [exigeCodigo, setExigeCodigo] = useState(false);
  const [expiraEm, setExpiraEm] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [links, setLinks] = useState<LinkSignatario[]>([]);
  const [documentos, setDocumentos] = useState<
    Array<DocumentoAssinatura & { total_signatarios: number; assinados: number }>
  >([]);
  const [detalhe, setDetalhe] = useState<DocumentoCompleto | null>(null);
  const [modelos, setModelos] = useState<
    Array<{ id: string; nome: string; tipo: string; campos: CampoDocumento[] }>
  >([]);

  const carregarLista = useCallback(async () => {
    try {
      setDocumentos(await listar({}));
    } catch {
      toast.error("Não foi possível carregar os documentos.");
    }
  }, [listar]);

  const carregarModelos = useCallback(async () => {
    try {
      setModelos(await listarModelos({}));
    } catch {
      /* modelos são opcionais */
    }
  }, [listarModelos]);

  useEffect(() => {
    void carregarLista();
    void carregarModelos();
  }, [carregarLista, carregarModelos]);

  const camposDoEmissor = useMemo(
    () => campos.filter((c) => !c.signatario && !TIPOS_ASSINATURA.includes(c.tipo)),
    [campos],
  );

  async function importar(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    setArquivo(file);
    setTitulo((atual) => atual || file.name.replace(/\.pdf$/i, ""));
    setLinks([]);
    try {
      const texto = await extractPdfText(file);
      if (pareceCrt(texto, file.name)) {
        setTipo("crt");
        setCampos((atual) => (atual.length ? atual : camposPadraoCrt()));
        toast.success("Formulário CRT reconhecido: campos sugeridos aplicados.");
      } else {
        setTipo("pdf");
      }
    } catch {
      setTipo("pdf");
    }
  }

  async function arquivoParaBase64(file: File): Promise<string> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binario = "";
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binario += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    }
    return btoa(binario);
  }

  async function salvarEEnviar(apenasSalvar: boolean): Promise<void> {
    if (!arquivo) {
      toast.error("Importe o PDF do documento.");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Informe o título do documento.");
      return;
    }
    if (!campos.length) {
      toast.error("Posicione ao menos um campo no documento.");
      return;
    }

    const validos = signatarios.filter((s) => s.nome.trim().length > 1);
    if (!apenasSalvar && !validos.length) {
      toast.error("Cadastre ao menos um signatário.");
      return;
    }

    setOcupado(true);
    try {
      const base64 = await arquivoParaBase64(arquivo);
      const { id } = await criar({
        data: {
          titulo: titulo.trim(),
          tipo,
          arquivoBase64: base64,
          campos,
          exigeCodigo,
          expiraEm: expiraEm ? new Date(expiraEm).toISOString() : null,
        },
      });
      await salvarCampos({
        data: {
          id,
          campos,
          exigeCodigo,
          expiraEm: expiraEm ? new Date(expiraEm).toISOString() : null,
        },
      });

      if (apenasSalvar) {
        toast.success("Documento salvo como rascunho.");
      } else {
        const { links: gerados } = await enviarSignatarios({
          data: {
            id,
            origem: window.location.origin,
            signatarios: validos.map((s) => ({
              nome: s.nome.trim(),
              email: s.email.trim() || null,
              telefone: s.telefone.trim() || null,
            })),
          },
        });
        setLinks(gerados);
        toast.success("Links de assinatura gerados.");
      }
      await carregarLista();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  }

  async function abrirDetalhe(id: string) {
    try {
      setDetalhe(await obter({ data: { id } }));
    } catch {
      toast.error("Não foi possível abrir o documento.");
    }
  }

  async function baixarVersao(id: string, versao: "original" | "preenchido" | "assinado") {
    try {
      const { url } = await baixar({ data: { id, versao } });
      window.open(url, "_blank", "noopener");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Download indisponível.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-24">
      <header className="rounded-3xl border border-red-500/30 bg-gradient-to-br from-black via-zinc-900 to-black p-5 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="rounded-2xl bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
            aria-label="Voltar para a página inicial"
          >
            <ArrowLeft className="size-6" />
          </Link>
          <span className="rounded-2xl bg-red-600 p-3">
            <FileSignature className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide">
              Assinatura de Documentos
            </h1>
            <p className="text-sm text-zinc-300">
              CRT e qualquer PDF: preencha, envie o link e assine pelo celular.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAba("novo")}
            className={`min-h-12 rounded-2xl px-4 text-sm font-bold uppercase tracking-wide transition-colors ${aba === "novo" ? "bg-red-600 text-white" : "bg-white/10 text-zinc-200"}`}
          >
            Novo documento
          </button>
          <button
            type="button"
            onClick={() => {
              setAba("lista");
              void carregarLista();
            }}
            className={`min-h-12 rounded-2xl px-4 text-sm font-bold uppercase tracking-wide transition-colors ${aba === "lista" ? "bg-red-600 text-white" : "bg-white/10 text-zinc-200"}`}
          >
            Meus documentos
          </button>
        </div>
      </header>

      {aba === "novo" ? (
        <section className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide">
              1. Importar documento
            </h2>
            <label className="mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-red-500/40 bg-red-500/5 px-4 text-sm font-semibold">
              <Upload className="size-5 text-red-500" />
              {arquivo ? arquivo.name : "Selecionar PDF (CRT ou outro)"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => void importar(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Título</span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-border bg-background px-3"
                  placeholder="Ex.: CRT - Posto Central"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Prazo para assinatura (opcional)</span>
                <input
                  type="datetime-local"
                  value={expiraEm}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
            </div>
            {tipo === "crt" ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600">
                <BadgeCheck className="size-4" /> Documento reconhecido como CRT.
              </p>
            ) : null}
            {modelos.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Modelos salvos
                </p>
                <div className="flex flex-wrap gap-2">
                  {modelos.map((m) => (
                    <span key={m.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCampos(m.campos);
                          toast.success(`Modelo "${m.nome}" aplicado.`);
                        }}
                        className="min-h-10 rounded-xl border border-border px-3 text-xs font-semibold"
                      >
                        {m.nome}
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir modelo ${m.nome}`}
                        onClick={async () => {
                          await excluirModelo({ data: { id: m.id } });
                          void carregarModelos();
                        }}
                        className="rounded-lg p-2 text-muted-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {arquivo ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide">
                2. Posicionar campos
              </h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Escolha o tipo, defina quem preenche e toque no documento.
              </p>
              <EditorCampos
                arquivo={arquivo}
                campos={campos}
                onCampos={setCampos}
                totalSignatarios={Math.max(1, signatarios.length)}
              />
              {campos.length ? (
                <button
                  type="button"
                  onClick={async () => {
                    const nome = window.prompt("Nome do modelo:", titulo || "Modelo CRT");
                    if (!nome) return;
                    try {
                      await salvarModelo({ data: { nome, tipo, campos } });
                      toast.success("Modelo salvo para reutilizar.");
                      void carregarModelos();
                    } catch {
                      toast.error("Não foi possível salvar o modelo.");
                    }
                  }}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold uppercase"
                >
                  <Save className="size-4" /> Salvar como modelo
                </button>
              ) : null}
            </div>
          ) : null}

          {camposDoEmissor.length ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide">
                3. Preencher dados
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {camposDoEmissor.map((campo) => (
                  <label key={campo.id} className="text-sm">
                    <span className="mb-1 block font-semibold">{campo.rotulo}</span>
                    <input
                      value={campo.valor ?? ""}
                      onChange={(e) =>
                        setCampos((atual) =>
                          atual.map((c) =>
                            c.id === campo.id ? { ...c, valor: e.target.value } : c,
                          ),
                        )
                      }
                      className="min-h-12 w-full rounded-xl border border-border bg-background px-3"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide">
              4. Signatários
            </h2>
            <div className="mt-3 space-y-3">
              {signatarios.map((s, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-3"
                >
                  <input
                    value={s.nome}
                    onChange={(e) =>
                      setSignatarios((atual) =>
                        atual.map((item, idx) =>
                          idx === i ? { ...item, nome: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder={`Nome do signatário ${i + 1}`}
                    className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm"
                  />
                  <input
                    value={s.email}
                    onChange={(e) =>
                      setSignatarios((atual) =>
                        atual.map((item, idx) =>
                          idx === i ? { ...item, email: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="E-mail (opcional)"
                    className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      value={s.telefone}
                      onChange={(e) =>
                        setSignatarios((atual) =>
                          atual.map((item, idx) =>
                            idx === i ? { ...item, telefone: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Celular (opcional)"
                      className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                    {signatarios.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remover signatário"
                        onClick={() =>
                          setSignatarios((atual) => atual.filter((_, idx) => idx !== i))
                        }
                        className="rounded-xl border border-border px-3"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSignatarios((atual) => [...atual, { nome: "", email: "", telefone: "" }])
                }
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-bold uppercase"
              >
                <Plus className="size-4" /> Adicionar signatário
              </button>
              <label className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={exigeCodigo}
                  onChange={(e) => setExigeCodigo(e.target.checked)}
                  className="size-5"
                />
                Exigir confirmação por código enviado ao e-mail do signatário
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void salvarEEnviar(true)}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold uppercase disabled:opacity-50"
            >
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar rascunho
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void salvarEEnviar(false)}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-bold uppercase text-white disabled:opacity-50"
            >
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar para assinatura
            </button>
          </div>

          {links.length ? (
            <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-5">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide">
                Links individuais de assinatura
              </h3>
              <ul className="mt-3 space-y-2">
                {links.map((l) => (
                  <li key={l.signatarioId} className="rounded-2xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold">{l.nome}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {l.link}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(l.link);
                        toast.success("Link copiado.");
                      }}
                      className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black text-xs font-bold uppercase text-white"
                    >
                      <Copy className="size-4" /> Copiar link
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="space-y-3">
          {documentos.length === 0 ? (
            <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhum documento por aqui ainda.
            </p>
          ) : null}
          {documentos.map((doc) => (
            <article
              key={doc.id}
              className="rounded-3xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold uppercase">{doc.titulo}</h3>
                  <p className="font-mono text-[11px] text-muted-foreground">{doc.protocolo}</p>
                </div>
                <Etiqueta status={doc.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {doc.assinados} de {doc.total_signatarios} assinatura(s) •{" "}
                {new Date(doc.created_at).toLocaleString("pt-BR")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => void abrirDetalhe(doc.id)}
                  className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-border text-xs font-bold uppercase"
                >
                  <History className="size-4" /> Histórico
                </button>
                <button
                  type="button"
                  onClick={() => void baixarVersao(doc.id, "preenchido")}
                  className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-border text-xs font-bold uppercase"
                >
                  <Download className="size-4" /> Preenchido
                </button>
                <button
                  type="button"
                  onClick={() => void baixarVersao(doc.id, "assinado")}
                  className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-red-600 text-xs font-bold uppercase text-white"
                >
                  <Download className="size-4" /> Assinado
                </button>
                <button
                  type="button"
                  disabled={["concluido", "cancelado"].includes(doc.status)}
                  onClick={async () => {
                    if (!window.confirm("Cancelar este documento?")) return;
                    await cancelar({ data: { id: doc.id, motivo: "Cancelado pelo emissor" } });
                    toast.success("Documento cancelado.");
                    void carregarLista();
                  }}
                  className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-red-500/40 text-xs font-bold uppercase text-red-500 disabled:opacity-40"
                >
                  <Ban className="size-4" /> Cancelar
                </button>
              </div>

              {detalhe?.documento.id === doc.id ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-border p-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground">Signatários</p>
                    <ul className="mt-2 space-y-2">
                      {detalhe.signatarios.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-2 text-xs"
                        >
                          <span className="font-semibold">
                            {s.ordem}. {s.nome} — {s.status}
                          </span>
                          <button
                            type="button"
                            disabled={s.status === "assinado"}
                            onClick={async () => {
                              try {
                                const { link } = await reenviar({
                                  data: {
                                    signatarioId: s.id,
                                    origem: window.location.origin,
                                  },
                                });
                                await navigator.clipboard.writeText(link);
                                toast.success("Novo link copiado.");
                              } catch (erro) {
                                toast.error(
                                  erro instanceof Error ? erro.message : "Falha no reenvio.",
                                );
                              }
                            }}
                            className="flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 font-bold uppercase disabled:opacity-40"
                          >
                            <RefreshCw className="size-3.5" /> Reenviar link
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {detalhe.documento.hash_sha256 ? (
                    <p className="break-all font-mono text-[10px] text-muted-foreground">
                      SHA-256: {detalhe.documento.hash_sha256}
                    </p>
                  ) : null}
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground">Auditoria</p>
                    <ul className="mt-2 space-y-1">
                      {detalhe.auditoria.map((evento) => (
                        <li key={evento.id} className="text-[11px] text-muted-foreground">
                          {new Date(evento.created_at).toLocaleString("pt-BR")} — {evento.evento}
                          {evento.ip ? ` • IP ${evento.ip}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
