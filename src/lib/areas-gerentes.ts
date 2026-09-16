import { normalizarNome } from "./gerentes-area-a";

/**
 * Áreas exibidas na página de Áreas: uma área por gerente responsável.
 * Lista fixa solicitada pela operação.
 */
export const AREAS_GERENTES = [
  "GABRIEL MENDANHA CABRAL",
  "EDUARDO ALENCAR DA SILVA",
  "TIAGO LOPES FERREIRA",
  "ROBSON DOUGLAS SOARES SOUSA",
  "JOAO CARLOS RODRIGUES DA SILVA",
  "VIVIAN DE CARVALHO MORENO",
  "WILLIAMAR DE RESENDE",
  "JOAO MENDES DE SOUZA",
  "PAULO HENRIQUE DE ABREU RIBEIRO",
] as const;

export type AreaGerente = (typeof AREAS_GERENTES)[number];

const IGNORAR_TOKENS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function tokensNome(v: string): string[] {
  return normalizarNome(v)
    .split(" ")
    .filter((t) => t && !IGNORAR_TOKENS.has(t));
}

const AREAS_TOKENS = AREAS_GERENTES.map((nome) => ({ nome, tokens: tokensNome(nome) }));

/**
 * Encontra a área (gerente) correspondente a um nome livre, aceitando variações
 * como "Robson Sousa" ou nomes sem preposições. Retorna null quando não há área.
 */
export function areaGerenteCanonica(nome: string): string | null {
  const t = tokensNome(nome);
  if (t.length < 2) return null;
  const set = new Set(t);

  for (const area of AREAS_TOKENS) {
    if (area.tokens.every((token) => set.has(token))) return area.nome;
  }
  for (const area of AREAS_TOKENS) {
    const areaSet = new Set(area.tokens);
    if (t.every((token) => areaSet.has(token))) return area.nome;
  }
  return null;
}

export function iniciaisGerente(nome: string): string {
  const partes = normalizarNome(nome).split(" ").filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return `${primeira}${ultima}`;
}

export function nomeAmigavel(nome: string): string {
  return nome
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length <= 2 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
