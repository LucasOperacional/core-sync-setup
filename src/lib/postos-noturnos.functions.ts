import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizarNome } from "@/lib/gerentes-area-a";

/**
 * REGRA: postos com "noturno" no nome só aparecem para:
 * - os gerentes de área Israel, Adarmisson e Gabriel Medanha;
 * - o superadmin (lucasdallan@gmail.com) e administradores;
 * - os coordenadores Jefferson e Vanderlei (papel de coordenador).
 */
const GERENTES_NOTURNO = ["ISRAEL", "ADARMISSON", "GABRIEL MEDANHA"];
const COORDENADORES_NOTURNO = ["JEFFERSON", "VANDERLEI"];
const SUPERADMIN_EMAIL = "lucasdallan@gmail.com";

function nomeAutorizado(nome: string): boolean {
  const n = normalizarNome(nome);
  if (!n) return false;
  return [...GERENTES_NOTURNO, ...COORDENADORES_NOTURNO].some((alvo) => {
    const a = normalizarNome(alvo);
    return n === a || n.startsWith(`${a} `) || n.includes(` ${a} `) || n.endsWith(` ${a}`);
  });
}

export const possoVerPostosNoturnos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const email = (context.claims?.email as string | undefined)?.toLowerCase() ?? "";
    if (email === SUPERADMIN_EMAIL) return true;

    const { data: papeis } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const lista = (papeis ?? []).map((p) => String(p.role));
    if (lista.includes("admin") || lista.includes("cordenador")) return true;

    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    return nomeAutorizado(perfil?.display_name ?? "");
  });
