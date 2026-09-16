import { supabase } from "@/integrations/supabase/client";

/**
 * Aguarda a sessão do usuário ser restaurada no navegador antes de chamar
 * funções protegidas do servidor. Evita o erro "No authorization header
 * provided" quando a página monta antes do token estar disponível.
 */
export async function aguardarSessao(tentativas = 20, intervaloMs = 150) {
  for (let i = 0; i < tentativas; i += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return null;
}
