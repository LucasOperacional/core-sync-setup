/**
 * Lista oficial (única) dos Gerentes de Área A em situação "trabalhando".
 * Todo o sistema — Control, Faltas, Atestados, Painel NEXTI e as sincronizações
 * com a API da NEXTI — deve usar esta lista como fonte de verdade.
 */
export const GERENTES_AREA_A = [
  "EDUARDO ALENCAR DA SILVA",
  "GABRIEL MENDANHA CABRAL",
  "JOAO CARLOS RODRIGUES DA SILVA",
  "JOAO MENDES DE SOUZA",
  "PAULO HENRIQUE ABREU RIBEIRO",
  "ROBSON DOUGLAS SOARES SOUSA",
  "TIAGO LOPES FERREIRA",
  "VIVIAN DE CARVALHO MORENO",
  "WILLIAMAR DE RESENDE",
] as const;

/**
 * Nomes que devem ser ignorados ao processar a coluna "gerente".
 * Útil para excluir colaboradores que aparecem por engano na lista de gerentes.
 */
export const NOMES_GERENTES_IGNORAR = [
  "IRANEIDE CARVALHO DA SILVA",
  "GESIAN ROBERTO GARCIA DE JESUS",
] as const;

const IGNORAR = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

export function normalizarNome(v: string): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(v: string): string[] {
  return normalizarNome(v)
    .split(" ")
    .filter((t) => t && !IGNORAR.has(t));
}

const CANONICOS = GERENTES_AREA_A.map((nome) => ({ nome, tokens: tokens(nome) }));

/**
 * Retorna o nome canônico do gerente de área A correspondente, ou null.
 * Aceita variações (com/sem preposições, nomes parciais como "ROBSON SOUSA").
 */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Dois tokens são equivalentes quando iguais ou com erro de digitação leve. */
function tokenIgual(a: string, b: string): boolean {
  if (a === b) return true;
  const tamanho = Math.min(a.length, b.length);
  if (tamanho < 4) return false;
  return distancia(a, b) <= (tamanho >= 7 ? 2 : 1);
}

/**
 * Retorna o nome canônico do gerente de área A correspondente, ou null.
 * Aceita variações (com/sem preposições, nomes parciais como "ROBSON SOUSA")
 * e pequenos erros de digitação (ex.: "GABRIEL MEDANHA").
 */
export function gerenteAreaACanonico(nome: string): string | null {
  const t = tokens(nome);
  if (t.length === 0) return null;
  const set = new Set(t);

  for (const c of CANONICOS) {
    if (c.tokens.every((token) => set.has(token))) return c.nome;
  }

  const cSet = CANONICOS.map((c) => ({ ...c, set: new Set(c.tokens) }));
  for (const c of cSet) {
    if (t.every((token) => c.set.has(token)) && t.length >= 2) return c.nome;
  }

  // Tolerância a erros de digitação: exige pelo menos 2 tokens equivalentes.
  let melhor: { nome: string; acertos: number } | null = null;
  for (const c of CANONICOS) {
    const usados = new Set<number>();
    let acertos = 0;
    for (const token of t) {
      const idx = c.tokens.findIndex(
        (ct, i) => !usados.has(i) && tokenIgual(token, ct),
      );
      if (idx >= 0) {
        usados.add(idx);
        acertos++;
      }
    }
    if (acertos >= 2 && (!melhor || acertos > melhor.acertos)) {
      melhor = { nome: c.nome, acertos };
    }
  }
  return melhor?.nome ?? null;
}

/**
 * Remove nomes da lista de ignorados de uma string de gerente.
 * Compara sem acentos, maiúsculas/minúsculas e espaços extras.
 * Preserva os demais nomes separados por vírgula.
 */
export function removerNomesIgnorados(nome: string): string {
  const ignorados = new Set(NOMES_GERENTES_IGNORAR.map(normalizarNome));
  return nome
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !ignorados.has(normalizarNome(p)))
    .join(", ");
}

export function ehGerenteAreaA(nome: string): boolean {
  return gerenteAreaACanonico(nome) !== null;
}
