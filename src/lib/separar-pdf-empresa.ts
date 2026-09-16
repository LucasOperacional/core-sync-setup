/**
 * Separação das folhas de ponto já protocoladas, agrupadas por empresa.
 *
 * Fonte de dados: protocolos salvos no banco (protocolos + protocolo_folhas +
 * protocolo_arquivos) e os PDFs originais guardados no bucket "folhas-pdf".
 * Nada é alterado ou removido — a leitura é somente consulta.
 */
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument } from "pdf-lib";
import { buscarTudoPaginado } from "./supabase-paginacao";

const PAGINA_CONSULTA = 1000;

export type StatusProtocolo = "Protocolado" | "Pendente" | "Cancelado" | "Em audiência";

export type FolhaProtocolada = {
  chave: string;
  protocoloId: string;
  protocoloNumero: string;
  dataProtocolo: string;
  competencia: string;
  colaborador: string;
  empresa: string;
  empresaIdentificada: boolean;
  cargo: string;
  posto: string;
  matricula: string;
  admissao: string;
  ordem: number;
  pagina: number | null;
  arquivo: string | null;
  caminho: string | null;
  status: StatusProtocolo;
};

export type GrupoEmpresa = {
  empresa: string;
  competencias: string[];
  folhas: FolhaProtocolada[];
  colaboradores: number;
  paginas: number;
  protocolos: string[];
  alertas: string[];
};

export type Filtros = {
  empresa: string; // "__todas__" = todas as empresas
  competencia: string; // "__todas__"
  colaborador: string;
  posto: string;
  status: StatusProtocolo | "__todos__";
  dataInicio: string;
  dataFim: string;
};

export const TODAS = "__todas__";
export const TODOS = "__todos__";

export const filtrosIniciais: Filtros = {
  empresa: TODAS,
  competencia: TODAS,
  colaborador: "",
  posto: TODAS,
  status: "Protocolado",
  dataInicio: "",
  dataFim: "",
};

const POSTOS_AUDIENCIA = new Set(["AUDIENCIA", "AUDIÊNCIA", "EM AUDIENCIA", "EM AUDIÊNCIA"]);

function limpar(valor?: string | null): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

/** Nome de arquivo comparável (sem acentos, caixa ou espaços extras). */
function nomeComparavel(valor?: string | null): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, "")
    .trim();
}

function empresaValida(empresa: string): boolean {
  if (!empresa) return false;
  return !/n[ãa]o\s+identific/i.test(empresa) && !/^sem\s+empresa$/i.test(empresa);
}

/** Competência no formato MM-AAAA a partir de uma data ISO. */
export function competenciaDe(iso?: string | null): string {
  if (!iso) return "sem-competencia";
  const data = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(data.getTime())) return "sem-competencia";
  return `${String(data.getMonth() + 1).padStart(2, "0")}-${data.getFullYear()}`;
}

function statusDoProtocolo(texto: string, posto: string): StatusProtocolo {
  if (POSTOS_AUDIENCIA.has(posto.toUpperCase())) return "Em audiência";
  if (/cancelad/i.test(texto)) return "Cancelado";
  if (/\bpendente\b|falta\s+protocolar/i.test(texto)) return "Pendente";
  return "Protocolado";
}

/** Lê todas as folhas dos protocolos salvos e resolve o PDF de origem de cada uma. */
export async function carregarFolhasProtocoladas(
  onProgresso?: (mensagem: string) => void,
): Promise<{ folhas: FolhaProtocolada[]; totalProtocolos: number }> {
  onProgresso?.("Consultando os protocolos salvos...");
  const protocolos = await buscarTudoPaginado<{
    id: string;
    titulo: string;
    empresa: string | null;
    observacoes: string | null;
    data_entrega: string | null;
    created_at: string;
  }>((inicio, fim) =>
    supabase
      .from("protocolos")
      .select("id, titulo, empresa, observacoes, data_entrega, created_at")
      .order("created_at", { ascending: false })
      .range(inicio, fim),
  );

  const infoProtocolo = new Map(
    (protocolos ?? []).map((p) => [
      p.id,
      {
        numero: limpar(p.titulo) || "Protocolo",
        empresa: limpar(p.empresa),
        texto: `${p.titulo ?? ""} ${p.observacoes ?? ""}`,
        data: (p.data_entrega as string | null) ?? (p.created_at as string),
      },
    ]),
  );

  onProgresso?.("Lendo as folhas de ponto protocoladas...");
  type Linha = {
    protocolo_id: string;
    colaborador: string;
    empresa: string;
    cargo: string;
    posto: string;
    matricula: string;
    admissao: string | null;
    pagina: number | null;
    arquivo: string | null;
    ordem: number;
  };
  const linhas: Linha[] = [];
  for (let inicio = 0; ; inicio += PAGINA_CONSULTA) {
    const { data, error } = await supabase
      .from("protocolo_folhas")
      .select(
        "protocolo_id, colaborador, empresa, cargo, posto, matricula, admissao, pagina, arquivo, ordem",
      )
      .order("protocolo_id", { ascending: true })
      .order("ordem", { ascending: true })
      .range(inicio, inicio + PAGINA_CONSULTA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as Linha[];
    linhas.push(...lote);
    if (lote.length < PAGINA_CONSULTA) break;
  }

  onProgresso?.("Localizando os PDFs guardados no banco...");
  const arquivos = await buscarTudoPaginado<{
    protocolo_id: string;
    nome: string;
    caminho: string;
  }>((inicio, fim) =>
    supabase
      .from("protocolo_arquivos")
      .select("protocolo_id, nome, caminho")
      .order("protocolo_id", { ascending: true })
      .range(inicio, fim),
  );

  const porProtocolo = new Map<string, Array<{ nome: string; caminho: string }>>();
  for (const a of arquivos ?? []) {
    const lista = porProtocolo.get(a.protocolo_id) ?? [];
    lista.push({ nome: a.nome, caminho: a.caminho });
    porProtocolo.set(a.protocolo_id, lista);
  }

  const vistas = new Set<string>();
  const folhas: FolhaProtocolada[] = [];
  for (const l of linhas) {
    const info = infoProtocolo.get(l.protocolo_id);
    if (!info) continue; // sem protocolo salvo: não entra na separação

    const doProtocolo = porProtocolo.get(l.protocolo_id) ?? [];
    let caminho: string | null = null;
    if (doProtocolo.length) {
      const alvo = nomeComparavel(l.arquivo);
      const exato = alvo
        ? doProtocolo.find(
            (a) =>
              nomeComparavel(a.nome) === alvo ||
              nomeComparavel(a.caminho.split("/").pop() ?? "") === alvo,
          )
        : undefined;
      // Sem correspondência exata, usa o PDF do próprio protocolo salvo.
      caminho = exato?.caminho ?? doProtocolo[0]!.caminho;
    }

    const posto = limpar(l.posto);
    const empresa = limpar(l.empresa) || info.empresa;
    const matricula = limpar(l.matricula);
    const colaborador = limpar(l.colaborador);
    const competencia = competenciaDe(info.data);

    // Evita páginas e protocolos duplicados na separação.
    const chave = [
      empresa.toUpperCase(),
      matricula.toUpperCase() || colaborador.toUpperCase(),
      caminho ?? "sem-pdf",
      l.pagina ?? 0,
      competencia,
    ].join("|");
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    folhas.push({
      chave,
      protocoloId: l.protocolo_id,
      protocoloNumero: info.numero,
      dataProtocolo: info.data,
      competencia,
      colaborador: colaborador || "Não identificado",
      empresa: empresaValida(empresa) ? empresa : "Empresa não identificada",
      empresaIdentificada: empresaValida(empresa),
      cargo: limpar(l.cargo),
      posto,
      matricula,
      admissao: limpar(l.admissao),
      ordem: l.ordem,
      pagina: l.pagina,
      arquivo: l.arquivo,
      caminho,
      status: statusDoProtocolo(info.texto, posto),
    });
  }

  return { folhas, totalProtocolos: protocolos?.length ?? 0 };
}

function soData(iso: string): string {
  return iso.length <= 10 ? iso : iso.slice(0, 10);
}

export function aplicarFiltros(folhas: FolhaProtocolada[], f: Filtros): FolhaProtocolada[] {
  const busca = f.colaborador.trim().toLowerCase();
  return folhas.filter((folha) => {
    if (f.status !== TODOS && folha.status !== f.status) return false;
    if (f.empresa !== TODAS && folha.empresa !== f.empresa) return false;
    if (f.competencia !== TODAS && folha.competencia !== f.competencia) return false;
    if (f.posto !== TODAS && (folha.posto || "Sem posto") !== f.posto) return false;
    if (busca) {
      const alvo = `${folha.colaborador} ${folha.matricula}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    const data = soData(folha.dataProtocolo);
    if (f.dataInicio && data < f.dataInicio) return false;
    if (f.dataFim && data > f.dataFim) return false;
    return true;
  });
}

/** Agrupa as folhas por empresa, somente as que têm empresa identificada. */
export function agruparPorEmpresa(folhas: FolhaProtocolada[]): GrupoEmpresa[] {
  const mapa = new Map<string, FolhaProtocolada[]>();
  for (const f of folhas) {
    if (!f.empresaIdentificada) continue;
    const lista = mapa.get(f.empresa) ?? [];
    lista.push(f);
    mapa.set(f.empresa, lista);
  }

  return Array.from(mapa.entries())
    .map(([empresa, lista]) => {
      const paginas = lista.filter((f) => f.caminho && f.pagina && f.pagina > 0).length;
      const semPdf = lista.length - paginas;
      const alertas: string[] = [];
      if (semPdf > 0) {
        alertas.push(`${semPdf} folha(s) sem o PDF original disponível no protocolo salvo.`);
      }
      const semMatricula = lista.filter((f) => !f.matricula).length;
      if (semMatricula > 0) alertas.push(`${semMatricula} folha(s) sem matrícula informada.`);
      const semCompetencia = lista.filter((f) => f.competencia === "sem-competencia").length;
      if (semCompetencia > 0) {
        alertas.push(`${semCompetencia} folha(s) sem competência identificada.`);
      }
      return {
        empresa,
        competencias: Array.from(new Set(lista.map((f) => f.competencia))).sort(),
        folhas: lista,
        colaboradores: new Set(lista.map((f) => f.matricula || f.colaborador)).size,
        paginas,
        protocolos: Array.from(new Set(lista.map((f) => f.protocoloNumero))).sort(),
        alertas,
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
}

export function pendenciasDeIdentificacao(folhas: FolhaProtocolada[]): FolhaProtocolada[] {
  return folhas.filter((f) => !f.empresaIdentificada);
}

/** Nome do arquivo final: Folhas_de_Ponto_Protocoladas_[EMPRESA]_[COMPETENCIA].pdf */
export function nomeArquivoEmpresa(empresa: string, competencia: string): string {
  const emp =
    empresa
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "") || "EMPRESA";
  const comp = competencia.replace(/[^0-9-]/g, "") || "SEM_COMPETENCIA";
  return `Folhas_de_Ponto_Protocoladas_${emp}_${comp}.pdf`;
}

/** Baixa os PDFs originais informados e mantém em cache na memória. */
export async function carregarPdfsOriginais(
  caminhos: Set<string>,
  onProgresso?: (mensagem: string) => void,
): Promise<Map<string, PDFDocument>> {
  const cache = new Map<string, PDFDocument>();
  let i = 0;
  for (const caminho of caminhos) {
    i += 1;
    onProgresso?.(`Baixando PDF ${i}/${caminhos.size} dos protocolos salvos...`);
    const { data, error } = await supabase.storage.from("folhas-pdf").download(caminho);
    if (error || !data) continue;
    try {
      cache.set(
        caminho,
        await PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true }),
      );
    } catch {
      /* PDF inválido: ignorado */
    }
  }
  return cache;
}

export type ResultadoEmpresa = {
  empresa: string;
  competencia: string;
  nomeArquivo: string;
  bytes: Uint8Array;
  paginas: number;
  colaboradores: number;
};

/**
 * Monta o PDF da empresa copiando as páginas originais, preservando ordem,
 * orientação, resolução e assinaturas do documento de origem.
 */
export async function montarPdfDaEmpresa(
  grupo: GrupoEmpresa,
  cache: Map<string, PDFDocument>,
): Promise<ResultadoEmpresa | null> {
  const destino = await PDFDocument.create();
  const incluidas = new Set<string>();
  const colaboradores = new Set<string>();
  let paginas = 0;

  for (const f of grupo.folhas) {
    if (!f.caminho || !f.pagina || f.pagina < 1) continue;
    const marca = `${f.caminho}#${f.pagina}`;
    if (incluidas.has(marca)) continue; // não duplica páginas
    const origem = cache.get(f.caminho);
    if (!origem) continue;
    const indice = f.pagina - 1;
    if (indice >= origem.getPageCount()) continue;
    const [pagina] = await destino.copyPages(origem, [indice]);
    destino.addPage(pagina!);
    incluidas.add(marca);
    colaboradores.add(f.matricula || f.colaborador);
    paginas += 1;
  }

  if (!paginas) return null;
  const competencia = grupo.competencias[0] ?? "sem-competencia";
  return {
    empresa: grupo.empresa,
    competencia,
    nomeArquivo: nomeArquivoEmpresa(grupo.empresa, competencia),
    bytes: await destino.save(),
    paginas,
    colaboradores: colaboradores.size,
  };
}
