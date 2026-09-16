import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO,
  PROTOCOLO_FOLHAS_BROADCAST_CHANNEL,
  invalidarConsultasProtocoloFolhas,
  notificarAtualizacaoProtocoloFolhas,
} from "@/lib/protocolo-folhas-sync";
import { protocoloFolhasQueryKeys } from "@/lib/protocolo-folhas-sync";

import {
  AlertTriangle,
  Archive,
  Building2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { gerarHorasExtrasPorGerente } from "@/lib/horas-extras-gerente";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  agruparHorasExtrasPorEmpresa,
  analisarHorasExtras,
  criarProtocolosSalvosHorasExtras,
  csvHorasExtras,
  montarPdfHorasExtras,
  nomeArquivoHorasExtras,
  folhasDeVarredura,
  separarHorasExtrasEmNovosProtocolos,
  type FolhaHoraExtra,
  type ResultadoAnalise,
} from "@/lib/horas-extras-separar";
import {
  MENSAGEM_SEM_HORAS_EXTRAS,
  montarFolhasHorasExtrasPdf,
  varrerFolhasHorasExtras,
  type VarreduraHorasExtras,
} from "@/lib/folhas-horas-extras-pdf";

export function HorasExtrasCard() {
  const queryClient = useQueryClient();
  const [separando, setSeparando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [criandoProtocolos, setCriandoProtocolos] = useState(false);
  const [porGerente, setPorGerente] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erroGeracao, setErroGeracao] = useState("");
  const [busca, setBusca] = useState("");
  const [varrendo, setVarrendo] = useState(false);
  const urlsRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  // Sincroniza automaticamente com os protocolos salvos: a análise roda sozinha
  // ao abrir a aba e é refeita sempre que os protocolos mudam (realtime).
  const consulta = useQuery<{
    analise: ResultadoAnalise;
    varredura: VarreduraHorasExtras;
    reconhecidas: FolhaHoraExtra[];
  }>({
    queryKey: protocoloFolhasQueryKeys.horasExtrasProtocoladas,
    queryFn: async () => {
      setProgresso("Sincronizando com os protocolos salvos...");
      try {
        const analise = await analisarHorasExtras(setProgresso);
        // Reconhecimento automático página a página (com OCR quando digitalizado).
        const varredura = await varrerFolhasHorasExtras(setProgresso);
        const reconhecidas = await folhasDeVarredura(varredura.paginas, setProgresso);
        return { analise, varredura, reconhecidas };
      } finally {
        setProgresso("");
      }
    },
    // Análise cara (baixa PDFs e roda OCR). Mantemos o resultado por 15 min e
    // nunca refazemos sozinho ao focar/remontar — a atualização é feita pelo
    // botão de reanálise ou quando os protocolos realmente mudam.
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const resultado = consulta.data?.analise ?? null;
  const varredura = consulta.data?.varredura ?? null;
  const analisando = consulta.isFetching;
  const erro =
    erroGeracao ||
    (consulta.error instanceof Error
      ? consulta.error.message
      : consulta.error
        ? "Não foi possível analisar as folhas de ponto."
        : "");

  // Une o que a análise por protocolo achou com o reconhecimento automático
  // página a página, sem repetir a mesma página do mesmo arquivo.
  const todasFolhas = useMemo(() => {
    const mapa = new Map<string, FolhaHoraExtra>();
    for (const f of [...(resultado?.folhas ?? []), ...(consulta.data?.reconhecidas ?? [])]) {
      const chave = `${f.caminho ?? f.chave ?? ""}#${f.paginaPdf || f.pagina || 0}`;
      if (!mapa.has(chave)) mapa.set(chave, f);
    }
    return [...mapa.values()].sort(
      (a, b) =>
        a.empresa.localeCompare(b.empresa, "pt-BR") ||
        a.colaborador.localeCompare(b.colaborador, "pt-BR"),
    );
  }, [resultado, consulta.data]);

  const folhas = useMemo(() => {
    const lista = todasFolhas;
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter((f) =>
      `${f.empresa} ${f.colaborador} ${f.matricula} ${f.motivos.join(" ")}`
        .toLowerCase()
        .includes(termo),
    );
  }, [todasFolhas, busca]);

  const grupos = useMemo(() => agruparHorasExtrasPorEmpresa(folhas), [folhas]);

  /** Folhas com horas extras agrupadas por PROTOCOLO SALVO (um PDF por protocolo). */
  const gruposProtocolo = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; titulo: string; folhas: FolhaHoraExtra[]; empresas: Set<string> }
    >();
    for (const f of folhas) {
      const id = f.protocoloId || f.caminho || "sem-protocolo";
      const titulo = f.protocoloNumero || f.arquivo || "Protocolo sem número";
      const grupo = mapa.get(id) ?? { id, titulo, folhas: [], empresas: new Set<string>() };
      grupo.folhas.push(f);
      grupo.empresas.add(f.empresa || "Não identificada");
      mapa.set(id, grupo);
    }
    return [...mapa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  }, [folhas]);

  const totalOcorrencias = folhas.reduce((s, f) => s + f.ocorrencias, 0);

  function baixar(nome: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
  }

  const refetchRef = useRef(consulta.refetch);
  refetchRef.current = consulta.refetch;

  const analisar = useCallback(async () => {
    setErroGeracao("");
    await refetchRef.current();
  }, []);

  /**
   * Sincronização com os PROTOCOLOS SALVOS: sempre que um protocolo é criado,
   * alterado ou excluído (nesta aba, em outra aba do navegador ou por outro
   * usuário), a leitura das folhas com horas extras é refeita automaticamente.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ressincronizar = () => {
      if (!ativo) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!ativo) return;
        void refetchRef.current();
      }, 800);
    };

    window.addEventListener(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, ressincronizar);

    let broadcast: BroadcastChannel | null = null;
    try {
      broadcast = new BroadcastChannel(PROTOCOLO_FOLHAS_BROADCAST_CHANNEL);
      broadcast.onmessage = ressincronizar;
    } catch {
      broadcast = null;
    }

    const canal = supabase
      .channel("horas-extras-protocolos-salvos")
      .on("postgres_changes", { event: "*", schema: "public", table: "protocolos" }, ressincronizar)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "protocolo_arquivos" },
        ressincronizar,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "protocolo_folhas" },
        ressincronizar,
      )
      .subscribe();

    return () => {
      ativo = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, ressincronizar);
      broadcast?.close();
      void supabase.removeChannel(canal);
    };
  }, []);

  /** Retira todas as folhas com horas extras dos protocolos e cria novos protocolos. */
  async function separarEmNovosProtocolos() {
    if (!folhas.length) return;
    setSeparando(true);
    setErroGeracao("");
    try {
      const r = await separarHorasExtrasEmNovosProtocolos(folhas, setProgresso);
      invalidarConsultasProtocoloFolhas(queryClient);
      notificarAtualizacaoProtocoloFolhas("protocolacao");
      toast.success(
        `${r.folhasMovidas} folha(s) movidas para ${r.protocolosCriados || r.novosProtocolos.length} novo(s) protocolo(s) de horas extras.`,
      );
      await consulta.refetch();
    } catch (e) {
      setErroGeracao(
        e instanceof Error ? e.message : "Falha ao separar as folhas em novos protocolos.",
      );
    } finally {
      setProgresso("");
      setSeparando(false);
    }
  }

  /**
   * Cria PROTOCOLOS SALVOS contendo apenas as folhas com horas extras,
   * cada um com o seu próprio PDF anexado. Os protocolos de origem
   * permanecem intactos.
   */
  async function criarProtocolosSalvos() {
    if (!folhas.length) return;
    setCriandoProtocolos(true);
    setErroGeracao("");
    try {
      const r = await criarProtocolosSalvosHorasExtras(folhas, setProgresso);
      invalidarConsultasProtocoloFolhas(queryClient);
      notificarAtualizacaoProtocoloFolhas("protocolacao");
      if (!r.criados.length) {
        toast.info(
          r.jaExistentes
            ? `${r.jaExistentes} protocolo(s) de horas extras já existiam em Protocolos salvos.`
            : "Nenhum protocolo de horas extras pôde ser criado.",
        );
      } else {
        toast.success(
          `${r.criados.length} protocolo(s) de horas extras criado(s) com ${r.folhas} folha(s) em PDF.`,
        );
      }
      await consulta.refetch();
    } catch (e) {
      setErroGeracao(
        e instanceof Error ? e.message : "Falha ao criar os protocolos de horas extras.",
      );
    } finally {
      setProgresso("");
      setCriandoProtocolos(false);
    }
  }

  /**
   * Gera um PDF de HORAS EXTRAS por GERENTE DE ÁREA (somente as folhas com
   * HORAS EXTRAS) e anexa o MESMO arquivo ao protocolo salvo do gerente.
   */
  async function gerarPorGerenteDeArea() {
    if (!folhas.length) return;
    setPorGerente(true);
    setErroGeracao("");
    try {
      const r = await gerarHorasExtrasPorGerente(folhas, setProgresso);
      if (!r.gerentes.length) {
        toast.info("Nenhuma folha com horas extras para gerar por gerente de área.");
        return;
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const g of r.gerentes) {
        zip.file(g.arquivo, g.bytes.slice(0) as unknown as Uint8Array);
      }
      baixar(
        "Folhas_Horas_Extras_por_Gerente_de_Area.zip",
        await zip.generateAsync({ type: "blob" }),
      );
      invalidarConsultasProtocoloFolhas(queryClient);
      notificarAtualizacaoProtocoloFolhas("protocolacao");
      toast.success(
        `${r.gerentes.length} PDF(s) por gerente de área com ${r.totalFolhas} folha(s), anexados aos protocolos.` +
          (r.folhasSemGerente
            ? ` ${r.folhasSemGerente} folha(s) sem gerente identificado ficaram em um PDF separado.`
            : ""),
      );
      await consulta.refetch();
    } catch (e) {
      setErroGeracao(
        e instanceof Error ? e.message : "Falha ao gerar os PDFs por gerente de área.",
      );
    } finally {
      setProgresso("");
      setPorGerente(false);
    }
  }

  /**
   * Gera o Folhas_Horas_Extras.pdf a partir do reconhecimento automático
   * (varre página a página os PDFs dos protocolos salvos (com OCR quando o
   * arquivo é digitalizado) e gera o Folhas_Horas_Extras.pdf.
   */
  async function gerarFolhasHorasExtrasPdf() {
    setVarrendo(true);
    setErroGeracao("");
    try {
      const r = varredura ?? (await varrerFolhasHorasExtras(setProgresso));
      if (!r.paginas.length) {
        toast.info(MENSAGEM_SEM_HORAS_EXTRAS);
        return;
      }
      const pdf = await montarFolhasHorasExtrasPdf(r.paginas);
      if (!pdf) {
        toast.info(MENSAGEM_SEM_HORAS_EXTRAS);
        return;
      }
      baixar(
        pdf.nomeArquivo,
        new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" }),
      );
      toast.success(`${pdf.paginas} folha(s) com horas extras separada(s) em ${pdf.nomeArquivo}.`);
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : "Falha ao gerar o Folhas_Horas_Extras.pdf.");
    } finally {
      setProgresso("");
      setVarrendo(false);
    }
  }

  async function gerarConsolidado(lista: FolhaHoraExtra[], empresa: string | null) {
    setGerando(true);
    setErroGeracao("");
    try {
      const pdf = await montarPdfHorasExtras(lista, empresa);
      if (!pdf) {
        setErroGeracao("Nenhuma página com hora extra pôde ser copiada dos PDFs originais.");
        return;
      }
      baixar(
        pdf.nomeArquivo,
        new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" }),
      );
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : "Falha ao montar o PDF de horas extras.");
    } finally {
      setGerando(false);
    }
  }

  async function gerarZipPorEmpresa() {
    setGerando(true);
    setErroGeracao("");
    try {
      const zip = new JSZip();
      let arquivos = 0;
      for (const grupo of grupos) {
        const pdf = await montarPdfHorasExtras(grupo.folhas, grupo.empresa);
        if (!pdf) continue;
        zip.file(pdf.nomeArquivo, pdf.bytes);
        arquivos += 1;
      }
      if (!arquivos) {
        setErroGeracao("Nenhum PDF por empresa pôde ser gerado.");
        return;
      }
      baixar("Folhas_com_Horas_Extras_por_empresa.zip", await zip.generateAsync({ type: "blob" }));
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : "Falha ao gerar o pacote por empresa.");
    } finally {
      setGerando(false);
    }
  }

  /** Nome de arquivo seguro para o protocolo salvo. */
  function nomeProtocoloArquivo(titulo: string): string {
    const limpo = titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    return `Horas_Extras_${limpo || "Protocolo"}.pdf`;
  }

  /** PDF com as folhas de horas extras de UM protocolo salvo. */
  async function gerarPdfDoProtocolo(grupo: { titulo: string; folhas: FolhaHoraExtra[] }) {
    setGerando(true);
    setErroGeracao("");
    try {
      const pdf = await montarPdfHorasExtras(grupo.folhas, null);
      if (!pdf) {
        setErroGeracao("Nenhuma página com hora extra pôde ser copiada deste protocolo.");
        return;
      }
      baixar(
        nomeProtocoloArquivo(grupo.titulo),
        new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" }),
      );
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : "Falha ao montar o PDF deste protocolo.");
    } finally {
      setGerando(false);
    }
  }

  /** Um PDF por protocolo salvo, dentro de um único pacote .zip. */
  async function gerarZipPorProtocolo() {
    setGerando(true);
    setErroGeracao("");
    try {
      const zip = new JSZip();
      let arquivos = 0;
      for (const grupo of gruposProtocolo) {
        const pdf = await montarPdfHorasExtras(grupo.folhas, null);
        if (!pdf) continue;
        zip.file(nomeProtocoloArquivo(grupo.titulo), pdf.bytes);
        arquivos += 1;
      }
      if (!arquivos) {
        setErroGeracao("Nenhum PDF por protocolo pôde ser gerado.");
        return;
      }
      baixar(
        "Folhas_com_Horas_Extras_por_protocolo.zip",
        await zip.generateAsync({ type: "blob" }),
      );
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : "Falha ao gerar o pacote por protocolo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Separar folhas com horas extras
        </CardTitle>
        <CardDescription>
          Sincroniza com os protocolos salvos, lê a coluna <strong>MOTIVO</strong> de cada folha de
          ponto e separa todas as folhas com lançamento de horas extras.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={analisar} disabled={analisando || gerando} className="gap-2">
            {analisando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {resultado ? "Analisar novamente" : "Analisar folhas protocoladas"}
          </Button>
          <Button
            className="gap-2"
            disabled={!folhas.length || analisando || gerando || separando}
            onClick={separarEmNovosProtocolos}
          >
            {separando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            Separar em novos protocolos
          </Button>
          <Button
            className="gap-2"
            disabled={!folhas.length || analisando || gerando || criandoProtocolos}
            onClick={criarProtocolosSalvos}
          >
            {criandoProtocolos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Criar protocolos salvos de horas extras
          </Button>
          <Button
            className="gap-2"
            disabled={varrendo || analisando || gerando}
            onClick={gerarFolhasHorasExtrasPdf}
          >
            {varrendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Gerar Folhas_Horas_Extras.pdf
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!folhas.length || analisando || gerando || porGerente}
            onClick={gerarPorGerenteDeArea}
          >
            {porGerente ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            PDF por Gerente de Área
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!folhas.length || analisando || gerando}
            onClick={() => gerarConsolidado(folhas, null)}
          >
            <Download className="h-4 w-4" />
            PDF único
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!grupos.length || analisando || gerando}
            onClick={gerarZipPorEmpresa}
          >
            <Archive className="h-4 w-4" />
            ZIP por empresa
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!gruposProtocolo.length || analisando || gerando}
            onClick={gerarZipPorProtocolo}
          >
            <Archive className="h-4 w-4" />
            ZIP por protocolo
          </Button>

          <Button
            variant="outline"
            className="gap-2"
            disabled={!folhas.length || analisando || gerando}
            onClick={() =>
              baixar(
                "Folhas_com_Horas_Extras.csv",
                new Blob(["\uFEFF" + csvHorasExtras(folhas)], {
                  type: "text/csv;charset=utf-8",
                }),
              )
            }
          >
            <FileSpreadsheet className="h-4 w-4" />
            Planilha
          </Button>
          {gerando && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Montando arquivos...
            </span>
          )}
        </div>

        {varredura && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">
              {varredura.paginas.length
                ? `${varredura.paginas.length} folha(s) com horas extras separada(s) — Folhas_Horas_Extras.pdf`
                : MENSAGEM_SEM_HORAS_EXTRAS}
            </p>
            <p className="text-muted-foreground">
              {varredura.paginasAnalisadas} página(s) analisada(s) em {varredura.arquivosLidos}{" "}
              arquivo(s)
              {varredura.paginasComOcr > 0 && `, ${varredura.paginasComOcr} com OCR`}
              {varredura.arquivosIlegiveis > 0 &&
                `, ${varredura.arquivosIlegiveis} arquivo(s) ilegível(is)`}
              .
            </p>
            {varredura.paginas.length > 0 && (
              <ul className="space-y-1 text-muted-foreground">
                {varredura.paginas.map((p) => (
                  <li key={`${p.caminho}#${p.pagina}`}>
                    Página {p.pagina} — {p.colaborador}
                    {p.matricula ? ` (${p.matricula})` : ""} · {p.arquivo}
                    {p.viaOcr ? " · OCR" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(analisando || progresso) && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {progresso || "Analisando..."}
          </p>
        )}

        {erro && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {erro}
          </p>
        )}

        {resultado && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Resumo titulo="Folhas com horas extras" valor={folhas.length} />
              <Resumo titulo="Lançamentos encontrados" valor={totalOcorrencias} />
              <Resumo titulo="Empresas" valor={grupos.length} />
              <Resumo titulo="Páginas analisadas" valor={resultado.paginasAnalisadas} />
            </div>

            {(resultado.semPdf > 0 ||
              resultado.pdfsIlegiveis > 0 ||
              resultado.paginasCorrigidas > 0 ||
              resultado.folhasSemPaginaNoPdf > 0) && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {resultado.semPdf > 0 &&
                  `${resultado.semPdf} folha(s) protocolada(s) sem PDF original disponível. `}
                {resultado.paginasCorrigidas > 0 &&
                  `${resultado.paginasCorrigidas} folha(s) tiveram a página corrigida pela conferência do colaborador no PDF salvo. `}
                {resultado.folhasSemPaginaNoPdf > 0 &&
                  `${resultado.folhasSemPaginaNoPdf} folha(s) não foram localizadas dentro do PDF do protocolo. `}
                {resultado.pdfsIlegiveis > 0 &&
                  `${resultado.pdfsIlegiveis} PDF(s) não puderam ser lidos.`}
              </p>
            )}

            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa, colaborador, matrícula ou motivo"
            />

            {gruposProtocolo.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Separar por protocolo salvo
                </p>
                <div className="space-y-2">
                  {gruposProtocolo.map((grupo) => (
                    <div
                      key={grupo.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">{grupo.titulo}</span>
                        <Badge variant="secondary">{grupo.folhas.length} folha(s)</Badge>
                        <Badge variant="outline">{grupo.empresas.size} empresa(s)</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={gerando}
                        onClick={() => gerarPdfDoProtocolo(grupo)}
                      >
                        <Download className="h-4 w-4" />
                        PDF deste protocolo
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {grupos.map((grupo) => (
              <div key={grupo.empresa} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {grupo.empresa}
                    <Badge variant="secondary">{grupo.folhas.length} folha(s)</Badge>
                    <Badge variant="outline">{grupo.colaboradores} colaborador(es)</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={gerando}
                    onClick={() => gerarConsolidado(grupo.folhas, grupo.empresa)}
                  >
                    <Download className="h-4 w-4" />
                    {nomeArquivoHorasExtras(grupo.empresa, grupo.competencias[0])}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Pág.</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupo.folhas.map((f) => (
                        <TableRow key={f.chave}>
                          <TableCell className="font-medium">{f.colaborador}</TableCell>
                          <TableCell>{f.matricula || "—"}</TableCell>
                          <TableCell>{f.protocoloNumero}</TableCell>
                          <TableCell>
                            {f.paginaPdf || f.pagina || "—"}
                            {f.paginaCorrigida && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (registro: {f.pagina ?? "—"})
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                            {f.motivos.join(" | ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            {!folhas.length && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {resultado.semPdf > 0 && resultado.semPdf === resultado.totalFolhas
                  ? "As folhas estão no protocolo, mas o PDF original não foi salvo. Reenvie o mesmo arquivo na aba Protocolar para reparar o vínculo e analise novamente."
                  : "Nenhuma folha de ponto com horas extras encontrada nos protocolos salvos"}
                {resultado.totalFolhas > 0 && resultado.semPdf !== resultado.totalFolhas
                  ? ` (${resultado.totalFolhas} folha(s) analisada(s)).`
                  : resultado.semPdf === resultado.totalFolhas
                    ? ""
                    : "."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold text-foreground">{valor}</p>
    </div>
  );
}
