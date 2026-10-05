import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CHAVE_EMAIL_VAGAS = "vagas_email_destino";

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Divide o valor salvo (separado por vírgula) em uma lista de e-mails. */
export function dividirEmails(valor: string): string[] {
  return valor
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Lê os e-mails que recebem as vagas aprovadas. */
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
    const emails = dividirEmails(String(data?.valor ?? ""));
    return {
      emails,
      email: emails[0] ?? "",
      atualizadoEm: data?.updated_at ?? null,
    };
  });

/** Salva os e-mails que recebem as vagas aprovadas (Admin / Diretor). */
export const salvarEmailVagas = createServerFn({ method: "POST" })
  .inputValidator((data: { emails?: string[]; email?: string }) => {
    const lista = Array.isArray(data?.emails)
      ? data.emails
      : dividirEmails(String(data?.email ?? ""));
    const emails = [...new Set(lista.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (emails.length === 0) throw new Error("Informe ao menos um e-mail.");
    const invalido = emails.find((e) => !emailValido(e));
    if (invalido) throw new Error(`E-mail inválido: ${invalido}`);
    return { emails, valor: emails.join(",") };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("app_config")
      .upsert(
        { chave: CHAVE_EMAIL_VAGAS, valor: data.valor, updated_at: new Date().toISOString() },
        { onConflict: "chave" },
      );
    if (error) throw new Error("Sem permissão para alterar esta configuração.");
    return { emails: data.emails };
  });
