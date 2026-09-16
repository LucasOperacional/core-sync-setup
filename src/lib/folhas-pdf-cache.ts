/**
 * Cache compartilhado dos PDFs protocolados (bucket "folhas-pdf").
 * Evita baixar o mesmo arquivo mais de uma vez durante a análise e a geração
 * do Folhas_Horas_Extras.pdf. Somente leitura — nada é alterado no storage.
 *
 * O cache é limitado (LRU por quantidade e por memória) para que uma varredura
 * com muitos protocolos não estoure a memória da aba do navegador.
 */
import { supabase } from "@/integrations/supabase/client";

const MAX_ARQUIVOS = 12;
const MAX_BYTES = 180 * 1024 * 1024; // ~180 MB

const cacheBytes = new Map<string, ArrayBuffer>();
let bytesEmCache = 0;

function liberarEspaco(novoTamanho: number) {
  while (
    cacheBytes.size > 0 &&
    (cacheBytes.size >= MAX_ARQUIVOS || bytesEmCache + novoTamanho > MAX_BYTES)
  ) {
    const maisAntigo = cacheBytes.keys().next();
    if (maisAntigo.done) break;
    const removido = cacheBytes.get(maisAntigo.value);
    cacheBytes.delete(maisAntigo.value);
    bytesEmCache -= removido?.byteLength ?? 0;
  }
  if (bytesEmCache < 0) bytesEmCache = 0;
}

export async function baixarBytesFolhaPdf(caminho: string): Promise<ArrayBuffer | null> {
  if (!caminho) return null;

  const emCache = cacheBytes.get(caminho);
  if (emCache) {
    // Reposiciona como mais recente (LRU).
    cacheBytes.delete(caminho);
    cacheBytes.set(caminho, emCache);
    return emCache;
  }

  try {
    const { data, error } = await supabase.storage.from("folhas-pdf").download(caminho);
    if (error || !data) return null;
    const bytes = await data.arrayBuffer();
    if (!bytes.byteLength) return null;

    if (bytes.byteLength <= MAX_BYTES) {
      liberarEspaco(bytes.byteLength);
      cacheBytes.set(caminho, bytes);
      bytesEmCache += bytes.byteLength;
    }
    return bytes;
  } catch {
    // Rede indisponível ou arquivo removido: a análise segue sem este PDF.
    return null;
  }
}

export function limparCacheFolhasPdf() {
  cacheBytes.clear();
  bytesEmCache = 0;
}
