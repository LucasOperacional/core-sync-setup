/**
 * Parsers for CSV, XLSX/Excel, and PDF files.
 * Returns rows as arrays of string arrays (each inner array = one row of cells).
 */

export type ParsedRow = string[];

/**
 * Parse a CSV file into rows.
 */
export function parseCsv(text: string): ParsedRow[] {
  const limpo = text.replace(/^\uFEFF/, "");
  const lines = limpo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Arquivos separados por TAB (exportações .txt/.csv da NEXTI) usam outro separador.
  const comTab = lines.filter((l) => l.includes("\t")).length;
  const usaTab = lines.length > 0 && comTab / lines.length >= 0.6;
  if (usaTab) {
    return lines.map((line) => line.split("\t").map((c) => c.trim()));
  }
  return lines.map((line) => {
    // Simple CSV split — handles quoted fields
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === "," || ch === ";") && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

/**
 * Convert an Excel serial date number to a dd/mm/yyyy string.
 * Excel serial dates count days since 1900-01-01 (with the Lotus 1-2-3 leap year bug).
 */
function excelSerialToDate(serial: number): string {
  // Excel incorrectly considers 1900 a leap year (Lotus bug)
  if (serial > 60) serial -= 1;
  const baseDate = new Date(1900, 0, 1);
  const resultDate = new Date(baseDate.getTime() + (serial - 1) * 86400000);
  const day = String(resultDate.getDate()).padStart(2, "0");
  const month = String(resultDate.getMonth() + 1).padStart(2, "0");
  const year = resultDate.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Check if a number looks like an Excel date serial.
 * Valid date serials are typically between 1 (1900-01-01) and ~55000 (year ~2050).
 */
function looksLikeDateSerial(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 55000 && Number.isInteger(value);
}

/**
 * Normalize a cell value from XLSX to a proper string.
 * Handles dates, numbers, booleans, null/undefined.
 *
 * IMPORTANT: Only converts numbers to dates if the column is explicitly detected
 * as a date column by its header. This prevents numeric columns like "Faltas"
 * from being incorrectly converted to dates.
 */
function normalizeCellValue(value: unknown, dateColumns: Set<number>, colIdx: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    // Only convert to date if this column was detected as a date column by header
    if (dateColumns.has(colIdx) && looksLikeDateSerial(value)) {
      return excelSerialToDate(value);
    }
    return String(value);
  }
  return String(value).trim();
}

/**
 * Detect which columns likely contain dates based on header names.
 */
function detectDateColumnsByHeader(headerRow: unknown[]): Set<number> {
  const dateKeywords = [
    "data",
    "date",
    "inicio",
    "início",
    "fim",
    "termino",
    "término",
    "entrada",
    "saida",
    "saída",
    "check-in",
    "check-out",
    "checkin",
    "checkout",
    "dt",
    "periodo",
    "período",
  ];

  // Keywords that indicate a column is NOT a date (to avoid false positives)
  const nonDateKeywords = [
    "falta",
    "faltas",
    "ausencia",
    "ausência",
    "qtd",
    "total",
    "quantidade",
    "cargo",
    "posto",
    "colaborador",
    "nome",
    "funcionario",
    "funcionário",
  ];

  const dateColumns = new Set<number>();
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (cell.trim() === "") continue;

    // Check if header matches a non-date keyword first
    const isNonDate = nonDateKeywords.some((kw) => cell.includes(kw));
    if (isNonDate) continue;

    if (dateKeywords.some((kw) => cell.includes(kw))) {
      dateColumns.add(i);
    }
  }
  return dateColumns;
}

/**
 * Check if a row is just a visual separator (all dashes, underscores, or repeated chars).
 */
function isSeparatorRow(row: unknown[]): boolean {
  const nonEmpty = row.filter((cell) => {
    const s = String(cell ?? "").trim();
    return s.length > 0;
  });
  if (nonEmpty.length === 0) return true;
  return nonEmpty.every((cell) => {
    const s = String(cell ?? "").trim();
    return /^[-_=.]+$/.test(s);
  });
}

/**
 * Parse an XLSX/XLS file. Uses the "xlsx" package (SheetJS).
 * Reads ALL sheets and concatenates their data.
 * Properly handles dates, empty cells, and irregular column counts.
 */
export async function parseXlsx(file: File): Promise<ParsedRow[]> {
  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: false, cellNF: true });

    if (!wb.SheetNames || wb.SheetNames.length === 0) return [];

    const allRows: ParsedRow[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      // Get raw data as 2D array with all values
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true,
        blankrows: false,
      });

      if (rawRows.length === 0) continue;

      // Detect date columns from the first non-empty row (likely header)
      let dateColumns = new Set<number>();
      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        const row = rawRows[i];
        if (row && row.some((cell) => String(cell ?? "").trim().length > 0)) {
          dateColumns = detectDateColumnsByHeader(row);
          break;
        }
      }

      // Find the maximum column count to normalize row widths
      let maxCols = 0;
      for (const row of rawRows) {
        if (row.length > maxCols) maxCols = row.length;
      }

      for (const row of rawRows) {
        // Skip separator rows
        if (isSeparatorRow(row)) continue;

        // Normalize all cells and pad to max column count
        const normalizedRow: string[] = [];
        for (let colIdx = 0; colIdx < maxCols; colIdx++) {
          const cellValue = colIdx < row.length ? row[colIdx] : "";
          normalizedRow.push(normalizeCellValue(cellValue, dateColumns, colIdx));
        }

        // Skip rows where all cells are empty after normalization
        if (normalizedRow.every((cell) => cell === "")) continue;

        allRows.push(normalizedRow);
      }
    }

    return allRows;
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    throw new Error(`Não foi possível ler a planilha (${detalhe}).`);
  }
}

/**
 * Represents a text item extracted from a PDF with its bounding position.
 */
type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

/**
 * Detect column boundaries from text items using gap analysis.
 * Instead of a fixed threshold, analyzes the distribution of horizontal gaps
 * between adjacent items on the same line to find natural column separators.
 */
function detectColumnBoundaries(lineMap: Map<number, PdfTextItem[]>): number[] {
  // Collect all inter-item gaps across all lines
  const allGaps: Array<{ gap: number; splitX: number }> = [];

  for (const items of lineMap.values()) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const gap = curr.x - (prev.x + prev.width);
      if (gap > 0) {
        allGaps.push({ gap, splitX: curr.x });
      }
    }
  }

  if (allGaps.length === 0) return [];

  // Sort gaps by size to find the natural break between "intra-word" and "inter-column" gaps
  const sortedGaps = allGaps.map((g) => g.gap).sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 5;

  // Column separator threshold: gaps significantly larger than the median
  // Use at least 15 PDF units or 2.5x the median, whichever is larger
  const threshold = Math.max(15, medianGap * 2.5);

  // Collect X positions where large gaps occur
  const splitPositions: number[] = [];
  for (const { gap, splitX } of allGaps) {
    if (gap >= threshold) {
      splitPositions.push(splitX);
    }
  }

  if (splitPositions.length === 0) return [];

  // Cluster nearby split positions (within 20 units) into column boundaries
  splitPositions.sort((a, b) => a - b);
  const boundaries: number[] = [splitPositions[0]!];
  for (let i = 1; i < splitPositions.length; i++) {
    const last = boundaries[boundaries.length - 1]!;
    const curr = splitPositions[i]!;
    if (curr - last > 20) {
      boundaries.push(curr);
    } else {
      // Average with previous boundary for better accuracy
      boundaries[boundaries.length - 1] = (last + curr) / 2;
    }
  }

  return boundaries;
}

/**
 * Given sorted text items for a line and column boundaries,
 * merge items into column cells.
 */
function itemsToColumns(items: PdfTextItem[], boundaries: number[]): string[] {
  if (boundaries.length === 0) {
    // No column structure detected — join all items as a single line
    const sorted = [...items].sort((a, b) => a.x - b.x);
    let line = "";
    let lastRightX = 0;
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]!;
      if (i > 0) {
        const gap = item.x - lastRightX;
        line += gap > 8 ? "  " : gap > 1 ? " " : "";
      }
      line += item.str;
      lastRightX = item.x + item.width;
    }
    return splitPdfLineIntoColumns(line.trim());
  }

  // Assign each item to a column bucket based on its X position
  const numCols = boundaries.length + 1;
  const buckets: string[][] = Array.from({ length: numCols }, () => []);

  const sorted = [...items].sort((a, b) => a.x - b.x);
  for (const item of sorted) {
    let colIdx = 0;
    for (let b = 0; b < boundaries.length; b++) {
      if (item.x >= boundaries[b]! - 5) {
        colIdx = b + 1;
      }
    }
    buckets[colIdx]!.push(item.str);
  }

  return buckets.map((parts) => parts.join(" ").trim());
}

/**
 * Try to split a single text line into multiple columns.
 * PDF text lines often have columns separated by large whitespace (2+ spaces),
 * tabs, or pipe characters.
 */
function splitPdfLineIntoColumns(line: string): string[] {
  // Try pipe separator first
  if (line.includes("|")) {
    const parts = line
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length >= 2) return parts;
  }

  // Try tab separator
  if (line.includes("\t")) {
    const parts = line
      .split("\t")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length >= 2) return parts;
  }

  // Try splitting on 3+ consecutive spaces (more conservative to preserve names)
  const parts = line
    .split(/\s{3,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length >= 2) return parts;

  // Fallback: return the whole line as a single column
  return [line.trim()];
}

/**
 * Extract text from PDF and split into rows.
 * Uses statistical gap analysis to detect column boundaries precisely,
 * preventing names like "Maria da Silva" from being split across columns.
 */
export async function parsePdfToRows(file: File): Promise<ParsedRow[]> {
  const pdfjs = await import("pdfjs-dist");

  // O worker pode falhar em alguns navegadores/ambientes: nesse caso lemos o PDF
  // na própria thread principal em vez de abortar a importação.
  let semWorker = false;
  try {
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  } catch {
    semWorker = true;
  }

  const buffer = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: buffer, ...(semWorker ? { disableWorker: true } : {}) })
      .promise;
  } catch (e) {
    if (semWorker) {
      const detalhe = e instanceof Error ? e.message : String(e);
      throw new Error(`Não foi possível abrir o PDF (${detalhe}).`);
    }
    // Segunda tentativa sem worker.
    doc = await pdfjs.getDocument({ data: buffer, disableWorker: true } as never).promise;
  }
  const rows: ParsedRow[] = [];
  let totalItensTexto = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Collect all text items with precise positioning
    const textItems: PdfTextItem[] = [];
    for (const item of content.items as Array<{
      str: string;
      transform: number[];
      width: number;
    }>) {
      const str = item.str;
      if (!str || str.trim() === "") continue;
      const x = item.transform[4] ?? 0;
      const y = Math.round((item.transform[5] ?? 0) * 10) / 10;
      // Use the actual width reported by pdfjs, fallback to character-count estimate
      const width = item.width > 0 ? item.width : str.length * 4.5;
      textItems.push({ str, x, y, width });
    }

    totalItensTexto += textItems.length;
    if (textItems.length === 0) continue;

    // Group text items by Y position to form lines (tolerance of 3 units)
    const lineMap = new Map<number, PdfTextItem[]>();
    for (const item of textItems) {
      let bucketY = item.y;
      for (const existingY of lineMap.keys()) {
        if (Math.abs(existingY - item.y) <= 3) {
          bucketY = existingY;
          break;
        }
      }
      if (!lineMap.has(bucketY)) {
        lineMap.set(bucketY, []);
      }
      lineMap.get(bucketY)!.push(item);
    }

    // Detect column boundaries for this page using gap analysis
    const boundaries = detectColumnBoundaries(lineMap);

    // Sort lines top to bottom (descending Y in PDF coordinates)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

    for (const y of sortedYs) {
      const items = lineMap.get(y)!;
      const columns = itemsToColumns(items, boundaries);
      // Skip rows that are entirely empty
      if (columns.every((c) => c === "")) continue;
      rows.push(columns);
    }
  }

  if (totalItensTexto === 0) {
    throw new Error(
      "PDF sem texto pesquisável (provavelmente digitalizado/imagem). Exporte em PDF de texto, CSV ou Excel.",
    );
  }

  return rows;
}

/** Detecta o tipo do arquivo e devolve as linhas já normalizadas. */
export async function parseAnyFile(file: File): Promise<ParsedRow[]> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".pdf")) return parsePdfToRows(file);
  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) return parseXlsx(file);
  const texto = await file.text();
  if (texto.trim() === "") throw new Error("Arquivo vazio.");
  return parseCsv(texto);
}
