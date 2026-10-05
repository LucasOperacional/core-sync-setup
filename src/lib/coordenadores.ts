import { normalizarNome } from "./gerentes-area-a";

/**
 * Cada Gerente de Área responde a um Coordenador.
 * Os gerentes listados abaixo são do VANDERLEI; todos os demais ficam com o JEFFERSON.
 */
export const COORDENADORES = ["VANDERLEI", "JEFFERSON"] as const;

export type Coordenador = (typeof COORDENADORES)[number];

const GERENTES_VANDERLEI = [
  "JOAO CARLOS RODRIGUES",
  "VIVIAN MORENO DE CARVALHO",
  "WILLIAMAR DE RESENDE",
  "PAULO HENRIQUE DE ABREU",
  "GABRIEL MEDANHA",
];

const IGNORAR_TOKENS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function tokens(nome: string): string[] {
  return normalizarNome(nome)
    .split(" ")
    .filter((t) => t && !IGNORAR_TOKENS.has(t));
}

const TOKENS_VANDERLEI = GERENTES_VANDERLEI.map(tokens);

/** Devolve o coordenador responsável pelo gerente de área informado. */
export function coordenadorDoGerente(gerente: string): Coordenador {
  const t = new Set(tokens(gerente));
  if (t.size === 0) return "JEFFERSON";
  // Casa quando todas as palavras do nome cadastrado aparecem no nome do gerente (em qualquer ordem).
  const ehVanderlei = TOKENS_VANDERLEI.some((ref) => ref.every((p) => t.has(p)));
  return ehVanderlei ? "VANDERLEI" : "JEFFERSON";
}

/** Nome apresentado no cabeçalho de cada bloco de coordenação. */
export function rotuloCoordenador(c: Coordenador): string {
  return `Coordenador ${c === "VANDERLEI" ? "Vanderlei" : "Jefferson"}`;
}

/**
 * Regra de visibilidade: cada usuário abaixo enxerga apenas os gerentes de
 * área do seu coordenador. Demais usuários veem tudo.
 */
const COORDENADOR_POR_USUARIO: Record<string, Coordenador> = {
  "lucasdallan@gmail.com": "VANDERLEI",
  "mariana.silva@grupotektron.com.br": "JEFFERSON",
  "vanderlei@nxsplus.xyz": "VANDERLEI",
  "jefferson@nxsplus.xyz": "JEFFERSON",
};

/** Coordenador que o usuário pode visualizar, ou null quando vê todos. */
export function coordenadorVisivelPara(email?: string | null): Coordenador | null {
  if (!email) return null;
  const chaveEmail = email.trim().toLowerCase();
  if (COORDENADOR_POR_USUARIO[chaveEmail]) return COORDENADOR_POR_USUARIO[chaveEmail];
  const usuario = chaveEmail.split("@")[0] ?? "";
  if (usuario === "vanderlei" || usuario === "lucasdallan") return "VANDERLEI";
  if (usuario === "jefferson" || usuario.startsWith("mariana")) return "JEFFERSON";
  return null;
}
