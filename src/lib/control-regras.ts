import type { Visit } from "@/lib/report-parser";

/**
 * Regra de isolamento do Dashboard CONTROL.
 *
 * O Control exibe SOMENTE visitas lidas de relatórios em PDF importados
 * pela página Admin · Relatórios. Nenhuma informação vinda da API NEXTI
 * pode ser vinculada ao dashboard — nem na importação, nem na leitura do
 * banco, nem no cache local.
 */

/** Identifica registros originados da API NEXTI (não permitidos no Control). */
export function visitaVindaDaNexti(v: Visit): boolean {
  const id = (v.id ?? "").toLowerCase();
  const arquivo = (v.arquivo ?? "").toLowerCase();
  // Registros da API NEXTI não têm arquivo PDF de origem e/ou carregam
  // identificadores prefixados pela integração. Atenção: os PDFs de
  // supervisão exportados se chamam "NextiControl_*.PDF" — isso NÃO os
  // torna registros da API. Apenas o marcador explícito "api-nexti"
  // (ou id gerado pela integração) identifica origem na API.
  if (id.startsWith("nx-")) return true;
  if (arquivo.includes("api-nexti")) return true;
  // Sem arquivo de origem = não veio de relatório em PDF importado.
  if (!arquivo.trim()) return true;
  return false;
}

/** Remove qualquer visita vinculada à API NEXTI. */
export function filtrarFonteControl(visitas: Visit[]): Visit[] {
  return visitas.filter((v) => !visitaVindaDaNexti(v));
}
