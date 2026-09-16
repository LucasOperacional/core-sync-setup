/**
 * Extração tabular tolerante a arquivos heterogêneos.
 *
 * Diferente de uma detecção única de cabeçalho no topo do arquivo, aqui varremos
 * TODAS as linhas: cada vez que uma nova linha de cabeçalho é reconhecida, um novo
 * "segmento" começa. Isso garante leitura completa quando:
 *  - vários arquivos são importados de uma vez (cada um com o seu cabeçalho);
 *  - o PDF repete o cabeçalho em cada página;
 *  - a planilha tem várias abas/blocos com layouts diferentes.
 */

import type { ParsedRow } from "@/lib/file-parsers";

export type TargetColumn = { key: string; labels: string[] };

export function normalizeHeaderText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesLabel(cellNorm: string, labels: string[]): boolean {
  return labels.some((label) => {
    const l = normalizeHeaderText(label);
    if (!l) return false;
    return cellNorm === l || cellNorm.includes(l) || l.includes(cellNorm);
  });
}

/** Um cabeçalho não pode ser majoritariamente numérico (senão é linha de dados). */
function pareceCabecalho(row: ParsedRow): boolean {
  const preenchidas = row.map((c) => (c ?? "").trim()).filter((c) => c !== "");
  if (preenchidas.length < 2) return false;
  const numericas = preenchidas.filter((c) => /^[\d.,/:-]+$/.test(c)).length;
  return numericas / preenchidas.length < 0.5;
}

export function mapearCabecalho(
  row: ParsedRow,
  targets: TargetColumn[],
): { mapping: Record<string, number>; matches: number } {
  const mapping: Record<string, number> = {};
  let matches = 0;
  for (const target of targets) {
    for (let col = 0; col < row.length; col++) {
      const cellNorm = normalizeHeaderText(row[col] ?? "");
      if (!cellNorm) continue;
      if (matchesLabel(cellNorm, target.labels) && !(target.key in mapping)) {
        mapping[target.key] = col;
        matches++;
        break;
      }
    }
  }
  return { mapping, matches };
}

/**
 * Percorre todas as linhas aplicando o mapeamento do cabeçalho mais recente.
 * Retorna todos os registros convertidos por `mapRow` (linhas inúteis devem ser
 * descartadas pelo próprio `mapRow` retornando null).
 */
export function extrairTodosRegistros<T>(
  rows: ParsedRow[],
  targets: TargetColumn[],
  minMatches: number,
  mapRow: (row: ParsedRow, mapping: Record<string, number>) => T | null,
): T[] {
  const resultados: T[] = [];
  let mapping: Record<string, number> | null = null;

  // 1ª passada: descobre a melhor pontuação de cabeçalho existente no arquivo.
  // Assim uma linha de dados que por acaso contenha "FALTA" ou "POSTO A" nunca
  // é confundida com cabeçalho (ela pontua menos que o cabeçalho verdadeiro).
  let melhorGlobal = 0;
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    if (!pareceCabecalho(row)) continue;
    const { matches } = mapearCabecalho(row, targets);
    if (matches > melhorGlobal) melhorGlobal = matches;
  }
  const limiar = Math.max(minMatches, melhorGlobal);

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    if (row.every((c) => (c ?? "").trim() === "")) continue;

    if (pareceCabecalho(row)) {
      const { mapping: novo, matches } = mapearCabecalho(row, targets);
      if (matches >= limiar) {
        // Cabeçalho (inclusive repetições em novas páginas/arquivos).
        mapping = novo;
        continue;
      }
    }

    if (!mapping) continue;

    // Linhas de título/rodapé (uma única célula) não são registros da tabela.
    const preenchidas = row.filter((c) => (c ?? "").trim() !== "").length;
    const larguraMapa = Math.max(...Object.values(mapping)) + 1;
    if (preenchidas <= 1 && larguraMapa > 1) continue;

    const item = mapRow(row, mapping);
    if (item !== null) resultados.push(item);
  }

  return resultados;
}

/** Existe pelo menos um cabeçalho reconhecível no arquivo? */
export function temCabecalho(
  rows: ParsedRow[],
  targets: TargetColumn[],
  minMatches: number,
): boolean {
  return rows.some(
    (row) => pareceCabecalho(row) && mapearCabecalho(row, targets).matches >= minMatches,
  );
}

/** Junta linhas já guardadas com as recém-lidas, sem duplicar linhas idênticas. */
export function mesclarLinhas(existentes: ParsedRow[], novas: ParsedRow[]): ParsedRow[] {
  const vistas = new Set<string>();
  const resultado: ParsedRow[] = [];
  for (const row of [...existentes, ...novas]) {
    if (!Array.isArray(row)) continue;
    const chave = row.map((c) => (c ?? "").trim()).join("\u0001");
    if (chave.replace(/\u0001/g, "").trim() === "") continue;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push(row);
  }
  return resultado;
}
