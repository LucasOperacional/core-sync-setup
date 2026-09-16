import type { User } from "@supabase/supabase-js";

/**
 * Makes sure the signed-in user has a row in `profiles` and `user_profiles`.
 * Runs once per browser session; failures are non-critical (RLS allows the
 * user to write only their own row, so a race just no-ops).
 */
let ensuredFor: string | null = null;

function displayNameFor(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nome = typeof meta["nome"] === "string" ? meta["nome"] : undefined;
  const fullName = typeof meta["full_name"] === "string" ? meta["full_name"] : undefined;
  return nome || fullName || user.email?.split("@")[0] || "Usuário";
}

export async function ensureUserProfiles(user: User): Promise<void> {
  if (typeof window === "undefined") return;
  if (ensuredFor === user.id) return;
  ensuredFor = user.id;

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const nome = displayNameFor(user);

    await Promise.all([
      supabase
        .from("profiles")
        .upsert({ id: user.id, email: user.email ?? null, nome }, { onConflict: "id" }),
      supabase
        .from("user_profiles")
        .upsert({ id: user.id, display_name: nome }, { onConflict: "id" }),
    ]);
  } catch {
    ensuredFor = null;
  }
}
