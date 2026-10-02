import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { caminhoStorage } from "@/lib/storage-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { lerFolhasDoPdf, type FolhaPonto } from "@/lib/pdf-ponto";
import { useSessao, nomeDoUsuario } from "@/hooks/use-sessao";
import { useCicloProtocolacao } from "@/lib/ciclo-protocolacao";
import {
  chaveUnicaFolhaPonto,
  deduplicarFolhasPonto,
  invalidarConsultasProtocoloFolhas,
  notificarAtualizacaoProtocoloFolhas,
  type FolhaParaChave,
} from "@/lib/protocolo-folhas-sync";

type FolhaManual = {
  id: string;
  colaborador: string;
  empresa: string;
  cargo: string;
  matricula: string;
  posto: string;
  admissao: string;
};

type FolhaPreparada = FolhaParaChave & {
  colaborador: string;
  empresa: string;
  cargo: string;
  matricula: string;
  posto: string;
  admissao: string;
  pagina: number | null;
  arquivo: string | null;
};

type FolhaExistenteBanco = {
  colaborador: string;
  empresa: string;
  matricula: string;
};

const CAMPO_VAZIO: Omit<FolhaManual, "id"> = {
  colaborador: "",
  empresa: "",
  cargo: "",
  matricula: "",
  posto: "",
  admissao: "",
};

function gerarId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function carregarChavesExistentes(inicio: string, fim: string): Promise<Set<string>> {
  const PAGINA = 1000;
  const chaves = new Set<string>();

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("protocolo_folhas")
      .select("colaborador, empresa, matricula, protocolos!inner(created_at)")
      .gte("protocolos.created_at", inicio)
      .lt("protocolos.created_at", fim)
      .range(offset, offset + PAGINA - 1);

    if (error) throw error;

    const lote = (data ?? []) as FolhaExistenteBanco[];
    for (const folha of lote) {
      chaves.add(chaveUnicaFolhaPonto(folha));
    }

    if (lote.length < PAGINA) break;
  }

  return chaves;
}

/** Tamanho máximo aceito no upload de folhas (PDFs maiores travam o navegador). */
const TAMANHO_MAXIMO_PDF = 80 * 1024 * 1024;

/** Valida o arquivo escolhido; devolve a mensagem de erro ou "" quando está ok. */
function validarPdf(arquivo: File | null): string {
  if (!arquivo) return "";
  const ehPdf = arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf");
  if (!ehPdf) return "Selecione um arquivo PDF. Outros formatos não são aceitos.";
  if (arquivo.size === 0) return "O arquivo está vazio. Escolha outro PDF.";
  if (arquivo.size > TAMANHO_MAXIMO_PDF) {
    return `O PDF tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e ultrapassa o limite de 80 MB. Divida o arquivo antes de enviar.`;
  }
  return "";
}

export function AbaProtocolar() {
  const { user } = useSessao();
  const ciclo = useCicloProtocolacao();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [folhasPdf, setFolhasPdf] = useState<FolhaPonto[]>([]);
  const [lendoPdf, setLendoPdf] = useState(false);
  /** Ids das folhas do PDF que o usuário optou por excluir antes de protocolar. */
  const [excluidasPdf, setExcluidasPdf] = useState<Set<string>>(new Set());

  const [folhasManuais, setFolhasManuais] = useState<FolhaManual[]>([]);
  const [form, setForm] = useState<Omit<FolhaManual, "id">>({ ...CAMPO_VAZIO });

  useEffect(() => {
    if (!file) {
      setFolhasPdf([]);
      setExcluidasPdf(new Set());
      return;
    }
    let cancelado = false;
    setLendoPdf(true);
    lerFolhasDoPdf(file)
      .then((resultado) => {
        if (cancelado) return;
        setFolhasPdf(resultado ?? []);
      })
      .catch(() => {
        if (cancelado) return;
        setFolhasPdf([]);
        toast.error("Não foi possível ler as folhas do PDF.");
      })
      .finally(() => {
        if (!cancelado) setLendoPdf(false);
      });
    return () => {
      cancelado = true;
    };
  }, [file]);

  function adicionarFolhaManual() {
    const colaborador = form.colaborador.trim();
    if (!colaborador) {
      toast.error("Informe ao menos o nome do colaborador.");
      return;
    }
    setFolhasManuais((prev) => [...prev, { id: gerarId(), ...form, colaborador }]);
    setForm({ ...CAMPO_VAZIO });
    toast.success("Folha manual adicionada.");
  }

  function removerFolhaManual(id: string) {
    setFolhasManuais((prev) => prev.filter((f) => f.id !== id));
  }

  function alternarExclusaoPdf(id: string) {
    // Remove a linha de verdade da lista: ela não vai para os protocolos salvos.
    setFolhasPdf((prev) => prev.filter((f) => f.id !== id));
    toast.success("Linha excluída do envio.");
  }

  function excluirFolhasManuaisDetectadas() {
    const qtd = folhasPdf.filter((f) => f.folhaManual).length;
    setFolhasPdf((prev) => prev.filter((f) => !f.folhaManual));
    toast.success(`${qtd} folha(s) com motivo FOLHA MANUAL foram excluídas do envio.`);
  }

  const todasFolhasPreview = useMemo<FolhaPreparada[]>(
    () => [
      ...folhasPdf
        .filter((f) => !excluidasPdf.has(f.id))
        .map((f) => ({
        colaborador: f.colaborador,
        empresa: f.empresa,
        cargo: f.cargo,
        matricula: f.matricula,
        posto: f.posto,
        admissao: f.admissao,
          pagina: f.pagina,
          arquivo: f.arquivo,
        })),
      ...folhasManuais.map((f) => ({
        colaborador: f.colaborador,
        empresa: f.empresa || "",
        cargo: f.cargo || "",
        matricula: f.matricula || "",
        posto: f.posto || "",
        admissao: f.admissao || "",
        pagina: null,
        arquivo: null,
      })),
    ],
    [folhasPdf, folhasManuais, excluidasPdf],
  );

  const previewDeduplicado = useMemo(
    () => deduplicarFolhasPonto(todasFolhasPreview),
    [todasFolhasPreview],
  );

  const protocolarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

      if (todasFolhasPreview.length === 0) {
        throw new Error(
          "Nenhuma folha para protocolar. Carregue um PDF ou adicione folhas manualmente.",
        );
      }

      const chavesExistentes = await carregarChavesExistentes(ciclo.inicio, ciclo.fim);
      const folhasNovas = previewDeduplicado.unicas.filter(
        (folha) => !chavesExistentes.has(chaveUnicaFolhaPonto(folha)),
      );
      const duplicadasBanco = previewDeduplicado.unicas.length - folhasNovas.length;
      const duplicadasTotal = previewDeduplicado.duplicadas.length + duplicadasBanco;

      if (folhasNovas.length === 0 && file) {
        // Repara protocolos antigos cujas folhas foram salvas, mas cujo upload
        // do PDF falhou. Isso torna possível reenviar o mesmo arquivo sem
        // duplicar as folhas do protocolo.
        const { data: candidatos, error: erroCandidatos } = await supabase
          .from("protocolos")
          .select("id")
          .eq("user_id", user.id)
          .eq("titulo", file.name)
          .gte("created_at", ciclo.inicio)
          .lt("created_at", ciclo.fim)
          .order("created_at", { ascending: false })
          .limit(10);
        if (erroCandidatos) throw erroCandidatos;

        for (const candidato of candidatos ?? []) {
          const { count, error: erroContagem } = await supabase
            .from("protocolo_arquivos")
            .select("id", { count: "exact", head: true })
            .eq("protocolo_id", candidato.id);
          if (erroContagem) throw erroContagem;
          if ((count ?? 0) > 0) continue;

          const path = caminhoStorage(candidato.id, file.name);
          const { error: erroUpload } = await supabase.storage
            .from("folhas-pdf")
            .upload(path, file, { contentType: "application/pdf", upsert: true });
          if (erroUpload)
            throw new Error(`Falha ao reparar o PDF do protocolo: ${erroUpload.message}`);

          const { error: erroVinculo } = await supabase.from("protocolo_arquivos").insert({
            protocolo_id: candidato.id,
            nome: file.name,
            caminho: path,
            tamanho: file.size,
          });
          if (erroVinculo) {
            await supabase.storage.from("folhas-pdf").remove([path]);
            throw new Error(`Falha ao vincular o PDF ao protocolo: ${erroVinculo.message}`);
          }

          return {
            id: candidato.id,
            totalDetectado: todasFolhasPreview.length,
            totalFolhas: 0,
            duplicadas: duplicadasTotal,
            reparado: true,
          };
        }
      }

      if (folhasNovas.length === 0) {
        throw new Error(
          `Nenhuma folha nova para salvar. ${duplicadasTotal} duplicidade(s) foram identificada(s).`,
        );
      }

      // Garante o perfil do responsável (o protocolo é ligado ao perfil).
      const { error: erroPerfil } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          nome: nomeDoUsuario(user),
          email: user.email ?? null,
        },
        { onConflict: "id" },
      );
      if (erroPerfil) throw erroPerfil;

      const nomeArquivo = file?.name || "protocolo-manual";
      const primeiraEmpresa = folhasNovas.find((f) => f.empresa)?.empresa || null;
      const hoje = new Date().toISOString().slice(0, 10);

      const { data: protocolo, error: errProtocolo } = await supabase
        .from("protocolos")
        .insert({
          titulo: nomeArquivo,
          user_id: user.id,
          empresa: primeiraEmpresa,
          data_entrega: hoje,
        })
        .select("id")
        .single();
      if (errProtocolo) throw errProtocolo;

      const rows = folhasNovas.map((f, idx) => ({
        protocolo_id: protocolo.id,
        ordem: idx + 1,
        pagina: f.pagina,
        arquivo: f.arquivo,
        colaborador: f.colaborador,
        empresa: f.empresa,
        cargo: f.cargo,
        matricula: f.matricula,
        posto: f.posto,
        admissao: f.admissao,
      }));

      if (file) {
        const path = caminhoStorage(protocolo.id, file.name);
        const { error: errUpload } = await supabase.storage
          .from("folhas-pdf")
          .upload(path, file, { contentType: "application/pdf", upsert: true });
        if (errUpload) {
          await supabase.from("protocolos").delete().eq("id", protocolo.id);
          throw new Error(`O PDF não pôde ser salvo: ${errUpload.message}`);
        }

        const { error: errArquivo } = await supabase.from("protocolo_arquivos").insert({
          protocolo_id: protocolo.id,
          nome: file.name,
          caminho: path,
          tamanho: file.size,
        });
        if (errArquivo) {
          await supabase.storage.from("folhas-pdf").remove([path]);
          await supabase.from("protocolos").delete().eq("id", protocolo.id);
          throw new Error(`O PDF foi enviado, mas não pôde ser vinculado: ${errArquivo.message}`);
        }
      }

      const { data: folhasInseridas, error: errFolhas } = await supabase
        .from("protocolo_folhas")
        .insert(rows)
        .select("id");
      if (errFolhas) {
        if (file)
          await supabase.storage
            .from("folhas-pdf")
            .remove([caminhoStorage(protocolo.id, file.name)]);
        await supabase.from("protocolos").delete().eq("id", protocolo.id);
        throw errFolhas;
      }

      return {
        id: protocolo.id,
        totalDetectado: todasFolhasPreview.length,
        totalFolhas: folhasInseridas?.length ?? folhasNovas.length,
        duplicadas: duplicadasTotal,
        reparado: false,
      };
    },
    onSuccess: (result) => {
      if (result.reparado) {
        toast.success(
          "PDF original vinculado ao protocolo existente. A aba Horas Extras já pode analisá-lo.",
        );
      } else {
        const complemento =
          result.duplicadas > 0 ? ` ${result.duplicadas} duplicidade(s) foram ignorada(s).` : "";
        toast.success(`Protocolo criado com ${result.totalFolhas} folha(s) nova(s).${complemento}`);
      }
      setFile(null);
      setFolhasPdf([]);
      setExcluidasPdf(new Set());
      setFolhasManuais([]);
      setForm({ ...CAMPO_VAZIO });
      if (inputRef.current) inputRef.current.value = "";
      invalidarConsultasProtocoloFolhas(queryClient);
      notificarAtualizacaoProtocoloFolhas("protocolacao");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao protocolar.");
    },
  });

  const qtdPdf = folhasPdf.length;
  const qtdManual = folhasManuais.length;
  const qtdFolhaManualDetectada = folhasPdf.filter((f) => f.folhaManual).length;
  const qtdExcluidas = excluidasPdf.size;
  const totalGeral = qtdPdf + qtdManual - qtdExcluidas;
  const totalUnicoPreview = previewDeduplicado.unicas.length;
  const duplicadasPreview = previewDeduplicado.duplicadas.length;
  const resumoFontes = [
    qtdPdf > 0 ? `${qtdPdf} do PDF` : "",
    qtdManual > 0 ? `${qtdManual} manual(is)` : "",
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5 text-primary" />
            Carregar PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const escolhido = e.target.files?.[0] ?? null;
              const problema = validarPdf(escolhido);
              if (problema) {
                toast.error(problema);
                e.target.value = "";
                setFile(null);
                return;
              }
              setFile(escolhido);
            }}
          />
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {file.name}
            </div>
          )}
        </CardContent>
      </Card>

      {(lendoPdf || folhasPdf.length > 0) && (
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Eye className="h-5 w-5 text-primary" />
              Folhas encontradas no PDF
              {!lendoPdf && folhasPdf.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {folhasPdf.length} folha{folhasPdf.length !== 1 ? "s" : ""}
                </Badge>
              )}
              {!lendoPdf && qtdFolhaManualDetectada > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={excluirFolhasManuaisDetectadas}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir FOLHA MANUAL ({qtdFolhaManualDetectada})
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lendoPdf ? (
              <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Lendo folhas do PDF...</span>
              </div>
            ) : folhasPdf.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma folha identificada neste PDF.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      {[
                        "#",
                        "Colaborador",
                        "Empresa",
                        "Cargo",
                        "Matrícula",
                        "Posto",
                        "Admissão",
                        "Motivo",
                        "",
                      ].map((c) => (
                        <th key={c} className="px-3 py-2 font-semibold text-muted-foreground">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {folhasPdf.map((f, idx) => {
                      const excluida = excluidasPdf.has(f.id);
                      return (
                        <tr
                          key={f.id}
                          className={`border-t border-border hover:bg-muted/30 ${excluida ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                          <td
                            className={`px-3 py-2 font-medium text-foreground ${excluida ? "line-through" : ""}`}
                          >
                            {f.colaborador}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{f.empresa || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{f.cargo || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{f.matricula || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{f.posto || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{f.admissao || "—"}</td>
                          <td className="px-3 py-2">
                            {f.folhaManual ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/50 text-xs text-amber-600 dark:text-amber-400"
                              >
                                FOLHA MANUAL
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-7 w-7 ${
                                excluida
                                  ? "text-primary hover:bg-primary/10"
                                  : "text-destructive hover:bg-destructive/10"
                              }`}
                              onClick={() => alternarExclusaoPdf(f.id)}
                              aria-label={
                                excluida
                                  ? `Reincluir folha de ${f.colaborador}`
                                  : `Excluir folha de ${f.colaborador} do envio`
                              }
                              title={excluida ? "Reincluir no envio" : "Excluir do envio"}
                            >
                              {excluida ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-primary" />
            Adicionar folha manual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="colaborador">Colaborador *</Label>
              <Input
                id="colaborador"
                placeholder="Nome do colaborador"
                value={form.colaborador}
                onChange={(e) => setForm((f) => ({ ...f, colaborador: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Input
                id="empresa"
                placeholder="Nome da empresa"
                value={form.empresa}
                onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                placeholder="Cargo"
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                placeholder="Matrícula"
                value={form.matricula}
                onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="posto">Posto</Label>
              <Input
                id="posto"
                placeholder="Posto / Unidade"
                value={form.posto}
                onChange={(e) => setForm((f) => ({ ...f, posto: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admissao">Admissão</Label>
              <Input
                id="admissao"
                placeholder="Data de admissão"
                value={form.admissao}
                onChange={(e) => setForm((f) => ({ ...f, admissao: e.target.value }))}
              />
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={adicionarFolhaManual}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar folha
          </Button>

          {folhasManuais.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    {["#", "Colaborador", "Empresa", "Cargo", "Matrícula", ""].map((c, i) => (
                      <th
                        key={`${c}-${i}`}
                        className="px-3 py-2 font-semibold text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {folhasManuais.map((f, idx) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{f.colaborador}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.empresa || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.cargo || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.matricula || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removerFolhaManual(f.id)}
                          aria-label={`Remover folha de ${f.colaborador}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save className="h-5 w-5 text-primary" />
            Salvar protocolo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {totalGeral > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              <p>
                Detectadas: {totalGeral} folha{totalGeral !== 1 ? "s" : ""}
                {resumoFontes ? ` (${resumoFontes})` : ""}
              </p>
              <p>
                Únicas no preview: {totalUnicoPreview} folha{totalUnicoPreview !== 1 ? "s" : ""}
              </p>
              {duplicadasPreview > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  {duplicadasPreview} duplicidade(s) no arquivo/formulário serão ignorada(s).
                </p>
              )}
              {qtdExcluidas > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  {qtdExcluidas} folha(s) excluída(s) manualmente não serão enviada(s).
                </p>
              )}
            </div>
          )}
          <Button
            className="w-full"
            disabled={totalUnicoPreview === 0 || lendoPdf || protocolarMutation.isPending}
            onClick={() => protocolarMutation.mutate()}
          >
            {protocolarMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Salvar protocolo
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
