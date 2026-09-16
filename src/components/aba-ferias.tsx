import { useState, useRef, useEffect, useMemo } from "react";
import {
  Palmtree,
  Upload,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  X,
  FileText,
  RefreshCw,
  Bell,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cadastrarAusenciaNexti, pesquisarColaboradoresNexti } from "@/lib/nexti-ativos.functions";
import { callNexti } from "@/lib/nexti.functions";
import { listarEmpresasNexti, type EmpresaNexti } from "@/lib/nexti-empresas.functions";

import { chaveNome, listarFlagsFerias, type FlagUsuarioFerias } from "@/lib/ferias-usuarios";
import { useQueryClient } from "@tanstack/react-query";
import { definirPermiteMobile } from "@/lib/permite-mobile.functions";

interface LogEntry {
  id: string;
  time: string;
  message: string;
  status: "success" | "error" | "info";
}

interface FeriasTemplate {
  nome: string;
  empresaId: number | null;
  empresaNome: string;
  dias: number;
  dataInicio: string;
  dataFim: string;
  observacao: string;
  enviarAviso?: boolean;
  mensagemAviso?: string;
  /** Onde a mensagem é entregue: avisos da NEXTI, lançamento de férias ou os dois. */
  canalEnvio?: CanalEnvio;
}

/** Canais de entrega da mensagem no momento do lançamento. */
export type CanalEnvio = "ambos" | "aviso" | "ferias";

const TEMPLATE_STORAGE_KEY = "ferias-template";
const DEFAULT_MENSAGEM_AVISO =
  "Prezado(a) colaborador(a), suas férias foram cadastradas para o período de {inicio} a {fim}. Favor ficar atento às orientações do setor de RH.";

function normalizarTemplate(
  valor: Partial<FeriasTemplate> | null | undefined,
): FeriasTemplate | null {
  if (!valor || typeof valor.dias !== "number") return null;
  const nome = String(valor.nome ?? "").trim();
  return {
    nome,
    empresaId:
      typeof valor.empresaId === "number" && Number.isFinite(valor.empresaId)
        ? valor.empresaId
        : null,
    empresaNome: String(valor.empresaNome ?? nome),
    dias: valor.dias,
    dataInicio: String(valor.dataInicio ?? ""),
    dataFim: String(valor.dataFim ?? ""),
    observacao: String(valor.observacao ?? ""),
    enviarAviso: valor.enviarAviso ?? true,
    mensagemAviso: String(valor.mensagemAviso ?? DEFAULT_MENSAGEM_AVISO),
    canalEnvio:
      valor.canalEnvio === "aviso" || valor.canalEnvio === "ferias" ? valor.canalEnvio : "ambos",
  };
}

function carregarTemplateSalvo(): FeriasTemplate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    return normalizarTemplate(JSON.parse(raw) as Partial<FeriasTemplate>);
  } catch {
    return null;
  }
}

/** Remove acentos e deixa o texto comparável (empresas, cabeçalhos). */
function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte data de planilha (serial do Excel ou texto dd/mm/aaaa) para aaaa-mm-dd. */
function converterDataYmd(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const d = new Date(Math.round((valor - 25569) * 86400 * 1000));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0] ?? null;
  }
  const texto = String(valor).trim();
  const br = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (br) {
    const dia = (br[1] ?? "").padStart(2, "0");
    const mes = (br[2] ?? "").padStart(2, "0");
    const anoBruto = br[3] ?? "";
    const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
    return `${ano}-${mes}-${dia}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${(iso[2] ?? "").padStart(2, "0")}-${(iso[3] ?? "").padStart(2, "0")}`;
  return null;
}

export function AbaFerias() {
  const queryClient = useQueryClient();
  const [etapa, setEtapa] = useState<"selecionar" | "preview" | "enviando" | "concluido" | "erro">(
    "selecionar",
  );
  const [arquivoNome, setArquivoNome] = useState("");
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any[][]>([]);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);

  // Template de férias (salvo no navegador, sem depender de banco)
  const [template, setTemplate] = useState<FeriasTemplate | null>(() => carregarTemplateSalvo());
  const [templateEmpresaId, setTemplateEmpresaId] = useState<string>(() => {
    const t = carregarTemplateSalvo();
    return t?.empresaId ? String(t.empresaId) : "";
  });
  const [templateNome, setTemplateNome] = useState<string>(
    () => carregarTemplateSalvo()?.nome ?? "",
  );
  const [templateDias, setTemplateDias] = useState<string>(() => {
    const t = carregarTemplateSalvo();
    return t ? String(t.dias) : "30";
  });
  const [templateInicio, setTemplateInicio] = useState<string>(
    () => carregarTemplateSalvo()?.dataInicio ?? "",
  );
  const [templateFim, setTemplateFim] = useState<string>(
    () => carregarTemplateSalvo()?.dataFim ?? "",
  );
  const [templateObservacao, setTemplateObservacao] = useState<string>(
    () => carregarTemplateSalvo()?.observacao ?? "",
  );

  // Envio de Aviso de Férias via API NEXTI (Avisos e Convocações)
  const [enviarAviso, setEnviarAviso] = useState<boolean>(
    () => carregarTemplateSalvo()?.enviarAviso ?? true,
  );
  const [mensagemAviso, setMensagemAviso] = useState<string>(
    () => carregarTemplateSalvo()?.mensagemAviso ?? DEFAULT_MENSAGEM_AVISO,
  );
  const [canalEnvio, setCanalEnvio] = useState<CanalEnvio>(
    () => carregarTemplateSalvo()?.canalEnvio ?? "ambos",
  );
  const [noticeTitle, setNoticeTitle] = useState<string>("Aviso de Férias");
  const [noticePriority, setNoticePriority] = useState<string>("NORMAL");
  const [reqRead, setReqRead] = useState<boolean>(false);
  const [reqAccept, setReqAccept] = useState<boolean>(false);
  const [reqSign, setReqSign] = useState<boolean>(false);

  // Empresas cadastradas na NEXTI (nome do template)
  const [empresas, setEmpresas] = useState<EmpresaNexti[]>([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [empresasErro, setEmpresasErro] = useState<string | null>(null);

  const carregarEmpresas = async (silencioso = false) => {
    setCarregandoEmpresas(true);
    if (!silencioso) setEmpresasErro(null);
    try {
      const res = await listarEmpresasNexti();
      if (res.ok) {
        setEmpresas(res.empresas);
        setEmpresasErro(null);
        setTemplateEmpresaId(
          (atual) => atual || (res.empresas[0] ? String(res.empresas[0].id) : ""),
        );
        if (res.empresas[0] && !templateNome) setTemplateNome(res.empresas[0].nome);
        if (!silencioso) {
          toast.success(`${res.empresas.length} empresa(s) carregada(s) da NEXTI.`);
        }
      } else {
        const msg = res.erro ?? "Não foi possível carregar as empresas da NEXTI.";
        setEmpresasErro(msg);
        if (!silencioso) toast.error(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao buscar empresas na NEXTI.";
      setEmpresasErro(msg);
      if (!silencioso) toast.error(msg);
    } finally {
      setCarregandoEmpresas(false);
    }
  };

  useEffect(() => {
    void carregarEmpresas(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarEmpresaNoTemplate = (valor: string) => {
    setTemplateEmpresaId(valor);
    const encontrada = empresas.find((e) => String(e.id) === valor);
    if (encontrada) setTemplateNome(encontrada.nome);
  };

  const salvarTemplate = () => {
    const dias = parseInt(templateDias, 10);
    const empresaId = templateEmpresaId ? Number(templateEmpresaId) : null;
    const empresaNome =
      empresas.find((e) => String(e.id) === templateEmpresaId)?.nome || templateNome.trim();

    if (!empresaNome) {
      toast.error("Selecione a empresa (nome do template) cadastrada na NEXTI.");
      return;
    }
    if (Number.isNaN(dias) || dias <= 0) {
      toast.error("Informe uma quantidade de dias válida (maior que zero).");
      return;
    }

    let inicio = templateInicio;
    let fim = templateFim;
    if (inicio && !fim) fim = somarDias(inicio, dias);
    if (inicio && fim && fim < inicio) {
      toast.error("A data de fim não pode ser anterior à data de início.");
      return;
    }
    if (!inicio && fim) inicio = "";

    const novo: FeriasTemplate = {
      nome: empresaNome,
      empresaId: empresaId !== null && Number.isFinite(empresaId) ? empresaId : null,
      empresaNome,
      dias,
      dataInicio: inicio,
      dataFim: fim,
      observacao: templateObservacao.trim(),
      enviarAviso,
      mensagemAviso: mensagemAviso.trim(),
      canalEnvio,
    };
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(novo));
    } catch {
      // Ignora falha de storage e mantém em memória
    }
    setTemplate(novo);
    setTemplateNome(empresaNome);
    setTemplateInicio(inicio);
    setTemplateFim(fim);
    toast.success(`Template "${novo.nome}" salvo com sucesso.`);
  };

  const limparTemplate = () => {
    try {
      window.localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    } catch {
      // Ignora falha de storage
    }
    setTemplate(null);
    setTemplateEmpresaId("");
    setTemplateNome("");
    setTemplateDias("30");
    setTemplateInicio("");
    setTemplateFim("");
    setTemplateObservacao("");
    setEnviarAviso(true);
    setMensagemAviso(DEFAULT_MENSAGEM_AVISO);
    setCanalEnvio("ambos");
    toast.success("Template removido.");
  };

  const somarDias = (dataYmd: string, dias: number): string => {
    const [ano, mes, dia] = dataYmd.split("-").map((n) => parseInt(n, 10));
    if (!ano || !mes || !dia) return dataYmd;
    const d = new Date(ano, mes - 1, dia);
    d.setDate(d.getDate() + dias);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // Estados para controle de envio em lote e logs
  const [progresso, setProgresso] = useState(0);
  const [totalItens, setTotalItens] = useState(0);
  const [nomeAtual, setNomeAtual] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const abortRef = useRef<boolean>(false);

  const adicionarLog = (message: string, status: "success" | "error" | "info" = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        time: new Date().toLocaleTimeString(),
        message,
        status,
      },
    ]);
  };

  const processarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivoNome(file.name);

    // Se for PDF, usar ObjectURL para mostrar preview através de iframe
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const fileUrl = URL.createObjectURL(file);
      setPdfPreview(fileUrl);
      setPreviewColumns([]);
      setPreviewData([]);
      setEtapa("preview");
      e.target.value = "";
      return;
    }

    // Se for excel ou csv, vamos ler com SheetJS xlsx
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0]!;
        const ws = wb.Sheets[wsname]!;
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (data.length > 0) {
          const cols = (data[0] || []).map((c) => String(c || ""));
          // Separamos as linhas úteis
          const rows = data.slice(1).filter((r) => r.length > 0);

          setPreviewColumns(cols);
          setPreviewData(rows);
          setPdfPreview(null);
          setEtapa("preview");

          // Puxa do cabeçalho/primeira linha o que o template precisa:
          // dias de férias, data de início, data de fim e empresa.
          const primeiro = (rows[0] ?? []) as any[];
          const idxColuna = (termos: string[]) =>
            cols.findIndex((c) => termos.some((t) => normalizarTexto(c).includes(t)));

          const idxDias = idxColuna(["dias", "quantidade de dias"]);
          const idxInicio = idxColuna(["inicio", "data inicial", "a partir"]);
          const idxFim = idxColuna(["fim", "termino", "data final"]);
          const idxEmpresa = idxColuna(["empresa", "company", "cliente"]);

          const achados: string[] = [];

          const diasLido = idxDias >= 0 ? parseInt(String(primeiro[idxDias] ?? ""), 10) : NaN;
          if (Number.isFinite(diasLido) && diasLido > 0) {
            setTemplateDias(String(diasLido));
            achados.push(`${diasLido} dias`);
          }

          const inicioLido = idxInicio >= 0 ? converterDataYmd(primeiro[idxInicio]) : null;
          if (inicioLido) {
            setTemplateInicio(inicioLido);
            achados.push(`início ${inicioLido}`);
          }

          const fimLido = idxFim >= 0 ? converterDataYmd(primeiro[idxFim]) : null;
          if (fimLido) {
            setTemplateFim(fimLido);
            achados.push(`fim ${fimLido}`);
          } else if (inicioLido && Number.isFinite(diasLido) && diasLido > 0) {
            const fimCalculado = somarDias(inicioLido, diasLido);
            setTemplateFim(fimCalculado);
            achados.push(`fim calculado ${fimCalculado}`);
          }

          const empresaLida = idxEmpresa >= 0 ? String(primeiro[idxEmpresa] ?? "").trim() : "";
          if (empresaLida) {
            const alvo = normalizarTexto(empresaLida);
            const encontrada =
              empresas.find((e) => normalizarTexto(e.nome) === alvo) ??
              empresas.find((e) => {
                const nome = normalizarTexto(e.nome);
                return nome.includes(alvo) || alvo.includes(nome);
              });
            if (encontrada) {
              setTemplateEmpresaId(String(encontrada.id));
              setTemplateNome(encontrada.nome);
              achados.push(`empresa ${encontrada.nome}`);
            } else {
              setTemplateNome(empresaLida);
              achados.push(`empresa ${empresaLida}`);
            }
          }

          if (achados.length > 0) {
            toast.success(`Planilha lida — aplicado ao template: ${achados.join(" · ")}.`);
          }
        } else {
          toast.error("A planilha parece estar vazia.");
        }
      } catch (err) {
        toast.error("Erro ao ler o arquivo. Certifique-se de ser um .xlsx ou .csv válido.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const confirmarEnvio = async () => {
    setEtapa("enviando");
    setLogs([]);
    abortRef.current = false;

    if (pdfPreview) {
      adicionarLog("Iniciando envio de arquivo PDF de férias...", "info");
      setTimeout(() => {
        if (abortRef.current) return;
        setEtapa("concluido");
        adicionarLog("Arquivo PDF de férias transmitido com sucesso.", "success");
        if (pdfPreview) {
          URL.revokeObjectURL(pdfPreview);
          setPdfPreview(null);
        }
        toast.success("Arquivo PDF de férias transmitido com sucesso.");
      }, 2500);
      return;
    }

    const canalAviso = canalEnvio === "ambos" || canalEnvio === "aviso";
    const canalFerias = canalEnvio === "ambos" || canalEnvio === "ferias";

    // Ajustes por pessoa (módulo de usuários) — se falhar, segue com o padrão.
    let mapaFlags = new Map<string, FlagUsuarioFerias>();
    try {
      const flags = await listarFlagsFerias();
      mapaFlags = new Map(flags.map((f) => [f.nomeChave, f]));
      if (flags.length > 0) {
        adicionarLog(`${flags.length} colaborador(es) com ajustes próprios carregados.`, "info");
      }
    } catch {
      adicionarLog(
        "Não foi possível carregar os ajustes por colaborador. Usando o padrão.",
        "error",
      );
    }

    if (previewData.length > 0) {
      setTotalItens(previewData.length);
      setProgresso(0);
      adicionarLog(
        `Iniciando transmissão de ${previewData.length} registros (intervalo de 60s)...`,
        "info",
      );

      // Envio 1 a 1 com intervalo de 60 segundos via API
      for (let i = 0; i < previewData.length; i++) {
        if (abortRef.current) break;

        const row = (previewData[i] ?? []) as any[];
        // Resgata a primeira coluna como 'nome'
        const nome = row[0] ? String(row[0]) : `Registro ${i + 1}`;
        setNomeAtual(nome);
        setProgresso(i + 1);

        const flag = mapaFlags.get(chaveNome(nome));
        const deveLancar = flag?.lancarFerias ?? true;
        const deveAvisar = canalAviso && enviarAviso && (flag?.enviarAviso ?? true);
        const mensagemNasFerias = canalFerias && (flag?.enviarFerias ?? true);

        if (!deveLancar && !deveAvisar) {
          adicionarLog(`'${nome}' está desligado no módulo de usuários. Pulado.`, "info");
          continue;
        }

        adicionarLog(
          `[${i + 1}/${previewData.length}] Processando ${deveLancar ? "AUSÊNCIA DE FÉRIAS" : "somente AVISO"} de: ${nome}`,
          "info",
        );

        try {
          // 1. Verificação de status na NEXTI
          const resVerifica = await pesquisarColaboradoresNexti({ data: { termo: nome } });

          if (!resVerifica.ok) {
            adicionarLog(`Falha ao buscar colaborador '${nome}': ${resVerifica.erro}`, "error");
          } else if (resVerifica.colaboradores.length === 0) {
            adicionarLog(
              `Colaborador '${nome}' não encontrado ou não está em situação TRABALHANDO. Lançamento pulado.`,
              "error",
            );
          } else {
            const colab = resVerifica.colaboradores[0]!;
            adicionarLog(
              `Situação confirmada (TRABALHANDO). Matrícula ${colab.matricula} - ${colab.empresa}. Cadastrando ausência...`,
              "success",
            );

            // 2. Cadastro da ausência na NEXTI
            const hojeStr = new Date().toISOString().split("T")[0]!;
            let dtInicio = hojeStr;
            let dtFim = hojeStr;

            const idxInicio = previewColumns.findIndex(
              (c: any) =>
                String(c).toLowerCase().includes("início") ||
                String(c).toLowerCase().includes("inicio") ||
                String(c).toLowerCase().includes("start"),
            );
            const idxFim = previewColumns.findIndex(
              (c: any) =>
                String(c).toLowerCase().includes("fim") || String(c).toLowerCase().includes("end"),
            );

            const formatarDataExcel = (val: any) => {
              if (!val) return null;
              if (typeof val === "number") {
                const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                return date.toISOString().split("T")[0];
              }
              if (typeof val === "string") {
                const regexBR = /^(\d{2})[/\-](\d{2})[/\-](\d{4})$/;
                const parts = val.match(regexBR);
                if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
                if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
              }
              return null;
            };

            if (idxInicio >= 0) dtInicio = formatarDataExcel(row[idxInicio]) || hojeStr;
            if (idxFim >= 0) dtFim = formatarDataExcel(row[idxFim]) || dtInicio;

            if (template) {
              const temInicio = idxInicio >= 0 && Boolean(formatarDataExcel(row[idxInicio]));
              const temFim = idxFim >= 0 && Boolean(formatarDataExcel(row[idxFim]));
              if (!temInicio && template.dataInicio) dtInicio = template.dataInicio;
              if (!temFim) dtFim = template.dataFim || somarDias(dtInicio, template.dias);
              adicionarLog(
                `Template "${template.nome}"${template.empresaNome ? ` - empresa ${template.empresaNome}` : ""} aplicado: ${dtInicio} a ${dtFim}.`,
                "info",
              );
            }

            // Ajustes próprios da pessoa têm prioridade sobre o template.
            if (flag?.dataInicio) dtInicio = flag.dataInicio;
            if (flag?.dataFim) dtFim = flag.dataFim;
            else if (flag?.dataInicio && flag.dias) dtFim = somarDias(flag.dataInicio, flag.dias);
            else if (flag?.dias && !flag.dataFim) dtFim = somarDias(dtInicio, flag.dias);
            if (flag) {
              adicionarLog(
                `Ajuste individual aplicado a '${nome}': ${dtInicio} a ${dtFim}.`,
                "info",
              );
            }

            const mensagemPessoal = (
              flag?.observacao?.trim() ||
              mensagemAviso.trim() ||
              DEFAULT_MENSAGEM_AVISO
            )
              .replace(/{inicio}/g, dtInicio)
              .replace(/{fim}/g, dtFim)
              .replace(/{nome}/g, nome);

            // Com o canal "Férias" a mensagem vai junto do lançamento; senão vale a observação do template.
            const detalhesLinha = mensagemNasFerias
              ? mensagemPessoal.substring(0, 480)
              : (template?.observacao ? template.observacao.trim() : "") ||
                row.filter(Boolean).join(" | ").substring(0, 250);

            if (!colab.matricula) {
              adicionarLog(
                `Colaborador '${nome}' sem matrícula configurada. Requisição bloqueada.`,
                "error",
              );
              continue;
            }

            if (deveLancar) {
              adicionarLog(`Tentando registrar período: ${dtInicio} a ${dtFim}`, "info");
            } else {
              adicionarLog(
                `'${nome}' está marcado para receber apenas o aviso — lançamento de férias não será feito.`,
                "info",
              );
            }

            const resCadastro = deveLancar
              ? await cadastrarAusenciaNexti({
                  data: {
                    personId: colab.personId,
                    personExternalId: colab.personExternalId,
                    inicio: dtInicio,
                    fim: dtFim,
                    observacao: detalhesLinha || "Férias programadas via sistema",
                  },
                })
              : null;

            const cadastroOk =
              !deveLancar ||
              Boolean(
                resCadastro?.ok &&
                resCadastro.httpStatus &&
                resCadastro.httpStatus >= 200 &&
                resCadastro.httpStatus < 300,
              );

            if (cadastroOk) {
              if (deveLancar) {
                adicionarLog(
                  `Ausência (Férias) lançada com sucesso para '${nome}' no período (${dtInicio} a ${dtFim})${mensagemNasFerias ? " com a mensagem anexada ao lançamento" : ""}.`,
                  "success",
                );

                // Desliga automaticamente a flag "Permite marcação mobile" do colaborador na NEXTI
                // assim que a ausência (Férias) é enviada para lançamento.
                try {
                  const resMobile = await definirPermiteMobile({
                    data: { personId: colab.personId, permitir: false },
                  });
                  if (resMobile.ok) {
                    adicionarLog(
                      `Flag 'Permite marcação mobile' desligada automaticamente para '${nome}'.`,
                      "success",
                    );
                  } else {
                    adicionarLog(
                      `Não foi possível desligar a flag 'Permite marcação mobile' de '${nome}'. ${resMobile.erro || ""}`,
                      "error",
                    );
                  }
                } catch {
                  adicionarLog(
                    `Não foi possível desligar a flag 'Permite marcação mobile' de '${nome}'.`,
                    "error",
                  );
                }
              }

              // 3. Envio de Notificação / Aviso de Férias via API NEXTI (Direto via Backend Configurado)
              if (deveAvisar) {
                adicionarLog(`Preparando CONVOCAÇÃO para '${nome}' via API NEXTI...`, "info");

                const msgTexto = mensagemPessoal;

                try {
                  // Entrega oficial pelo módulo AVISO / CONVOCAÇÕES da NEXTI (POST /api/notices).
                  // noticeTypeId 1 = Aviso, 2 = Convocação.
                  const exigirLeitura = flag?.exigirLeitura ?? reqRead;
                  const exigirAceite = flag?.exigirAceite ?? reqAccept;
                  const exigirAssinatura = flag?.exigirAssinatura ?? reqSign;

                  // A NEXTI espera ddMMyyyyHHmmss.
                  const paraNexti = (iso: string, hora: string) => {
                    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (!m) {
                      const hoje = new Date();
                      const dd = String(hoje.getDate()).padStart(2, "0");
                      const mm = String(hoje.getMonth() + 1).padStart(2, "0");
                      return `${dd}${mm}${hoje.getFullYear()}${hora}`;
                    }
                    return `${m[3]}${m[2]}${m[1]}${hora}`;
                  };

                  const hojeIso = new Date().toISOString().split("T")[0]!;
                  const inicioAviso = paraNexti(hojeIso, "000100");
                  const fimAviso = paraNexti(dtFim >= hojeIso ? dtFim : dtInicio, "235959");

                  const exigencias: string[] = [];
                  if (exigirLeitura) exigencias.push("Confirmação de leitura obrigatória.");
                  if (exigirAceite) exigencias.push("É necessário aceitar este comunicado.");
                  if (exigirAssinatura) exigencias.push("É necessário assinar este comunicado.");

                  const corpoHtml = `<p>${msgTexto.replace(/\n/g, "<br/>")}</p>${
                    exigencias.length ? `<p><b>${exigencias.join(" ")}</b></p>` : ""
                  }`;

                  // Convocação publicada (noticeStatusId 2) — é o status que faz o
                  // comunicado aparecer direto no aplicativo do colaborador.
                  const tituloConvocacao = `CONVOCAÇÃO - ${noticeTitle || "Férias"}`.slice(0, 100);

                  let sucesso = false;
                  let erro = "";
                  let noticeId = "";

                  try {
                    const resAviso = await callNexti({
                      data: {
                        action: "request",
                        method: "POST",
                        endpoint: "/api/notices",
                        body: {
                          name: tituloConvocacao,
                          text: corpoHtml,
                          startDate: inicioAviso,
                          finishDate: fimAviso,
                          noticeTypeId: 2,
                          noticeStatusId: 2,
                          noticeShowId: 1,
                          noticeCollectorId: 1,
                          persons: [colab.personId],
                          ...(colab.personExternalId
                            ? { personsExternalIds: [colab.personExternalId] }
                            : {}),
                        },
                      },
                    });

                    let corpo: any = resAviso.data;
                    if (typeof corpo === "string") {
                      try {
                        corpo = JSON.parse(corpo);
                      } catch {
                        corpo = { message: corpo };
                      }
                    }
                    if (
                      resAviso.ok &&
                      resAviso.httpStatus &&
                      resAviso.httpStatus >= 200 &&
                      resAviso.httpStatus < 300 &&
                      corpo?.id !== 409
                    ) {
                      sucesso = true;
                      noticeId = String(corpo?.value?.id ?? corpo?.id ?? "");
                    } else {
                      const comentarios = Array.isArray(corpo?.comments)
                        ? corpo.comments.join(" ")
                        : "";
                      erro =
                        comentarios ||
                        corpo?.message ||
                        resAviso.error ||
                        resAviso.message ||
                        `Rejeitado (HTTP ${resAviso.httpStatus})`;
                    }
                  } catch (e: any) {
                    erro = e?.message || String(e);
                  }

                  if (sucesso) {
                    adicionarLog(
                      `CONVOCAÇÃO publicada no aplicativo da NEXTI para '${nome}' (comunicado nº ${noticeId}), visível até ${dtFim}.`,
                      "success",
                    );
                  } else {
                    adicionarLog(
                      `Não foi possível entregar a CONVOCAÇÃO para '${nome}'. ${erro || "envio interrompido"}`,
                      "error",
                    );
                  }
                } catch (err: any) {
                  adicionarLog(
                    `Falha crítica na rotina de envio de aviso: ${err.message || String(err)}`,
                    "error",
                  );
                }
              }
            } else {
              const erroDetalhe = resCadastro?.erro || "Erro de validação";
              if (
                erroDetalhe.includes("já existe uma requisição em andamento") ||
                erroDetalhe.includes("Já existe uma solicitação em andamento") ||
                erroDetalhe.includes("409")
              ) {
                adicionarLog(
                  `Lançamento ignorado para '${nome}': Já existe uma solicitação de férias idêntica cadastrada ou em andamento na NEXTI.`,
                  "info",
                );
              } else {
                adicionarLog(
                  `Aviso (NEXTI) => Falha de cadastro. Endpoint: ${resCadastro?.endpoint}. Erro: ${erroDetalhe}`,
                  "error",
                );
              }
            }
          }
        } catch (e) {
          adicionarLog(`Erro interno ao processar ${nome}.`, "error");
        }

        // Aguarda 60 segundos antes de ir para o próximo nome
        if (i < previewData.length - 1) {
          adicionarLog(`Aguardando 60 segundos por regra da API antes do próximo envio...`, "info");
          for (let k = 0; k < 60; k++) {
            if (abortRef.current) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        } else {
          adicionarLog(`Registro final '${nome}' processado com sucesso.`, "success");
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (abortRef.current) return;

      setEtapa("concluido");
      adicionarLog(
        `Transmissão de Férias finalizada. Todos os ${previewData.length} itens processados.`,
        "success",
      );
      toast.success(`Todos os ${previewData.length} registros foram transmitidos com sucesso.`);
    }
  };

  const cancelarEnvio = () => {
    abortRef.current = true;
    adicionarLog("Envio cancelado manualmente pelo usuário.", "error");
    setEtapa("erro");
    toast.error("Envio cancelado pelo usuário.");
  };

  const resetar = () => {
    if (pdfPreview) {
      URL.revokeObjectURL(pdfPreview);
      setPdfPreview(null);
    }
    setEtapa("selecionar");
    setArquivoNome("");
    setPreviewColumns([]);
    setPreviewData([]);
    setProgresso(0);
    setTotalItens(0);
    setNomeAtual("");
    setLogs([]);
  };

  const LogViewer = () => (
    <div className="w-full max-w-2xl mt-8 pt-6 border-t">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Logs de Integração (AUSÊNCIA DE FÉRIAS & AVISO)
      </h4>
      <ScrollArea className="h-[220px] w-full rounded-md border bg-muted/20 p-4">
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhum log registrado na sessão atual.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="text-xs font-mono flex items-start gap-3">
                <span className="text-muted-foreground/60 whitespace-nowrap">[{log.time}]</span>
                <span
                  className={
                    log.status === "success"
                      ? "text-emerald-600 dark:text-emerald-400 font-medium"
                      : log.status === "error"
                        ? "text-destructive font-medium"
                        : "text-foreground"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palmtree className="h-5 w-5 text-primary" />
            Importação e Envio de Férias para API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bloco 1: Template de Férias */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                Cadastrar template de férias
              </h4>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              O nome do template é a empresa cadastrada na NEXTI. Os dias de férias e o período
              (início e fim) são preenchidos automaticamente quando você importa a planilha, e a
              observação é a mensagem que acompanha o lançamento. Fica salvo neste navegador.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Nome do template (empresa NEXTI)
                </label>
                <div className="flex items-center gap-2">
                  <Select
                    value={templateEmpresaId}
                    onValueChange={aplicarEmpresaNoTemplate}
                    disabled={carregandoEmpresas || empresas.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          carregandoEmpresas
                            ? "Carregando empresas da NEXTI..."
                            : "Selecione a empresa"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((empresa) => (
                        <SelectItem key={empresa.id} value={String(empresa.id)}>
                          {empresa.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title="Atualizar empresas da NEXTI"
                    onClick={() => void carregarEmpresas()}
                    disabled={carregandoEmpresas}
                  >
                    {carregandoEmpresas ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {empresasErro ? (
                  <p className="text-[11px] text-destructive">{empresasErro}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {empresas.length > 0
                      ? `${empresas.length} empresa(s) carregada(s) da NEXTI.`
                      : "Carregue as empresas cadastradas na NEXTI."}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Observação (mensagem do lançamento)
                </label>
                <input
                  type="text"
                  value={templateObservacao}
                  onChange={(e) => setTemplateObservacao(e.target.value)}
                  placeholder="Digite a mensagem que vai acompanhar as férias"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>

          {etapa === "selecionar" && (
            <div className="flex flex-col items-center gap-4 py-12 rounded-lg border-2 border-dashed border-border/60 bg-muted/20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileUp className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">Enviar arquivo de Férias</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  Os arquivos selecionados aqui são encaminhados{" "}
                  <b>diretamente para a API da Nexti</b>. Selecione o arquivo (Excel, CSV ou PDF)
                  para visualizar e iniciar a transmissão.
                </p>
              </div>
              <label className="cursor-pointer mt-4">
                <input
                  type="file"
                  accept=".pdf,.csv,.xlsx"
                  className="hidden"
                  onChange={processarArquivo}
                />
                <Button asChild variant="default" size="lg">
                  <span>
                    <Upload className="mr-2 h-5 w-5" />
                    Selecionar Arquivo
                  </span>
                </Button>
              </label>
            </div>
          )}

          {etapa === "preview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-lg font-medium">Pré-visualização do Arquivo</h3>
                  <p className="text-sm text-muted-foreground">
                    Confira os dados antes de confirmar o envio para a API. ({arquivoNome})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={resetar}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button onClick={confirmarEnvio}>
                    Confirmar e Enviar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>

              {pdfPreview ? (
                <div className="h-[500px] w-full rounded-md border bg-muted/20 overflow-hidden">
                  <iframe
                    src={pdfPreview}
                    className="h-full w-full border-0"
                    title="Preview de Férias em PDF"
                  />
                </div>
              ) : previewColumns.length > 0 ? (
                <div className="rounded-md border">
                  <ScrollArea className="h-[400px] w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {previewColumns.map((col, idx) => (
                            <TableHead key={idx} className="whitespace-nowrap font-semibold">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.slice(0, 50).map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {previewColumns.map((_, colIndex) => (
                              <TableCell key={colIndex} className="whitespace-nowrap">
                                {row[colIndex] !== undefined && row[colIndex] !== null
                                  ? String(row[colIndex])
                                  : ""}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="bg-muted/50 p-2 text-center text-xs text-muted-foreground border-t">
                    Mostrando pré-visualização (máx. 50 linhas exibidas de {previewData.length}{" "}
                    registros encontrados).
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  Não há dados para exibir.
                </div>
              )}
            </div>
          )}

          {(etapa === "enviando" || etapa === "concluido" || etapa === "erro") && (
            <div className="flex flex-col items-center gap-4 py-8">
              {etapa === "enviando" && (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-2" />
                  <div className="text-center w-full max-w-md">
                    <p className="text-lg font-semibold text-foreground">
                      Integrando ausências com a Nexti...
                    </p>

                    {totalItens > 0 ? (
                      <div className="mt-6 space-y-3">
                        <p className="text-sm text-foreground">
                          Enviando dados de: <span className="font-bold">{nomeAtual}</span>
                        </p>
                        <Progress
                          value={totalItens > 0 ? (progresso / totalItens) * 100 : 0}
                          className="h-2 w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {progresso} de {totalItens} enviados
                          </span>
                          <span>{Math.round((progresso / totalItens) * 100)}%</span>
                        </div>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 border bg-amber-500/10 rounded px-2 py-1.5 mt-2 inline-block">
                          Regra de segurança ativa: intervalo de 60s entre envios.
                        </p>

                        <div className="pt-4">
                          <Button variant="outline" size="sm" onClick={cancelarEnvio}>
                            <X className="mr-2 h-4 w-4" />
                            Interromper envio
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Transmitindo o arquivo{" "}
                        <span className="font-medium text-foreground">{arquivoNome}</span> via API.
                      </p>
                    )}
                  </div>
                </>
              )}

              {etapa === "concluido" && (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-foreground">Transmissão Finalizada</p>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">
                      Os dados do arquivo{" "}
                      <span className="font-medium text-foreground">{arquivoNome}</span> foram
                      enviados corretamente aos servidores da API.
                    </p>
                  </div>
                </>
              )}

              {etapa === "erro" && (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-foreground">
                      Envio Parcial ou Interrompido
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">
                      A transmissão sofreu uma interrupção. Verifique os logs abaixo para saber onde
                      o processo parou.
                    </p>
                  </div>
                </>
              )}

              {/* LogViewer */}
              <LogViewer />

              {(etapa === "concluido" || etapa === "erro") && (
                <Button onClick={resetar} variant="outline" className="mt-6">
                  Importar outro arquivo de Férias
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
