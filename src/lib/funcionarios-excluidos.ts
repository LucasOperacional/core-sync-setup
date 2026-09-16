/**
 * Funcionários que nunca devem ser importados, em qualquer empresa
 * e em qualquer formato de arquivo (PDF, CSV, XLS, XLSX).
 * A exclusão acontece antes da prévia, contagem, salvamento e sincronização.
 */

export const NOMES_EXCLUIDOS_IMPORTACAO: string[] = [
  "HORACIO AURELIO CARVALHO DE SOUSA",
  "MARCOS CESAR CAETANO DOS SANTOS",
  "RONALDO JUNIO DE ALMEIDA CORDEIRO",
  "RONIVON DOS REIS DE CARVALHO",
  "TERCIO DE SOUSA OLIVEIRA",
  "VIVIAN GONCALVES FEITOSA",
  "ALEXANDRO COSTA SANTOS",
  "DANYEL RIBEIRO DE FRANCA MELO",
  "FRANCISCO GETULIO GADELHA",
  "RICARDO DE OLIVEIRA SILVA",
  "ALESSANDRO HENRIQUE GOMES FAGUNDES",
  "PEDRO LEITE DE SOUZA",
  "CLEIDIMAR GOMES SANTOS",
  "DANILO ALLAS LOPES ANDRADE",
  "DELSON LUIZ DE MELO",
  "EDEIMAR DA SILVA CAMPOS",
  "ERYKA BEATRIZ GUEDES CADAVAL",
  "HERBSON RAMALHO CUNHA",
  "KLEITON SILVA LIMA",
  "KLEITON VULCAO DE LIMA",
  "KLEYBER MENDES DE OLIVEIRA",
  "LEANDRO DE JESUS LOPES",
  "LERYTTON RAMOS DE OLIVEIRA",
  "LUCAS FERNANDES LOBO",
  "MAURICIO BORBA TEIXEIRA",
  "MAXWELL ALEXANDRE DA SILVA SOUSA",
  "NATHALIA GARCIA DIAS",
  "PEDRO FEITOSA DA PAZ",
  "RENATO CAETANO SOUZA",
  "RICHARD WILLDERSON ALVES E SILVA",
  "SAMUEL JEVERSON DA SILVA SOBRINHO",
  "VINICIUS DE OLIVEIRA FRANCISCO",
  "WARLEY AQUINO DE SOUSA",
  "WELLINGTON PRADO BORGES",
  "WILSON MARCONDES DA SILVA",
  "LETICIA KETILE FREITAS DE JESUS",
  "OSEIAS GOMES RAMOS",
];

/** Maiúsculas, sem acentos, sem pontuação e com espaços colapsados. */
export function normalizarNomeExclusao(valor: string): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const SET_EXCLUIDOS = new Set(NOMES_EXCLUIDOS_IMPORTACAO.map(normalizarNomeExclusao));

/** Compara o nome completo normalizado com a lista de exclusão. */
export function nomeEstaExcluido(nome: string): boolean {
  return SET_EXCLUIDOS.has(normalizarNomeExclusao(nome));
}

/** Remove os funcionários da lista de exclusão, informando quantos foram ignorados. */
export function filtrarFuncionariosExcluidos<T extends { nome: string }>(
  registros: T[],
): { mantidos: T[]; ignorados: number } {
  const mantidos = registros.filter((r) => !nomeEstaExcluido(r.nome));
  return { mantidos, ignorados: registros.length - mantidos.length };
}
