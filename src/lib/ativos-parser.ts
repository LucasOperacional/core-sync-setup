/**
 * Parser for "Funcionários Ativos" Excel files.
 * Each sheet = one company. Reads NOME DO FUNCIONÁRIO, NOME DA FUNÇÃO,
 * DESCRIÇÃO DO SETOR, MATRÍCULA and optionally STATUS.
 */

export interface FuncionarioAtivo {
  id: string;
  empresa: string;
  nome: string;
  cargo: string;
  posto: string;
  matricula: string;
  duplicado: boolean; // true when same name appears without matrícula
  statusBase: "ativo" | "nao_localizado";
}

export interface EmpresaAtivos {
  empresa: string;
  funcionarios: FuncionarioAtivo[];
  totalAtivos: number;
  dataAtualizacao: string;
}

export interface ImportacaoAtivosHistorico {
  id: string;
  nomeArquivo: string;
  data: string;
  hora: string;
  totalFuncionarios: number;
  usuario: string;
}

function gerarId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function normStr(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Check if a header cell matches a target (case/accent insensitive, partial) */
function headerMatch(cell: string, targets: string[]): boolean {
  const n = normCompare(cell);
  return targets.some((t) => n.includes(normCompare(t)));
}

/** Check if a value looks like a manual total / footer / observation */
function isInvalidName(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed === "") return true;
  // Pure numbers
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return true;
  // Common total/footer patterns
  if (/^total/i.test(trimmed)) return true;
  if (/^subtotal/i.test(trimmed)) return true;
  if (/^obs[.:]/i.test(trimmed)) return true;
  if (/^observa[cç]/i.test(trimmed)) return true;
  if (/^nota[s]?[.:]/i.test(trimmed)) return true;
  if (/^legenda/i.test(trimmed)) return true;
  if (/^fonte[.:]/i.test(trimmed)) return true;
  if (/^rodap[eé]/i.test(trimmed)) return true;
  // Very short values that are likely not names (1-2 chars)
  if (trimmed.length <= 2 && !/[a-záéíóúâêîôûãõ]{2}/i.test(trimmed)) return true;
  return false;
}

const ACTIVE_STATUSES = new Set(["ativo", "ativa"]);
const INACTIVE_STATUSES = new Set([
  "inativo",
  "inativa",
  "demitido",
  "demitida",
  "afastado",
  "afastada",
  "desligado",
  "desligada",
]);

export async function parseAtivosExcel(file: File): Promise<EmpresaAtivos[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });

  if (!wb.SheetNames || wb.SheetNames.length === 0) return [];

  const resultado: EmpresaAtivos[] = [];
  const agora = new Date().toLocaleString("pt-BR");

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });

    if (rawRows.length < 2) continue; // need at least header + 1 row

    // Find header row (first row that contains NOME DO FUNCIONÁRIO or similar)
    let headerIdx = -1;
    let colNome = -1;
    let colCargo = -1;
    let colPosto = -1;
    let colMatricula = -1;
    let colStatus = -1;

    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const row = rawRows[i];
      if (!row) continue;

      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] ?? "").trim();
        if (cell === "") continue;

        if (
          headerMatch(cell, [
            "NOME DO FUNCIONARIO",
            "NOME FUNCIONARIO",
            "FUNCIONARIO",
            "NOME DO COLABORADOR",
            "COLABORADOR",
          ])
        ) {
          colNome = j;
          headerIdx = i;
        }
        if (headerMatch(cell, ["NOME DA FUNCAO", "FUNCAO", "CARGO"])) {
          colCargo = j;
        }
        if (headerMatch(cell, ["DESCRICAO DO SETOR", "SETOR", "POSTO", "LOTACAO", "LOCAL"])) {
          colPosto = j;
        }
        if (headerMatch(cell, ["MATRICULA"])) {
          colMatricula = j;
        }
        if (headerMatch(cell, ["STATUS", "SITUACAO"])) {
          colStatus = j;
        }
      }

      if (colNome >= 0) break;
    }

    if (headerIdx < 0 || colNome < 0) continue; // no recognizable header

    const empresa = normStr(sheetName);
    const funcionarios: FuncionarioAtivo[] = [];
    const chaveVista = new Set<string>();
    const nomesVistos = new Map<string, number>(); // name -> count for dupe detection

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row) continue;

      const nomeRaw = String(row[colNome] ?? "").trim();
      const nome = normStr(nomeRaw);

      if (isInvalidName(nome)) continue;

      // If status column exists, check it
      if (colStatus >= 0) {
        const statusVal = normCompare(String(row[colStatus] ?? ""));
        if (statusVal !== "" && !ACTIVE_STATUSES.has(statusVal)) {
          if (INACTIVE_STATUSES.has(statusVal)) continue;
          // Unknown status — skip if it matches inactive patterns
          continue;
        }
      }

      const cargo = colCargo >= 0 ? normStr(String(row[colCargo] ?? "")) : "";
      const posto = colPosto >= 0 ? normStr(String(row[colPosto] ?? "")) : "";
      const matricula =
        colMatricula >= 0 ? normStr(String(row[colMatricula] ?? "")).replace(/[^\w\d]/g, "") : "";

      // Dedup by empresa + matricula when matrícula exists
      if (matricula) {
        const chave = `${normCompare(empresa)}|${normCompare(matricula)}`;
        if (chaveVista.has(chave)) continue;
        chaveVista.add(chave);
      }

      // Track name occurrences for dupe flagging
      const nomeKey = normCompare(nome);
      nomesVistos.set(nomeKey, (nomesVistos.get(nomeKey) ?? 0) + 1);

      funcionarios.push({
        id: gerarId(),
        empresa,
        nome,
        cargo,
        posto,
        matricula,
        duplicado: false,
        statusBase: "ativo",
      });
    }

    // Flag duplicates (same name, no matrícula)
    for (const func of funcionarios) {
      const nomeKey = normCompare(func.nome);
      if (!func.matricula && (nomesVistos.get(nomeKey) ?? 0) > 1) {
        func.duplicado = true;
      }
    }

    if (funcionarios.length > 0) {
      resultado.push({
        empresa,
        funcionarios,
        totalAtivos: funcionarios.length,
        dataAtualizacao: agora,
      });
    }
  }

  return resultado;
}

/**
 * Match a collaborator name against the active employees base.
 * Returns the matched employee or null.
 */
export function buscarAtivoNaBase(
  nome: string,
  empresa: string,
  matricula: string,
  bases: EmpresaAtivos[],
): FuncionarioAtivo | null {
  const nEmpresa = normCompare(empresa);
  const nNome = normCompare(nome);
  const nMat = normCompare(matricula);

  for (const base of bases) {
    if (normCompare(base.empresa) !== nEmpresa) continue;
    for (const func of base.funcionarios) {
      // Match by matrícula first if available
      if (nMat && normCompare(func.matricula) === nMat) return func;
      // Fallback to name
      if (normCompare(func.nome) === nNome) return func;
    }
  }
  return null;
}
