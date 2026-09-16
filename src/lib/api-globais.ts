import {
  APIS_GLOBAIS,
  obterApisGlobais,
  publicarApiGlobal,
  type ProvedorApiGlobal,
} from "./api-globais.functions";

export const EVENTO_APIS_GLOBAIS = "apis-globais:sincronizadas";

function temChave(valor: string): boolean {
  try {
    const parsed = JSON.parse(valor) as { apiKey?: unknown };
    return typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Aplica no navegador as configurações de API ligadas pelo superadmin.
 * Nunca lança erro: se algo falhar, cada card segue com o que já tinha.
 */
export async function aplicarApisGlobais(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // Sem sessão ativa não há como ler as configurações globais (e a leitura
    // resultaria em erro de autorização na tela).
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return;

    const globais = await obterApisGlobais();
    let mudou = false;
    for (const provedor of Object.keys(APIS_GLOBAIS) as ProvedorApiGlobal[]) {
      const valor = globais?.[provedor];
      if (!valor || !temChave(valor)) continue;
      const storage = APIS_GLOBAIS[provedor].storage;
      try {
        const atual = localStorage.getItem(storage);
        if (atual === valor) continue;
        // A configuração global vence apenas quando de fato traz uma chave válida.
        localStorage.setItem(storage, valor);
        mudou = true;
      } catch {
        /* armazenamento indisponível — ignora */
      }
    }
    if (mudou) window.dispatchEvent(new Event(EVENTO_APIS_GLOBAIS));
  } catch {
    /* sem configuração global — segue com a local */
  }
}

/**
 * Compartilha a configuração salva no card com todos os usuários.
 * Silencioso: quem não é admin/diretor simplesmente não publica.
 */
export async function compartilharApiGlobal(
  provedor: ProvedorApiGlobal,
  config: unknown,
): Promise<boolean> {
  try {
    const valor = JSON.stringify(config ?? {});
    if (!temChave(valor)) return false;
    const r = await publicarApiGlobal({ data: { provedor, valor } });
    return !!r?.publicado;
  } catch {
    return false;
  }
}

/** Reage quando as configurações globais são aplicadas no navegador. */
export function ouvirApisGlobais(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_APIS_GLOBAIS, callback);
  return () => window.removeEventListener(EVENTO_APIS_GLOBAIS, callback);
}
