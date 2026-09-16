/**
 * Regra de prioridade das fontes de dados dos dashboards.
 *
 * 1. Importação de documentos (PDF/CSV/XLSX) tem PREFERÊNCIA no dia em que é feita.
 * 2. Se no dia atual não houve nenhuma importação, a API da NEXTI assume e
 *    alimenta os dashboards automaticamente.
 */

export type DashboardFonteModulo = "CONTROL" | "FALTAS" | "ATESTADOS";

const CHAVE = "dashboard-fonte-importacao-v1";
export const EVENTO_FONTE = "dashboard-fonte-atualizada";

type Registro = { dia: string; registros: number; em: string };
type Mapa = Partial<Record<DashboardFonteModulo, Registro>>;

function diaAtual(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
}

function ler(): Mapa {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHAVE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Mapa) : {};
  } catch {
    return {};
  }
}

/** Marca que houve importação de documentos hoje para o módulo. */
export function registrarImportacaoDashboard(
  modulo: DashboardFonteModulo,
  registros: number,
): void {
  if (typeof window === "undefined") return;
  const mapa = ler();
  mapa[modulo] = { dia: diaAtual(), registros, em: new Date().toISOString() };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(mapa));
  } catch {
    /* storage cheio */
  }
  window.dispatchEvent(new Event(EVENTO_FONTE));
}

/** Retorna a importação feita hoje para o módulo, ou null se não houver. */
export function importacaoDeHoje(modulo: DashboardFonteModulo): Registro | null {
  const reg = ler()[modulo];
  if (!reg || reg.dia !== diaAtual()) return null;
  return reg;
}

/** true quando a API da NEXTI deve alimentar o dashboard (nenhuma importação hoje). */
export function nextiDeveAlimentar(modulo: DashboardFonteModulo): boolean {
  return importacaoDeHoje(modulo) === null;
}

export function assinarFonteDashboard(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENTO_FONTE, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENTO_FONTE, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Regra adicional: com a API NEXTI DESLIGADA (card "Configuração API Nexti" na
 * página IA Operacional) nenhuma informação é importada da NEXTI. Nesse estado
 * apenas a IMPORTAÇÃO DE ARQUIVOS alimenta os dashboards, automaticamente a
 * cada importação. Ver `src/lib/nexti-api-status.ts`.
 */
