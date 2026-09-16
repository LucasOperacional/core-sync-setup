import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CHAVE_EMAIL_VAGAS = "vagas_email_destino";

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Lê o e-mail que recebe as vagas aprovadas. */
export const obterEmailVagas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("valor,updated_at")
      .eq("chave", CHAVE_EMAIL_VAGAS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      email: String(data?.valor ?? "").trim(),
      atualizadoEm: data?.updated_at ?? null,
    };
  });

/** Salva o e-mail que recebe as vagas aprovadas (Admin / Diretor). */
export const salvarEmailVagas = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => {
    const email = String(data?.email ?? "").trim();
    if (!emailValido(email)) throw new Error("Informe um e-mail válido.");
    return { email };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("app_config")
      .upsert(
        { chave: CHAVE_EMAIL_VAGAS, valor: data.email, updated_at: new Date().toISOString() },
        { onConflict: "chave" },
      );
    if (error) throw new Error("Sem permissão para alterar esta configuração.");
    return { email: data.email };
  });
