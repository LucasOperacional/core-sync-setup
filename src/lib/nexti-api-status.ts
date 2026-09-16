/**
 * Estado da API NEXTI (ligada/desligada) no cliente.
 *
 * Regra do projeto: com a API DESLIGADA nenhuma informação é importada da NEXTI
 * para os dashboards — resta apenas a opção de IMPORTAR ARQUIVOS, que passa a
 * alimentar os dashboards automaticamente.
 */
import { useEffect, useState } from "react";
import { getNextiApiStatus } from "@/lib/nexti.functions";

export const EVENTO_NEXTI_API = "nexti-api-status-atualizado";

let cache: { enabled: boolean; em: number } | null = null;
let emVoo: Promise<boolean> | null = null;
const TTL_MS = 30_000;

export async function nextiApiAtiva(force = false): Promise<boolean> {
  if (!force && cache && Date.now() - cache.em < TTL_MS) return cache.enabled;
  if (!force && emVoo) return emVoo;
  emVoo = (async () => {
    try {
      const r = await getNextiApiStatus();
      const enabled = r?.enabled !== false;
      cache = { enabled, em: Date.now() };
      return enabled;
    } catch {
      // sem resposta: assume ligada para não travar o app
      cache = { enabled: true, em: Date.now() };
      return true;
    } finally {
      emVoo = null;
    }
  })();
  return emVoo;
}

export function notificarNextiApiStatus(enabled: boolean): void {
  cache = { enabled, em: Date.now() };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_NEXTI_API));
}

/** Hook: null enquanto carrega. */
export function useNextiApiAtiva(): boolean | null {
  const [ativa, setAtiva] = useState<boolean | null>(cache ? cache.enabled : null);

  useEffect(() => {
    let cancelado = false;
    const ler = (force = false) => {
      void nextiApiAtiva(force).then((v) => {
        if (!cancelado) setAtiva(v);
      });
    };
    ler();
    const handler = () => ler(true);
    window.addEventListener(EVENTO_NEXTI_API, handler);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_NEXTI_API, handler);
    };
  }, []);

  return ativa;
}
