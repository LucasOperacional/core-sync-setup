/**
 * Leitura paginada do banco.
 *
 * O PostgREST devolve no máximo 1000 linhas por consulta. Sem paginação, as
 * telas de protocolo passam a "perder" folhas silenciosamente assim que o
 * volume cresce (contadores errados, folhas sumindo dos PDFs gerados).
 * Use sempre este utilitário para tabelas que podem crescer.
 */

export const PAGINA_CONSULTA_PADRAO = 1000;

type Resposta<T> = { data: T[] | null; error: { message: string } | null };

export async function buscarTudoPaginado<T>(
  consulta: (inicio: number, fim: number) => PromiseLike<Resposta<T>>,
  opcoes?: { pagina?: number; limiteDeSeguranca?: number },
): Promise<T[]> {
  const pagina = opcoes?.pagina ?? PAGINA_CONSULTA_PADRAO;
  const limite = opcoes?.limiteDeSeguranca ?? 200_000;
  const todos: T[] = [];

  for (let inicio = 0; inicio < limite; inicio += pagina) {
    const { data, error } = await consulta(inicio, inicio + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    todos.push(...lote);
    if (lote.length < pagina) break;
  }

  return todos;
}

/** Divide uma lista de ids em lotes, evitando URLs gigantes no filtro `.in()`. */
export function emLotes<T>(itens: T[], tamanho = 200): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}
