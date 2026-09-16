/**
 * Gera uma chave de storage segura a partir do nome original do arquivo.
 * O storage rejeita chaves com acentos, espaços e caracteres especiais
 * ("Invalid key"), então normalizamos para ASCII e substituímos o resto.
 * O nome original continua salvo na coluna `nome` para exibição.
 */
export function nomeArquivoSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");
  return limpo || `arquivo_${Date.now()}`;
}

export function caminhoStorage(pasta: string, nomeArquivo: string): string {
  return `${pasta}/${nomeArquivoSeguro(nomeArquivo)}`;
}
