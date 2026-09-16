import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ehSuperAdmin } from "./usuarios-guard.server";

/** Papéis autorizados a ver e aprovar as vagas abertas pela supervisão. */
export const PAPEIS_APROVADORES = ["admin", "diretor", "cordenador"] as const;

type GuardContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims?: Record<string, unknown> | null;
};

/**
 * Garante que o chamador pode visualizar/aprovar vagas:
 * superadministrador, Admin, Diretor ou Cordenador.
 */
export async function assertAprovadorVagas(context: GuardContext) {
  const email = (context.claims?.["email"] as string | undefined) ?? null;
  if (ehSuperAdmin(email)) return;

  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", [...PAPEIS_APROVADORES]);
  if (!error && data && data.length > 0) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (ehSuperAdmin(userData?.user?.email)) return;
  } catch {
    // ignora e cai no erro abaixo
  }

  throw new Error("Acesso restrito a Admin, Diretor e Cordenador.");
}
