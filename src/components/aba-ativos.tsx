import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Building2,
  Users,
  FileText,
  Sparkles,
  Trash2,
  AlertTriangle,
  Copy,
} from "lucide-react";
import {
  lerPlanilhaAtivosComMetadados,
  type AtivoImportado,
  type MetadadosPlanilha,
} from "@/lib/ativos-planilha";
import {
  importarAtivosNoBanco,
  useAtivosBanco,
  limparAtivosDoBanco,
  contarAtivosNoBanco,
  type ResultadoImportacao,
} from "@/lib/ativos-db";
import { useSessao } from "@/hooks/use-sessao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AtivosNextiImport } from "@/components/AtivosNextiImport";

type Etapa = "selecionar" | "lendo" | "preview" | "importando" | "concluido" | "erro";

/** Keys de queries que precisam ser invalidadas quando os dados de ativos mudam. */
const QUERY_KEYS_ATIVOS = [
  ["funcionarios-ativos"],
  ["dashboard-cards-ativos"],
  ["dashboard-cards-folhas"],
  ["dashboard-total-ativos"],
  ["folhas-protocoladas"],
  ["folhas-protocoladas-com-protocolo"],
  ["dashboard-total-folhas"],
  ["dashboard-total-protocolos"],
];

export function AbaAtivos() {
  const { user } = useSessao();
  const queryClient = useQueryClient();
  const { data: ativosBanco } = useAtivosBanco();
  const [etapa, setEtapa] = useState<Etapa>("selecionar");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [ativos, setAtivos] = useState<AtivoImportado[]>([]);
  const [metadados, setMetadados] = useState<MetadadosPlanilha | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [totalConfirmadoBanco, setTotalConfirmadoBanco] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [apagando, setApagando] = useState(false);

  const totalNoBanco = ativosBanco?.length ?? 0;
  const empresasNoBanco = new Set((ativosBanco ?? []).map((a) => a.empresa)).size;

  /** Invalida todas as queries relacionadas a dados de funcionários ativos. */
  const invalidarQueries = useCallback(() => {
    for (const key of QUERY_KEYS_ATIVOS) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);

  const resetar = useCallback(() => {
    setEtapa("selecionar");
    setNomeArquivo("");
    setAtivos([]);
    setMetadados(null);
    setResultado(null);
    setTotalConfirmadoBanco(null);
    setErro("");
  }, []);

  async function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    setEtapa("lendo");
    setErro("");
    try {
      const resultadoLeitura = await lerPlanilhaAtivosComMetadados(arquivo);
      setAtivos(resultadoLeitura.ativos);
      setMetadados(resultadoLeitura.metadados);
      setEtapa("preview");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
      setEtapa("erro");
    }
    // Reseta o input para permitir re-selecionar o mesmo arquivo
    e.target.value = "";
  }

  async function confirmarImportacao() {
    setEtapa("importando");
    setErro("");
    try {
      const res = await importarAtivosNoBanco(ativos, user?.id ?? null);
      setResultado(res);

      // Invalida queries para atualizar o card "Funcionários Ativos" no dashboard
      invalidarQueries();

      // Consulta direta ao banco para confirmar o total real salvo
      try {
        const totalReal = await contarAtivosNoBanco();
        setTotalConfirmadoBanco(totalReal);
      } catch {
        // Se falhar a contagem de conferência, não bloqueia a conclusão
        setTotalConfirmadoBanco(null);
      }

      setEtapa("concluido");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao importar no banco.");
      setEtapa("erro");
    }
  }

  async function apagarTodosDados() {
    setApagando(true);
    try {
      const removidos = await limparAtivosDoBanco();
      invalidarQueries();
      resetar();
      toast.success(`${removidos.toLocaleString("pt-BR")} registros apagados com sucesso.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao apagar os dados.");
    } finally {
      setApagando(false);
    }
  }

  // Ordena empresas por contagem (maior primeiro) para o preview
  const empresasOrdenadas = metadados
    ? Object.entries(metadados.contagemPorEmpresa).sort((a, b) => b[1] - a[1])
    : [];

  const isPdf = nomeArquivo.toLowerCase().endsWith(".pdf");

  // Verifica divergência entre preview e banco após importação
  const temDivergencia =
    totalConfirmadoBanco !== null && resultado !== null && totalConfirmadoBanco !== resultado.total;

  return (
    <div className="space-y-6">
      {/* Card ao vivo: total de funcionários ativos no banco (atualiza após cada importação) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Funcionários ativos no banco</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-primary">
            {totalNoBanco.toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>Empresas / setores</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {empresasNoBanco.toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      {/* Importação direta da API da NEXTI (apenas situação TRABALHANDO) */}
      <AtivosNextiImport />

      {/* Botão de apagar todos os dados */}
      {totalNoBanco > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={apagando} className="gap-2">
              {apagando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {apagando ? "Apagando..." : "Apagar todos os dados importados"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar todos os dados importados?</AlertDialogTitle>
              <AlertDialogDescription>
                Essa ação vai remover todos os{" "}
                <span className="font-semibold text-foreground">
                  {totalNoBanco.toLocaleString("pt-BR")} funcionários
                </span>{" "}
                de{" "}
                <span className="font-semibold text-foreground">
                  {empresasNoBanco} empresa{empresasNoBanco === 1 ? "" : "s"}
                </span>{" "}
                do banco de dados. Arquivos PDF, CSV e planilhas importados anteriormente precisarão
                ser importados novamente. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={apagarTodosDados}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Apagar tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Seleção de arquivo */}

      {etapa === "selecionar" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Funcionários Ativos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecione um arquivo PDF, CSV ou Excel (.xlsx, .xls) para atualizar a lista de
                funcionários ativos.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  Excel / CSV
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  PDF
                </Badge>
                <Badge variant="outline" className="gap-1 text-emerald-600">
                  <Sparkles className="h-3 w-3" />
                  Detecção inteligente de colunas
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                O sistema detecta automaticamente as colunas de nome, matrícula, cargo e empresa,
                mesmo que os cabeçalhos sejam diferentes do padrão.
              </p>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={aoSelecionarArquivo}
              />
              <Button asChild variant="default" size="lg">
                <span>
                  <FileSpreadsheet className="mr-2 h-5 w-5" />
                  Selecionar arquivo
                </span>
              </Button>
            </label>
          </CardContent>
        </Card>
      )}

      {/* Lendo o arquivo */}
      {etapa === "lendo" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {isPdf ? "Extraindo dados do PDF..." : "Lendo planilha..."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isPdf ? (
                  <>
                    Analisando tabelas e texto de{" "}
                    <span className="font-medium text-foreground">{nomeArquivo}</span>
                  </>
                ) : (
                  <>
                    Analisando todas as abas de{" "}
                    <span className="font-medium text-foreground">{nomeArquivo}</span>
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview com dados reais */}
      {etapa === "preview" && metadados && (
        <div className="space-y-4">
          {/* Resumo geral */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {isPdf ? (
                  <FileText className="h-5 w-5 text-primary" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                )}
                Resumo da leitura — {nomeArquivo}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-primary/10 p-3 text-center">
                  <p className="text-2xl font-bold text-primary">
                    {metadados.totalLinhasLidas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-muted-foreground">Funcionários válidos</p>
                </div>
                <div className="rounded-lg bg-chart-2/10 p-3 text-center">
                  <p className="text-2xl font-bold text-chart-2">{empresasOrdenadas.length}</p>
                  <p className="text-xs text-muted-foreground">Empresas / setores</p>
                </div>
                <div className="rounded-lg bg-chart-3/10 p-3 text-center">
                  <p className="text-2xl font-bold text-chart-3">{metadados.abasComDados.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPdf ? "Páginas lidas" : "Abas com dados"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{metadados.totalAbas}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPdf ? "Total de páginas" : "Total de abas"}
                  </p>
                </div>
              </div>

              {metadados.totalLinhasIgnoradas > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {metadados.totalLinhasIgnoradas} linha
                    {metadados.totalLinhasIgnoradas === 1
                      ? " foi ignorada"
                      : "s foram ignoradas"}{" "}
                    (sem nome de funcionário, cabeçalho repetido ou rodapé).
                  </p>
                </div>
              )}

              {metadados.totalDuplicatasRemovidas > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {metadados.totalDuplicatasRemovidas} duplicata
                    {metadados.totalDuplicatasRemovidas === 1 ? " removida" : "s removidas"} (mesma
                    matrícula e empresa, ou mesmo nome e empresa). A lista abaixo já está sem
                    duplicatas.
                  </p>
                </div>
              )}

              {metadados.abasSemDados.length > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {isPdf ? "Páginas" : "Abas"} ignoradas (sem dados reconhecidos):{" "}
                    {metadados.abasSemDados.join(", ")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card de registros duplicados encontrados */}
          {metadados.duplicatas && metadados.duplicatas.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                  <Copy className="h-4 w-4" />
                  Registros duplicados encontrados
                  <Badge
                    variant="outline"
                    className="ml-auto border-amber-300 text-xs font-normal text-amber-700 dark:border-amber-700 dark:text-amber-400"
                  >
                    {metadados.duplicatas.length} duplicata
                    {metadados.duplicatas.length === 1 ? "" : "s"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-5 pb-3">
                  <p className="text-xs text-muted-foreground">
                    Estes registros foram removidos da importação por terem mesma matrícula e
                    empresa, ou mesmo nome e empresa que outro registro já incluído.
                  </p>
                </div>
                <ScrollArea className="max-h-72">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-amber-50/50 dark:bg-amber-900/10">
                          <th className="px-4 py-2 text-left font-medium text-amber-700 dark:text-amber-400">
                            #
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-amber-700 dark:text-amber-400">
                            Nome
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-amber-700 dark:text-amber-400">
                            Empresa
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-amber-700 dark:text-amber-400">
                            Matrícula
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-amber-700 dark:text-amber-400">
                            Cargo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {metadados.duplicatas.map((d, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-amber-200/50 dark:border-amber-800/30 last:border-0"
                          >
                            <td className="px-4 py-2 tabular-nums text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2 font-medium text-foreground">{d.nome}</td>
                            <td className="px-4 py-2 text-muted-foreground">{d.empresa}</td>
                            <td className="px-4 py-2 tabular-nums text-muted-foreground">
                              {d.matricula || "—"}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{d.cargo || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Contagem por empresa */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Funcionários por empresa / setor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-72">
                <div className="divide-y divide-border">
                  {empresasOrdenadas.map(([empresa, qtd], idx) => (
                    <div key={idx} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-foreground">{empresa}</span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                        <Users className="h-3.5 w-3.5" />
                        {qtd.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Preview dos primeiros registros */}
          {ativos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Amostra dos dados lidos
                  <Badge variant="outline" className="ml-auto text-xs font-normal">
                    Primeiros {Math.min(ativos.length, 10)} de{" "}
                    {ativos.length.toLocaleString("pt-BR")}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-64">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                            #
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                            Nome
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                            Empresa
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                            Matrícula
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                            Cargo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ativos.slice(0, 10).map((a, idx) => (
                          <tr key={idx} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2 tabular-nums text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2 font-medium text-foreground">{a.nome}</td>
                            <td className="px-4 py-2 text-muted-foreground">{a.empresa}</td>
                            <td className="px-4 py-2 tabular-nums text-muted-foreground">
                              {a.matricula || "—"}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{a.cargo || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={confirmarImportacao} size="lg">
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Importar {metadados.totalLinhasLidas.toLocaleString("pt-BR")} funcionários
            </Button>
            <Button variant="outline" onClick={resetar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Importando */}
      {etapa === "importando" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Importando para o banco...</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Gravando {ativos.length.toLocaleString("pt-BR")} registros. Aguarde.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Concluído */}
      {etapa === "concluido" && resultado && (
        <Card className="border-chart-2/50">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chart-2/10">
              <CheckCircle2 className="h-8 w-8 text-chart-2" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Importação concluída</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {resultado.importados.toLocaleString("pt-BR")}
                </span>{" "}
                funcionários importados a partir de{" "}
                <span className="font-medium">{nomeArquivo}</span>.
              </p>

              {/* Detalhamento */}
              <div className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm">
                <div className="flex items-center justify-between rounded-md bg-emerald-50 dark:bg-emerald-900/10 px-3 py-1.5">
                  <span className="text-emerald-700 dark:text-emerald-300">Importados</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {resultado.importados.toLocaleString("pt-BR")}
                  </span>
                </div>
                {resultado.atualizados > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-900/10 px-3 py-1.5">
                    <span className="text-blue-700 dark:text-blue-300">Atualizados</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-300">
                      {resultado.atualizados.toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
                {resultado.ignorados > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-amber-50 dark:bg-amber-900/10 px-3 py-1.5">
                    <span className="text-amber-700 dark:text-amber-300">
                      Ignorados (duplicatas)
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {resultado.ignorados.toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
                {resultado.rejeitados > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-1.5">
                    <span className="text-red-700 dark:text-red-300">Rejeitados</span>
                    <span className="font-semibold text-red-700 dark:text-red-300">
                      {resultado.rejeitados.toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
                {metadados && metadados.totalExcluidosPorRegra > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-1.5 dark:bg-slate-800/40">
                    <span className="text-slate-700 dark:text-slate-300">
                      Ignorados (lista de exclusão)
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {metadados.totalExcluidosPorRegra.toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirmação com banco */}
              {totalConfirmadoBanco !== null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Total confirmado no banco:{" "}
                  <span className="font-semibold text-foreground">
                    {totalConfirmadoBanco.toLocaleString("pt-BR")}
                  </span>{" "}
                  funcionários.
                </p>
              )}

              {temDivergencia && (
                <div className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Atenção: o total no banco ({totalConfirmadoBanco?.toLocaleString("pt-BR")})
                    diverge do esperado ({resultado.total.toLocaleString("pt-BR")}). Verifique se
                    houve alteração concorrente.
                  </p>
                </div>
              )}

              {metadados && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {metadados.abasComDados.length} {isPdf ? "página" : "aba"}
                  {metadados.abasComDados.length === 1 ? "" : "s"} lida
                  {metadados.abasComDados.length === 1 ? "" : "s"},{" "}
                  {Object.keys(metadados.contagemPorEmpresa).length} empresa
                  {Object.keys(metadados.contagemPorEmpresa).length === 1 ? "" : "s"} detectada
                  {Object.keys(metadados.contagemPorEmpresa).length === 1 ? "" : "s"}.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                O card Funcionários Ativos foi atualizado automaticamente.
              </p>
            </div>
            <Button onClick={resetar} variant="outline">
              Importar outra planilha
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {etapa === "erro" && (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Erro na importação</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{erro}</p>
            </div>
            <Button onClick={resetar} variant="outline">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
