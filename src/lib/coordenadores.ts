import { normalizarNome } from "./gerentes-area-a";

/**
 * Cada Gerente de Área responde a um Coordenador.
 * Regra da operação: os quatro gerentes abaixo são do VANDERLEI;
 * todos os demais ficam com o JEFFERSON.
 */
export const COORDENADORES = ["VANDERLEI", "JEFFERSON"] as const;

export type Coordenador = (typeof COORDENADORES)[number];

const GERENTES_VANDERLEI = [
  "VIVIAN DE CARVALHO MORENO",
  "PAULO HENRIQUE DE ABREU RIBEIRO",
  "WILLIAMAR DE RESENDE",
  "JOAO CARLOS RODRIGUES DA SILVA",
];

const IGNORAR_TOKENS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function chave(nome: string): string {
  return normalizarNome(nome)
    .split(" ")
    .filter((t) => t && !IGNORAR_TOKENS.has(t))
    .join(" ");
}

const CHAVES_VANDERLEI = new Set(GERENTES_VANDERLEI.map(chave));

/** Devolve o coordenador responsável pelo gerente de área informado. */
export function coordenadorDoGerente(gerente: string): Coordenador {
  return CHAVES_VANDERLEI.has(chave(gerente)) ? "VANDERLEI" : "JEFFERSON";
}

/** Nome apresentado no cabeçalho de cada bloco de coordenação. */
export function rotuloCoordenador(c: Coordenador): string {
  return `Coordenador ${c === "VANDERLEI" ? "Vanderlei" : "Jefferson"}`;
}

/**
 * Regra de visibilidade da Mesa Operacional: cada usuário abaixo enxerga
 * apenas os gerentes de área do seu coordenador. Demais usuários veem tudo.
 */
const COORDENADOR_POR_USUARIO: Record<string, Coordenador> = {
  "lucasdallan@gmail.com": "VANDERLEI",
  "mariana.silva@grupotektron.com.br": "JEFFERSON",
};

/** Coordenador que o usuário pode visualizar, ou null quando vê todos. */
export function coordenadorVisivelPara(email?: string | null): Coordenador | null {
  if (!email) return null;
  const chaveEmail = email.trim().toLowerCase();
  if (COORDENADOR_POR_USUARIO[chaveEmail]) return COORDENADOR_POR_USUARIO[chaveEmail];
  const usuario = chaveEmail.split("@")[0] ?? "";
  if (usuario === "lucasdallan") return "VANDERLEI";
  if (usuario.startsWith("mariana")) return "JEFFERSON";
  return null;
}
