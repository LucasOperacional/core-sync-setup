import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Globe,
  History,
  Home,
  Loader2,
  RotateCcw,
  Activity,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeminiLeiturasTab } from "@/components/GeminiLeiturasTab";
import { CidAlertasTab } from "@/components/CidAlertasTab";
import { analisarAtestadoComIA, type AtestadoAnaliseIA } from "@/lib/atestado-ia";
import { DossieMedicoCard } from "@/components/DossieMedicoCard";
import { QrCodeAtestadoCard } from "@/components/QrCodeAtestadoCard";
import { ParecerAutenticidadeCard } from "@/components/ParecerAutenticidadeCard";
import { ManusAutenticidadeCard } from "@/components/ManusAutenticidadeCard";

import {
  descartarItem,
  guardarArquivoSessao,
  lerHistorico,
  limparHistorico,
  obterArquivoSessao,
  registrarAnalise,
  removerItem,
  type AtestadoHistoricoItem,
} from "@/lib/atestado-historico";

export const Route = createFileRoute("/_authenticated/verificador-atestados")({
  head: () => ({
    meta: [
      { title: "Verificador de Atestados com IA" },
      {
        name: "description",
        content:
          "Analise atestados médicos em PDF, JPG ou PNG com melhoria automática de imagem, leitura de CID, médico, CRM, datas e hospital, e conferência na web.",
      },
      { property: "og:title", content: "Verificador de Atestados com IA" },
      {
        property: "og:description",
        content:
          "Leitura precisa de atestados médicos com IA: CID, médico, CRM, datas e hospital, com verificação na internet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerificadorAtestadosPage,
});

const ACEITOS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
];

function aceita(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    ACEITOS.some((e) => n.endsWith(e)) ||
    file.type.startsWith("image/") ||
    file.type === "application/pdf"
  );
}

function Campo({
  rotulo,
  valor,
  confianca,
}: {
  rotulo: string;
  valor: string;
  confianca?: number;
}) {
  const vazio = !valor || valor === "Não identificado";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${vazio ? "text-muted-foreground" : "text-foreground"}`}
      >
        {vazio ? "Não identificado" : valor}
      </p>
      {typeof confianca === "number" && !vazio ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Confiança {Math.round(confianca)}%</p>
      ) : null}
    </div>
  );
}

function VerificadorAtestadosPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const reenvioRef = useRef<HTMLInputElement>(null);
  const substituirIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<AtestadoAnaliseIA | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [aba, setAba] = useState("analisar");
  const [historico, setHistorico] = useState<AtestadoHistoricoItem[]>([]);

  useEffect(() => {
    setHistorico(lerHistorico());
    const sync = () => setHistorico(lerHistorico());
    window.addEventListener("atestados-historico-sync", sync);
    return () => window.removeEventListener("atestados-historico-sync", sync);
  }, []);

  async function analisar(file: File, substituirId?: string | null) {
    if (!aceita(file)) {
      setErro(
        "Formato não suportado. Envie PDF, JPG, JPEG, PNG, WEBP, BMP, GIF, TIFF, HEIC ou AVIF.",
      );
      return;
    }
    setBusy(true);
    setErro(null);
    setResultado(null);
    setAba("analisar");
    try {
      const r = await analisarAtestadoComIA(file, setEtapa);
      setResultado(r);
      guardarArquivoSessao(r.id, file);
      if (substituirId && substituirId !== r.id) removerItem(substituirId);
      setHistorico(registrarAnalise(r));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao analisar o documento.");
    } finally {
      setBusy(false);
      setEtapa("");
      if (inputRef.current) inputRef.current.value = "";
      if (reenvioRef.current) reenvioRef.current.value = "";
    }
  }

  async function processar(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await analisar(file, null);
  }

  async function reanalisar(item: AtestadoHistoricoItem) {
    const file = obterArquivoSessao(item.id);
    if (!file) {
      setErro(
        `O arquivo "${item.arquivo.nome}" não está mais nesta sessão. Use "Reenviar" para escolher o arquivo novamente.`,
      );
      setAba("historico");
      return;
    }
    await analisar(file, item.id);
  }

  function reenviar(item: AtestadoHistoricoItem) {
    substituirIdRef.current = item.id;
    reenvioRef.current?.click();
  }

  const d = resultado?.dados;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <ShieldCheck className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Verificador de Atestados</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Análise de atestados em PDF, JPG e PNG com melhoria automática de imagem, leitura por
              IA e conferência na internet.
            </p>
          </div>
        </div>
      </header>

      <Tabs
        value={aba}
        onValueChange={setAba}
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10"
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="analisar" className="gap-1.5 whitespace-nowrap">
              <Sparkles className="size-4 shrink-0" />
              Analisar
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5 whitespace-nowrap">
              <History className="size-4 shrink-0" />
              Histórico ({historico.length})
            </TabsTrigger>
            <TabsTrigger value="leituras" className="gap-1.5 whitespace-nowrap">
              <Activity className="size-4 shrink-0" />
              Leituras do Gemini
            </TabsTrigger>
            <TabsTrigger value="cids" className="gap-1.5 whitespace-nowrap">
              <Stethoscope className="size-4 shrink-0" />
              Alertas por CID
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analisar" className="space-y-6">
          {/* Upload */}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void processar(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,.heic,.heif,.avif"
              className="hidden"
              onChange={(e) => void processar(e.target.files)}
            />
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
            </span>
            <p className="text-sm font-semibold text-foreground">
              Arraste o atestado aqui (PDF, JPG, PNG, WEBP, BMP, GIF, TIFF, HEIC, AVIF) ou selecione
              o arquivo
            </p>
            <p className="text-xs text-muted-foreground">
              A imagem é melhorada automaticamente, lida pelo Gemini com pesquisa na internet e
              conferida pela IA Operacional.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {busy ? "Analisando..." : "Analisar atestado"}
            </button>
            {busy && etapa ? <p className="text-xs text-muted-foreground">{etapa}</p> : null}
            {erro ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-xs font-medium text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {erro}
              </p>
            ) : null}
          </div>

          {resultado && d ? (
            <>
              {/* Resumo */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase text-muted-foreground">Autenticidade estimada</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">
                    {resultado.autenticidade}%
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase text-muted-foreground">Confiança da leitura</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">
                    {resultado.confiancaGlobal}%
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase text-muted-foreground">Qualidade da imagem</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">
                    {resultado.qualidadeImagem.nota}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {resultado.qualidadeImagem.comentario}
                  </p>
                </div>
              </div>

              {resultado.veredito ? (
                <div className="flex items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{resultado.veredito}</span>
                </div>
              ) : null}

              {/* Dados extraídos */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Dados extraídos</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo
                    rotulo="Paciente"
                    valor={d.nomePaciente.valor}
                    confianca={d.nomePaciente.confianca}
                  />
                  <Campo
                    rotulo="CPF"
                    valor={d.cpfPaciente.valor}
                    confianca={d.cpfPaciente.confianca}
                  />
                  <Campo
                    rotulo="Médico"
                    valor={d.nomeMedico.valor}
                    confianca={d.nomeMedico.confianca}
                  />
                  <Campo
                    rotulo="CRM"
                    valor={`${d.crm.valor}${d.ufCrm.valor !== "Não identificado" ? ` / ${d.ufCrm.valor}` : ""}`}
                    confianca={d.crm.confianca}
                  />
                  <Campo
                    rotulo="Especialidade"
                    valor={d.especialidade.valor}
                    confianca={d.especialidade.confianca}
                  />
                  <Campo rotulo="CID" valor={d.cid.valor} confianca={d.cid.confianca} />
                  <Campo
                    rotulo="Descrição do CID"
                    valor={d.cidDescricao.valor}
                    confianca={d.cidDescricao.confianca}
                  />
                  <Campo
                    rotulo="Data da consulta"
                    valor={d.dataConsulta.valor}
                    confianca={d.dataConsulta.confianca}
                  />
                  <Campo
                    rotulo="Hora da consulta"
                    valor={d.horaConsulta.valor}
                    confianca={d.horaConsulta.confianca}
                  />
                  <Campo
                    rotulo="Dias de afastamento"
                    valor={d.diasAfastamento.valor}
                    confianca={d.diasAfastamento.confianca}
                  />
                  <Campo
                    rotulo="Início do afastamento"
                    valor={d.dataInicioAfastamento.valor}
                    confianca={d.dataInicioAfastamento.confianca}
                  />
                  <Campo
                    rotulo="Fim do afastamento"
                    valor={d.dataFimAfastamento.valor}
                    confianca={d.dataFimAfastamento.confianca}
                  />
                  <Campo
                    rotulo="Hospital / Clínica"
                    valor={d.nomeHospital.valor}
                    confianca={d.nomeHospital.confianca}
                  />
                  <Campo
                    rotulo="Endereço"
                    valor={d.enderecoHospital.valor}
                    confianca={d.enderecoHospital.confianca}
                  />
                  <Campo
                    rotulo="CNPJ"
                    valor={d.cnpjHospital.valor}
                    confianca={d.cnpjHospital.confianca}
                  />
                  <Campo
                    rotulo="Telefone"
                    valor={d.telefoneHospital.valor}
                    confianca={d.telefoneHospital.confianca}
                  />
                  <Campo
                    rotulo="Código de validação"
                    valor={d.codigoValidacao.valor}
                    confianca={d.codigoValidacao.confianca}
                  />
                  <Campo
                    rotulo="QR Code"
                    valor={d.qrCodeDetectado ? "Detectado" : "Não detectado"}
                  />
                  <Campo
                    rotulo="Assinatura"
                    valor={d.assinaturaDetectada ? "Detectada" : "Não detectada"}
                  />
                  <Campo
                    rotulo="Carimbo"
                    valor={d.carimboDetectado ? "Detectado" : "Não detectado"}
                  />
                </div>
                {d.observacoes ? (
                  <p className="text-xs text-muted-foreground">
                    Observações da IA: {d.observacoes}
                  </p>
                ) : null}
              </section>

              {/* Alertas */}
              {resultado.alertas.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    Alertas de inconsistência
                  </h2>
                  {resultado.alertas.map((a, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        a.severidade === "alta"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : a.severidade === "media"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                            : "border-border bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <span className="font-semibold">{a.tipo}: </span>
                      {a.descricao}
                    </div>
                  ))}
                </section>
              ) : null}

              {/* Conferência da IA Operacional */}
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  Conferência da IA Operacional
                </h2>
                {resultado.auditoria.disponivel ? (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                          resultado.auditoria.recomendacao === "aceitar"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : resultado.auditoria.recomendacao === "recusar"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        Recomendação: {resultado.auditoria.recomendacao.toUpperCase()}
                      </span>
                      <span className="rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                        Risco de fraude: {resultado.auditoria.riscoFraude}%
                      </span>
                      <span className="rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                        Confiabilidade: {resultado.auditoria.confiabilidade}%
                      </span>
                    </div>

                    {resultado.auditoria.parecer ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {resultado.auditoria.parecer}
                      </p>
                    ) : null}
                    {resultado.auditoria.coerencia ? (
                      <p className="text-sm text-muted-foreground">
                        {resultado.auditoria.coerencia}
                      </p>
                    ) : null}

                    {resultado.auditoria.divergencias.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Divergências encontradas
                        </p>
                        {resultado.auditoria.divergencias.map((d, i) => (
                          <div
                            key={`${d.tipo}-${i}`}
                            className={`rounded-lg border p-3 text-sm ${
                              d.severidade === "alta"
                                ? "border-destructive/40 bg-destructive/10 text-destructive"
                                : d.severidade === "media"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                                  : "border-border bg-secondary/40 text-muted-foreground"
                            }`}
                          >
                            <span className="font-semibold">{d.tipo}: </span>
                            {d.descricao}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-400">
                        Nenhuma divergência entre a leitura do Gemini e a releitura da IA
                        Operacional.
                      </p>
                    )}

                    {resultado.auditoria.conferencia.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="p-2">Campo</th>
                              <th className="p-2">Lido pela IA Operacional</th>
                              <th className="p-2">Leitura anterior</th>
                              <th className="p-2">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resultado.auditoria.conferencia.map((c, i) => (
                              <tr key={`${c.campo}-${i}`} className="border-t border-border">
                                <td className="p-2 font-medium text-foreground">{c.campo}</td>
                                <td className="p-2 text-muted-foreground">{c.valorLido || "—"}</td>
                                <td className="p-2 text-muted-foreground">
                                  {c.valorInformado || "—"}
                                </td>
                                <td
                                  className={`p-2 font-semibold ${
                                    c.situacao === "confere"
                                      ? "text-emerald-400"
                                      : c.situacao === "divergente"
                                        ? "text-destructive"
                                        : "text-amber-400"
                                  }`}
                                >
                                  {c.situacao === "confere"
                                    ? "Confere"
                                    : c.situacao === "divergente"
                                      ? "Divergente"
                                      : "Não verificável"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    {resultado.auditoria.mensagem || "Conferência da IA Operacional indisponível."}
                  </p>
                )}
              </section>

              {/* Investigação de autenticidade na internet (Manus AI) */}
              <ManusAutenticidadeCard investigacao={resultado.manusAutenticidade} />

              {/* Parecer final de autenticidade documental */}
              <ParecerAutenticidadeCard parecer={resultado.parecerAutenticidade} />

              {/* QR Code lido e validado pela Manus AI */}
              <QrCodeAtestadoCard qr={resultado.qrCodeValidacao} />

              {/* Dossiê do médico investigado pela Manus AI */}
              <DossieMedicoCard dossie={resultado.dossieMedico} />

              {/* Verificação na web */}
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Globe className="size-4 text-primary" />
                  Conferência na internet (Google + Gemini)
                </h2>
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
                  {resultado.parecerWeb}
                </p>
                {resultado.fontesWeb.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Fontes consultadas
                    </p>
                    {resultado.fontesWeb.map((f) => (
                      <a
                        key={f.uri}
                        href={f.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        {f.title}
                      </a>
                    ))}
                  </div>
                ) : null}
                {resultado.buscasGoogle.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {resultado.buscasGoogle.map((b) => (
                      <a
                        key={b.url}
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <ExternalLink className="size-3" />
                        Buscar no Google: {b.rotulo}
                      </a>
                    ))}
                  </div>
                ) : null}
              </section>

              {/* Imagens melhoradas */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Documento melhorado</h2>
                <p className="text-xs text-muted-foreground">
                  Arquivo: {resultado.arquivo.nome} · SHA-256: {resultado.arquivo.hash.slice(0, 24)}
                  …
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {resultado.paginas.map((src, i) => (
                    <figure
                      key={i}
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      <img
                        src={src}
                        alt={`Página ${i + 1} do atestado melhorada`}
                        className="w-full"
                      />
                      <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                        Página {i + 1}
                        <a
                          href={src}
                          download={`atestado-melhorado-${i + 1}.png`}
                          className="text-primary hover:underline"
                        >
                          Baixar PNG
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <input
            ref={reenvioRef}
            type="file"
            accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,.heic,.heif,.avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const id = substituirIdRef.current;
              substituirIdRef.current = null;
              if (file) void analisar(file, id);
            }}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {historico.length === 0
                ? "Nenhuma leitura registrada ainda."
                : `${historico.length} leitura(s) do Gemini registradas neste navegador.`}
            </p>
            {historico.length > 0 ? (
              <button
                type="button"
                onClick={() => setHistorico(limparHistorico())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Trash2 className="size-3.5" />
                Limpar histórico
              </button>
            ) : null}
          </div>

          {historico.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border border-border bg-card p-4 ${
                item.status === "descartado" ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.arquivo.nome}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(item.dataAnalise).toLocaleString("pt-BR")} · autenticidade{" "}
                    {item.autenticidade}% · confiança {item.confiancaGlobal}% ·{" "}
                    {item.alertas.length} alerta(s)
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.status === "descartado"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {item.status === "descartado" ? "Descartado" : "Analisado"}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="font-semibold text-foreground">Paciente:</span>{" "}
                  {item.dados.nomePaciente.valor}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Médico/CRM:</span>{" "}
                  {item.dados.nomeMedico.valor} — {item.dados.crm.valor}
                </p>
                <p>
                  <span className="font-semibold text-foreground">CID:</span> {item.dados.cid.valor}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Afastamento:</span>{" "}
                  {item.dados.dataInicioAfastamento.valor} a {item.dados.dataFimAfastamento.valor}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reanalisar(item)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" />
                  Reanalisar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reenviar(item)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Upload className="size-3.5" />
                  Reenviar
                </button>
                {item.status === "descartado" ? (
                  <button
                    type="button"
                    onClick={() => setHistorico(removerItem(item.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <Trash2 className="size-3.5" />
                    Excluir do histórico
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHistorico(descartarItem(item.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <Trash2 className="size-3.5" />
                    Descartar
                  </button>
                )}
              </div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="leituras">
          <GeminiLeiturasTab />
        </TabsContent>

        <TabsContent value="cids">
          <CidAlertasTab
            cidAtual={d?.cid.valor && d.cid.valor !== "Não identificado" ? d.cid.valor : undefined}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
