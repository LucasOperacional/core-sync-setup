/**
 * Utilidades compartilhadas pelos dashboards (Control, Faltas, Atestados).
 */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aceita dd/mm/aaaa, aaaa-mm-dd e variações com hora. */
export function parseDateFlexible(value: string): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const br = trimmed.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const iso = trimmed.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthShortLabel(key: string): string {
  const [ano, mes] = key.split("-");
  const idx = Number(mes) - 1;
  return `${MESES_CURTOS[idx] ?? mes}/${(ano ?? "").slice(2)}`;
}

/** Agrupa valores por mês e devolve série ordenada cronologicamente. */
export function buildMonthlySeries<T>(
  items: T[],
  getDate: (item: T) => Date | null,
  getValue: (item: T) => number = () => 1,
): { mes: string; label: string; total: number; registros: number }[] {
  const map = new Map<string, { total: number; registros: number }>();
  for (const item of items) {
    const d = getDate(item);
    if (!d) continue;
    const key = monthKey(d);
    const entry = map.get(key) ?? { total: 0, registros: 0 };
    entry.total += getValue(item);
    entry.registros += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, label: monthShortLabel(mes), ...v }));
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Baixa um CSV (separador ;, com BOM para Excel pt-BR). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const CHART_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0]!;
}
