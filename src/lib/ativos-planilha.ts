import * as XLSX from "xlsx";
import { parsePdfToRows, type ParsedRow } from "@/lib/file-parsers";
import { filtrarFuncionariosExcluidos } from "@/lib/funcionarios-excluidos";

export type AtivoImportado = {
  nome: string;
  empresa: string;
  matricula: string;
  cargo?: string;
};

export type ResultadoEmpresa = {
  empresa: string;
  total: number;
  entregues: AtivoImportado[];
  faltantes: AtivoImportado[];
};

/** Metadados retornados pela leitura da planilha para exibição ao usuário. */
export type MetadadosPlanilha = {
  totalAbas: number;
  abasComDados: string[];
  abasSemDados: string[];
  contagemPorEmpresa: Record<string, number>;
  totalLinhasLidas: number;
  totalLinhasIgnoradas: number;
  /** Quantidade de duplicatas removidas (mesma matrícula+empresa ou mesmo nome+empresa). */
  totalDuplicatasRemovidas: number;
  /** Lista dos registros que foram considerados duplicados e removidos. */
  duplicatas: AtivoImportado[];
  /** Quantidade de registros ignorados por estarem na lista de exclusão. */
  totalExcluidosPorRegra: number;
};

export type ResultadoLeituraPlanilha = {
  ativos: AtivoImportado[];
  metadados: MetadadosPlanilha;
};

/** Normaliza texto para comparação: sem acento, sem pontuação, maiúsculo e espaços colapsados. */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Expanded keyword sets for flexible header detection
// ---------------------------------------------------------------------------

const CHAVES_NOME: string[] = [
  "nome do funcionario",
  "nome funcionario",
  "nome completo",
  "colaborador",
  "funcionario",
  "empregado",
  "nome",
  "nome do colaborador",
  "nome do empregado",
  "nome empregado",
  "profissional",
  "trabalhador",
  "contratado",
  "servidor",
  "prestador",
  "operador",
  "vigilante",
  "agente",
  "nome do profissional",
  "nome do trabalhador",
  "nome do contratado",
  "nome do servidor",
  "nome do prestador",
  "nome do operador",
  "nome do vigilante",
  "nome do agente",
  "nome completo do funcionario",
  "nome completo do colaborador",
  "nome guerra",
  "empregado nome",
  "funcionario nome",
  "colaborador nome",
  "employee name",
  "employee",
  "name",
  "full name",
  "worker",
];

const CHAVES_EMPRESA: string[] = [
  "descricao do setor",
  "setor",
  "empresa",
  "cliente",
  "contrato",
  "razao social",
  "unidade",
  "filial",
  "lotacao",
  "local",
  "local de trabalho",
  "posto de trabalho",
  "base",
  "regional",
  "centro de custo",
  "cc",
  "departamento",
  "depto",
  "dept",
  "area",
  "divisao",
  "gerencia",
  "coordenacao",
  "superintendencia",
  "diretoria",
  "obra",
  "projeto",
  "site",
  "polo",
  "nucleo",
  "estabelecimento",
  "company",
  "sector",
  "unit",
  "branch",
  "location",
  "department",
  "descricao setor",
  "desc setor",
  "nome empresa",
  "nome da empresa",
  "razao",
  "cnpj",
];

const CHAVES_MATRICULA: string[] = [
  "matricula",
  "registro",
  "chapa",
  "codigo",
  "re",
  "id",
  "num",
  "numero",
  "numero do registro",
  "num registro",
  "cod",
  "codigo funcionario",
  "cod funcionario",
  "mat",
  "id funcionario",
  "id colaborador",
  "enrollment",
  "badge",
  "employee id",
  "registration",
  "numero matricula",
  "num matricula",
  "n matricula",
  "cracha",
  "pis",
  "ctps",
];

const CHAVES_CARGO: string[] = [
  "nome da funcao",
  "funcao",
  "cargo",
  "posto",
  "ocupacao",
  "profissao",
  "atividade",
  "funcao exercida",
  "cargo exercido",
  "descricao cargo",
  "descricao funcao",
  "desc funcao",
  "desc cargo",
  "titulo",
  "titulo do cargo",
  "job title",
  "position",
  "role",
  "function",
  "occupation",
  "cbo",
  "nome funcao",
  "especialidade",
  "classe",
  "categoria",
  "nivel",
  "job",
];

// Palavras que indicam linhas de rodapé/resumo a serem ignoradas
const PALAVRAS_IGNORAR_LINHA = [
  "total",
  "subtotal",
  "soma",
  "quantidade",
  "obs:",
  "observacao",
  "nota:",
  "legenda",
  "fonte:",
  "rodape",
  "pagina",
  "page",
  "emitido",
  "gerado",
  "impresso",
  "assinatura",
  "responsavel",
  "elaborado",
  "conferido",
  "aprovado",
  "data:",
  "hora:",
  "relatorio",
  "listagem",
  "planilha",
  "confidencial",
];

/** Normaliza para comparação de cabeçalho */
function normHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Verifica se uma célula de cabeçalho corresponde a alguma chave */
function matchHeader(cell: string, chaves: string[]): boolean {
  const n = normHeader(cell);
  if (!n) return false;
  // Exact match first
  if (chaves.includes(n)) return true;
  // Partial match
  return chaves.some((c) => n.includes(c) || c.includes(n));
}

/** Verifica se um valor parece ser nome de pessoa (heurística) */
function pareceNomePessoa(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.length < 3) return false;
  // Mostly letters and spaces
  const letras = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, "").length;
  if (letras / trimmed.length < 0.7) return false;
  // Has at least one space (nome + sobrenome) or is long enough
  if (trimmed.includes(" ") && trimmed.length >= 5) return true;
  if (trimmed.length >= 10) return true;
  return false;
}

/** Verifica se um valor parece matrícula (número curto ou alfanumérico curto) */
function pareceMatricula(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  // Pure number up to 15 digits
  if (/^\d{1,15}$/.test(trimmed)) return true;
  // Alphanumeric up to 20 chars
  if (/^[A-Za-z0-9.-]{1,20}$/.test(trimmed) && /\d/.test(trimmed)) return true;
  return false;
}

/** Verifica se a linha é rodapé/resumo */
function isLinhaIgnoravel(valores: string[]): boolean {
  const concatenado = valores.join(" ").toLowerCase();
  return PALAVRAS_IGNORAR_LINHA.some((p) => concatenado.startsWith(p) || concatenado.includes(p));
}

/** Verifica se uma string é vazia ou insignificante */
function isVazio(s: string): boolean {
  return s.replace(/[\s\-_.]/g, "").length === 0;
}

// ---------------------------------------------------------------------------
// Deduplication at parse time
// ---------------------------------------------------------------------------

/**
 * Remove duplicatas da lista de ativos importados.
 * Critério principal: mesma matrícula + mesma empresa (normalizado).
 * Critério secundário (sem matrícula): mesmo nome + mesma empresa (normalizado).
 * Retorna a lista sem duplicatas, a quantidade removida e a lista dos registros removidos.
 */
function deduplicarAtivos(ativos: AtivoImportado[]): {
  unicos: AtivoImportado[];
  removidos: number;
  duplicatasRemovidas: AtivoImportado[];
} {
  const vistoMatricula = new Set<string>();
  const vistoNome = new Set<string>();
  const unicos: AtivoImportado[] = [];
  const duplicatasRemovidas: AtivoImportado[] = [];
  let removidos = 0;

  for (const a of ativos) {
    const empresaNorm = normalizar(a.empresa);
    const matriculaTrim = a.matricula.trim();

    // Se tem matrícula, deduplica por matrícula + empresa
    if (matriculaTrim) {
      const chave = `${empresaNorm}|||${matriculaTrim.toUpperCase()}`;
      if (vistoMatricula.has(chave)) {
        removidos++;
        duplicatasRemovidas.push(a);
        continue;
      }
      vistoMatricula.add(chave);
    }

    // Deduplica também por nome + empresa (pega duplicatas sem matrícula e
    // duplicatas com matrículas diferentes mas mesmo nome na mesma empresa)
    const nomeNorm = normalizar(a.nome);
    const chaveNome = `${nomeNorm}|||${empresaNorm}`;
    if (vistoNome.has(chaveNome)) {
      removidos++;
      duplicatasRemovidas.push(a);
      continue;
    }
    vistoNome.add(chaveNome);

    unicos.push(a);
  }

  return { unicos, removidos, duplicatasRemovidas };
}

// ---------------------------------------------------------------------------
// Column mapping strategies
// ---------------------------------------------------------------------------

type ColMap = {
  colNome: number;
  colEmpresa: number;
  colMatricula: number;
  colCargo: number;
};

/** Strategy 1: Match by header keywords */
function mapearPorCabecalho(cabecalho: string[]): ColMap | null {
  let colNome = -1;
  let colEmpresa = -1;
  let colMatricula = -1;
  let colCargo = -1;

  for (let i = 0; i < cabecalho.length; i++) {
    const cell = cabecalho[i] ?? "";
    if (colNome < 0 && matchHeader(cell, CHAVES_NOME)) colNome = i;
    else if (colEmpresa < 0 && matchHeader(cell, CHAVES_EMPRESA)) colEmpresa = i;
    else if (colMatricula < 0 && matchHeader(cell, CHAVES_MATRICULA)) colMatricula = i;
    else if (colCargo < 0 && matchHeader(cell, CHAVES_CARGO)) colCargo = i;
  }

  if (colNome >= 0) return { colNome, colEmpresa, colMatricula, colCargo };
  return null;
}

/** Strategy 2: Analyze content of first N data rows to guess columns */
function mapearPorConteudo(linhas: string[][]): ColMap | null {
  if (linhas.length === 0) return null;

  const numCols = Math.max(...linhas.map((l) => l.length));
  if (numCols === 0) return null;

  // Score each column
  const scores = Array.from({ length: numCols }, () => ({
    nome: 0,
    matricula: 0,
    texto: 0,
    total: 0,
  }));

  const amostra = linhas.slice(0, Math.min(linhas.length, 20));
  for (const linha of amostra) {
    for (let c = 0; c < numCols; c++) {
      const val = (linha[c] ?? "").trim();
      if (!val) continue;
      scores[c]!.total++;
      if (pareceNomePessoa(val)) scores[c]!.nome++;
      if (pareceMatricula(val)) scores[c]!.matricula++;
      if (val.replace(/[^a-zA-ZÀ-ÿ ]/g, "").length > val.length * 0.5) scores[c]!.texto++;
    }
  }

  // Find column with highest "nome" score
  let colNome = -1;
  let maxNome = 0;
  for (let c = 0; c < numCols; c++) {
    const s = scores[c]!;
    if (s.nome > maxNome && s.total >= amostra.length * 0.3) {
      maxNome = s.nome;
      colNome = c;
    }
  }

  if (colNome < 0) return null;

  // Find matrícula column (highest matricula score, not the nome column)
  let colMatricula = -1;
  let maxMat = 0;
  for (let c = 0; c < numCols; c++) {
    if (c === colNome) continue;
    const s = scores[c]!;
    if (s.matricula > maxMat && s.total >= amostra.length * 0.2) {
      maxMat = s.matricula;
      colMatricula = c;
    }
  }

  // Find cargo/empresa among remaining text columns
  let colCargo = -1;
  let colEmpresa = -1;
  const textCols = [];
  for (let c = 0; c < numCols; c++) {
    if (c === colNome || c === colMatricula) continue;
    const s = scores[c]!;
    if (s.texto > amostra.length * 0.3) {
      textCols.push(c);
    }
  }

  if (textCols.length >= 2) {
    colCargo = textCols[0]!;
    colEmpresa = textCols[1]!;
  } else if (textCols.length === 1) {
    colCargo = textCols[0]!;
  }

  return { colNome, colEmpresa, colMatricula, colCargo };
}

/** Strategy 3: Positional fallback (first long-text col = nome) */
function mapearPorPosicao(cabecalho: string[]): ColMap | null {
  if (cabecalho.length === 0) return null;

  // Just assume first text-heavy column is nome
  // Common layouts: Mat | Nome | Cargo | Setor or Nome | Cargo | Setor | Mat
  const colNome = cabecalho.length > 1 ? 1 : 0; // second column is often name
  return {
    colNome,
    colEmpresa: cabecalho.length > 3 ? 3 : -1,
    colMatricula: cabecalho.length > 1 ? 0 : -1,
    colCargo: cabecalho.length > 2 ? 2 : -1,
  };
}

// ---------------------------------------------------------------------------
// Header row finder (improved)
// ---------------------------------------------------------------------------

/** Encontra a linha de cabeçalho: a primeira que contenha uma coluna de nome. */
function acharLinhaCabecalho(matriz: unknown[][]): number {
  const limite = Math.min(matriz.length, 40); // scan more rows
  for (let i = 0; i < limite; i += 1) {
    const celulas = (matriz[i] ?? []).map((c) => String(c ?? "").trim());
    // Check if any cell matches a nome header
    const temNome = celulas.some((c) => c && matchHeader(c, CHAVES_NOME));
    if (temNome) return i;
  }

  // Fallback: look for any row with multiple recognized headers (even without nome)
  for (let i = 0; i < limite; i += 1) {
    const celulas = (matriz[i] ?? []).map((c) => String(c ?? "").trim());
    let matches = 0;
    for (const c of celulas) {
      if (!c) continue;
      if (matchHeader(c, CHAVES_EMPRESA)) matches++;
      if (matchHeader(c, CHAVES_MATRICULA)) matches++;
      if (matchHeader(c, CHAVES_CARGO)) matches++;
    }
    if (matches >= 2) return i;
  }

  return -1;
}

/** Tenta encontrar cabeçalho analisando conteúdo (quando keywords falham) */
function acharCabecalhoPorConteudo(matriz: unknown[][]): number {
  // The header row typically has more non-empty cells than data rows and cells are shorter
  const limite = Math.min(matriz.length, 30);
  let melhorIdx = -1;
  let melhorScore = 0;

  for (let i = 0; i < limite; i++) {
    const row = (matriz[i] ?? []).map((c) => String(c ?? "").trim());
    const nonEmpty = row.filter((c) => c.length > 0);
    if (nonEmpty.length < 2) continue;

    // Score: many non-empty cells, short average length (headers are usually short)
    const avgLen = nonEmpty.reduce((s, c) => s + c.length, 0) / nonEmpty.length;
    // Headers typically < 40 chars average
    if (avgLen > 50) continue;

    // Check if the NEXT row has values that look like data (names, numbers)
    const nextRow = (matriz[i + 1] ?? []).map((c) => String(c ?? "").trim());
    const nextHasNames = nextRow.some((c) => pareceNomePessoa(c));
    const nextHasNumbers = nextRow.some((c) => pareceMatricula(c));

    const score =
      nonEmpty.length * 2 + (nextHasNames ? 10 : 0) + (nextHasNumbers ? 5 : 0) - avgLen * 0.1;
    if (score > melhorScore) {
      melhorScore = score;
      melhorIdx = i;
    }
  }

  return melhorIdx;
}

// ---------------------------------------------------------------------------
// PDF support
// ---------------------------------------------------------------------------

async function lerPdfAtivosComMetadados(arquivo: File): Promise<ResultadoLeituraPlanilha> {
  const rows = await parsePdfToRows(arquivo);
  if (rows.length < 2) {
    throw new Error("O PDF não contém dados suficientes para importação.");
  }

  // Try to find header row by keywords
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    if (row.some((c) => matchHeader(c, CHAVES_NOME))) {
      headerIdx = i;
      break;
    }
    // Check for multiple header matches
    let matches = 0;
    for (const c of row) {
      if (matchHeader(c, CHAVES_EMPRESA)) matches++;
      if (matchHeader(c, CHAVES_MATRICULA)) matches++;
      if (matchHeader(c, CHAVES_CARGO)) matches++;
    }
    if (matches >= 2) {
      headerIdx = i;
      break;
    }
  }

  let colMap: ColMap | null = null;
  let dataStartIdx = 0;

  if (headerIdx >= 0) {
    const cabecalho = rows[headerIdx]!;
    colMap = mapearPorCabecalho(cabecalho);
    dataStartIdx = headerIdx + 1;
  }

  // Fallback: content-based detection
  if (!colMap) {
    const dataRows = rows.slice(dataStartIdx || 1);
    colMap = mapearPorConteudo(dataRows);
    if (!colMap && rows.length > 1) {
      colMap = mapearPorPosicao(rows[0]!);
      dataStartIdx = headerIdx >= 0 ? headerIdx + 1 : 1;
    }
    if (dataStartIdx === 0) dataStartIdx = 1;
  }

  if (!colMap || colMap.colNome < 0) {
    throw new Error(
      "Não foi possível identificar a coluna de nomes no PDF. Verifique se o arquivo contém uma tabela com nomes de funcionários.",
    );
  }

  const ativosBrutos: AtivoImportado[] = [];
  let totalLinhasIgnoradas = 0;
  const nomeArquivo = arquivo.name.replace(/\.pdf$/i, "");

  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i]!;
    const nome = (row[colMap.colNome] ?? "").trim();
    if (!nome || isVazio(nome)) {
      totalLinhasIgnoradas++;
      continue;
    }

    // Skip footer/summary lines
    if (isLinhaIgnoravel(row)) {
      totalLinhasIgnoradas++;
      continue;
    }

    const nomeNorm = normHeader(nome);
    if (CHAVES_NOME.some((k) => nomeNorm === k)) {
      totalLinhasIgnoradas++;
      continue;
    }

    const empresaCol = colMap.colEmpresa >= 0 ? (row[colMap.colEmpresa] ?? "").trim() : "";
    const empresa = empresaCol || nomeArquivo;
    const matricula = colMap.colMatricula >= 0 ? (row[colMap.colMatricula] ?? "").trim() : "";
    const cargo = colMap.colCargo >= 0 ? (row[colMap.colCargo] ?? "").trim() : "";

    ativosBrutos.push({ nome, empresa, matricula, cargo });
  }

  if (!ativosBrutos.length) {
    throw new Error(
      "Nenhum funcionário encontrado no PDF. Verifique se o arquivo contém uma tabela com nomes de funcionários.",
    );
  }

  // Remove os funcionários da lista de exclusão antes de qualquer prévia/contagem.
  const { mantidos, ignorados: totalExcluidosPorRegra } =
    filtrarFuncionariosExcluidos(ativosBrutos);

  // Deduplica antes de devolver ao preview
  const {
    unicos: ativos,
    removidos: totalDuplicatasRemovidas,
    duplicatasRemovidas,
  } = deduplicarAtivos(mantidos);

  // Recalcula contagem por empresa após dedup
  const contagemPorEmpresa: Record<string, number> = {};
  for (const a of ativos) {
    contagemPorEmpresa[a.empresa] = (contagemPorEmpresa[a.empresa] ?? 0) + 1;
  }

  return {
    ativos,
    metadados: {
      totalAbas: 1,
      abasComDados: ["PDF"],
      abasSemDados: [],
      contagemPorEmpresa,
      totalLinhasLidas: ativos.length,
      totalLinhasIgnoradas,
      totalDuplicatasRemovidas,
      duplicatas: duplicatasRemovidas,
      totalExcluidosPorRegra,
    },
  };
}

// ---------------------------------------------------------------------------
// Main reader (Excel/CSV) - improved
// ---------------------------------------------------------------------------

/**
 * Lê CSV ou Excel percorrendo TODAS as abas; o nome da aba identifica a empresa/setor.
 * Retorna os ativos encontrados junto com metadados detalhados da leitura.
 * Agora suporta PDF, detecção flexível de cabeçalho e fallback por conteúdo.
 * A lista retornada já está deduplicada por matrícula+empresa e nome+empresa.
 */
export async function lerPlanilhaAtivosComMetadados(
  arquivo: File,
): Promise<ResultadoLeituraPlanilha> {
  // Route PDF files to dedicated handler
  if (arquivo.name.toLowerCase().endsWith(".pdf")) {
    return lerPdfAtivosComMetadados(arquivo);
  }

  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  if (!workbook.SheetNames.length) throw new Error("A planilha não possui nenhuma aba com dados.");

  const ativosBrutos: AtivoImportado[] = [];
  const abasComDados: string[] = [];
  const abasSemDados: string[] = [];
  let totalLinhasIgnoradas = 0;

  for (const nomeAba of workbook.SheetNames) {
    const sheet = workbook.Sheets[nomeAba];
    if (!sheet) {
      abasSemDados.push(nomeAba);
      continue;
    }
    const empresaDaAba = nomeAba.trim();

    // Lê a aba inteira como matriz para localizar o cabeçalho mesmo com títulos acima dele.
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    // Strategy 1: keyword-based header detection
    let indiceCabecalho = acharLinhaCabecalho(matriz);
    let colMap: ColMap | null = null;

    if (indiceCabecalho >= 0) {
      const cabecalho = (matriz[indiceCabecalho] ?? []).map((c) => String(c ?? "").trim());
      colMap = mapearPorCabecalho(cabecalho);
    }

    // Strategy 2: content-based header + column detection
    if (!colMap) {
      const cabIdx = acharCabecalhoPorConteudo(matriz);
      if (cabIdx >= 0) {
        indiceCabecalho = cabIdx;
        const cabecalho = (matriz[cabIdx] ?? []).map((c) => String(c ?? "").trim());
        colMap = mapearPorCabecalho(cabecalho);
      }
    }

    // Strategy 3: analyze data rows directly
    if (!colMap) {
      const startIdx = indiceCabecalho >= 0 ? indiceCabecalho + 1 : 1;
      const dataRows = matriz
        .slice(startIdx, startIdx + 20)
        .map((row) => (row as unknown[]).map((c) => String(c ?? "").trim()));
      colMap = mapearPorConteudo(dataRows);
      if (colMap && indiceCabecalho < 0) {
        // Try to find where data starts (first row with a name-like value)
        for (let i = 0; i < Math.min(matriz.length, 20); i++) {
          const row = (matriz[i] ?? []) as unknown[];
          const val = String(row[colMap.colNome] ?? "").trim();
          if (pareceNomePessoa(val)) {
            indiceCabecalho = i - 1;
            break;
          }
        }
        if (indiceCabecalho < 0) indiceCabecalho = 0;
      }
    }

    // Strategy 4: positional fallback
    if (!colMap && matriz.length > 1) {
      const firstRow = (matriz[0] ?? []) as unknown[];
      colMap = mapearPorPosicao(firstRow.map((c) => String(c ?? "").trim()));
      if (indiceCabecalho < 0) indiceCabecalho = 0;
    }

    if (!colMap || colMap.colNome < 0) {
      abasSemDados.push(nomeAba);
      continue;
    }

    let encontrouAlguem = false;
    const startRow = indiceCabecalho + 1;

    for (let i = startRow; i < matriz.length; i += 1) {
      const linhaArr = (matriz[i] ?? []) as unknown[];
      const valores = linhaArr.map((c) => String(c ?? "").trim());

      const nome = (valores[colMap.colNome] ?? "").trim();
      if (!nome || isVazio(nome)) {
        totalLinhasIgnoradas += 1;
        continue;
      }

      // Skip footer/summary lines
      if (isLinhaIgnoravel(valores)) {
        totalLinhasIgnoradas += 1;
        continue;
      }

      const nomeNorm = normHeader(nome);
      // ignora repetições do próprio cabeçalho no meio da planilha
      if (CHAVES_NOME.some((k) => nomeNorm === k)) {
        totalLinhasIgnoradas += 1;
        continue;
      }

      // Skip values that are clearly not names (pure numbers, very short)
      if (/^\d+([.,]\d+)?$/.test(nome.trim())) {
        totalLinhasIgnoradas += 1;
        continue;
      }
      if (nome.trim().length <= 2) {
        totalLinhasIgnoradas += 1;
        continue;
      }

      const empresaColuna = colMap.colEmpresa >= 0 ? (valores[colMap.colEmpresa] ?? "").trim() : "";
      const empresaFinal = empresaColuna || empresaDaAba;
      const matricula = colMap.colMatricula >= 0 ? (valores[colMap.colMatricula] ?? "").trim() : "";
      const cargo = colMap.colCargo >= 0 ? (valores[colMap.colCargo] ?? "").trim() : "";

      ativosBrutos.push({
        nome,
        empresa: empresaFinal,
        matricula,
        cargo,
      });
      encontrouAlguem = true;
    }

    if (encontrouAlguem) {
      abasComDados.push(nomeAba);
    } else {
      abasSemDados.push(nomeAba);
    }
  }

  if (!ativosBrutos.length) {
    throw new Error(
      "Nenhum funcionário encontrado em nenhuma aba. Verifique se a planilha possui colunas com nomes de funcionários (ex: NOME DO FUNCIONÁRIO, COLABORADOR, NOME COMPLETO, etc.).",
    );
  }

  // Remove os funcionários da lista de exclusão antes de qualquer prévia/contagem.
  const { mantidos, ignorados: totalExcluidosPorRegra } =
    filtrarFuncionariosExcluidos(ativosBrutos);

  // Deduplica antes de devolver ao preview — garante que preview = banco
  const {
    unicos: ativos,
    removidos: totalDuplicatasRemovidas,
    duplicatasRemovidas,
  } = deduplicarAtivos(mantidos);

  // Recalcula contagem por empresa após dedup
  const contagemPorEmpresa: Record<string, number> = {};
  for (const a of ativos) {
    contagemPorEmpresa[a.empresa] = (contagemPorEmpresa[a.empresa] ?? 0) + 1;
  }

  return {
    ativos,
    metadados: {
      totalAbas: workbook.SheetNames.length,
      abasComDados,
      abasSemDados,
      contagemPorEmpresa,
      totalLinhasLidas: ativos.length,
      totalLinhasIgnoradas,
      totalDuplicatasRemovidas,
      duplicatas: duplicatasRemovidas,
      totalExcluidosPorRegra,
    },
  };
}

/** Lê CSV ou Excel percorrendo TODAS as abas (compat — retorna apenas os ativos). */
export async function lerPlanilhaAtivos(arquivo: File): Promise<AtivoImportado[]> {
  const resultado = await lerPlanilhaAtivosComMetadados(arquivo);
  return resultado.ativos;
}

/** Compara os ativos importados com as folhas já protocoladas, agrupando por empresa. */
export function compararAtivos(
  ativos: AtivoImportado[],
  folhasProtocoladas: { colaborador: string; empresa: string }[],
): ResultadoEmpresa[] {
  const protocoladosPorEmpresa = new Map<string, Set<string>>();
  const protocoladosGlobais = new Set<string>();

  for (const folha of folhasProtocoladas) {
    const nome = normalizar(folha.colaborador);
    if (!nome) continue;
    protocoladosGlobais.add(nome);
    const empresa = normalizar(folha.empresa);
    const set = protocoladosPorEmpresa.get(empresa) ?? new Set<string>();
    set.add(nome);
    protocoladosPorEmpresa.set(empresa, set);
  }

  const grupos = new Map<string, AtivoImportado[]>();
  for (const ativo of ativos) {
    const chave = ativo.empresa;
    const lista = grupos.get(chave) ?? [];
    lista.push(ativo);
    grupos.set(chave, lista);
  }

  return Array.from(grupos.entries())
    .map(([empresa, lista]) => {
      const empresaNorm = normalizar(empresa);
      const doGrupo = protocoladosPorEmpresa.get(empresaNorm);
      const entregues: AtivoImportado[] = [];
      const faltantes: AtivoImportado[] = [];

      for (const ativo of lista) {
        const nomeNorm = normalizar(ativo.nome);
        const encontrado = doGrupo ? doGrupo.has(nomeNorm) : protocoladosGlobais.has(nomeNorm);
        if (encontrado) {
          entregues.push(ativo);
        } else {
          faltantes.push(ativo);
        }
      }

      return { empresa, total: lista.length, entregues, faltantes };
    })
    .sort((a, b) => b.faltantes.length - a.faltantes.length);
}
