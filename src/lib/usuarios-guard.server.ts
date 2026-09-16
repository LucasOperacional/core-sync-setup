import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** E-mail do superadministrador com acesso irrestrito. */
export const SUPERADMIN_EMAIL = "lucasdallan@gmail.com";
/** E-mails com acesso irrestrito ao sistema. */
export const SUPERADMIN_EMAILS = ["lucasdallan@gmail.com"];

export function ehSuperAdmin(email?: string | null): boolean {
  return !!email && SUPERADMIN_EMAILS.includes(email.toLowerCase().trim());
}

type GuardContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims?: Record<string, unknown> | null;
};

/** Garante que o chamador é administrador (ou o superadministrador). */
export async function assertAdmin(context: GuardContext) {
  const email = (context.claims?.["email"] as string | undefined) ?? null;
  if (ehSuperAdmin(email)) return;

  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!error && data) return;

  // Fallback: confirma o e-mail direto no Auth quando o token não traz a claim.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (ehSuperAdmin(userData?.user?.email)) return;
  } catch {
    // ignora e cai no erro abaixo
  }

  throw new Error("Acesso restrito a administradores.");
}
