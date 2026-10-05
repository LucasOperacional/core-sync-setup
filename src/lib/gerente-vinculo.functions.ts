import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims?: { email?: string } };

async function ehAdmin(ctx: Ctx) {
  if ((ctx.claims?.email ?? "").toLowerCase() === "lucasdallan@gmail.com") return true;
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

/** Vínculos gerente → usuário + lista de usuários para escolher (somente administradores). */
export const listarVinculosGerentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    if (!(await ehAdmin(ctx))) return { ok: false as const, admin: false, vinculos: [], usuarios: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vinc } = await supabaseAdmin.from("gerente_usuario_vinculo" as never).select("gerente_nome,user_id");
    const { data: perfis } = await supabaseAdmin.from("profiles").select("id,nome,email").order("nome");
    const usuarios = ((perfis ?? []) as { id: string; nome: string | null; email: string | null }[]).map((p) => ({
      id: p.id,
      rotulo: [p.nome, p.email].filter(Boolean).join(" · ") || p.id,
    }));
    return {
      ok: true as const,
      admin: true,
      vinculos: (vinc ?? []) as unknown as { gerente_nome: string; user_id: string }[],
      usuarios,
    };
  });

export const vincularUsuarioGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ gerenteNome: z.string().min(1), userId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (!(await ehAdmin(ctx))) return { ok: false as const, erro: "Somente administradores." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = supabaseAdmin.from("gerente_usuario_vinculo" as never) as any;
    if (!data.userId) {
      const { error } = await t.delete().eq("gerente_nome", data.gerenteNome);
      return error ? { ok: false as const, erro: error.message } : { ok: true as const };
    }
    // Um usuário fica vinculado a um único card.
    await (supabaseAdmin.from("gerente_usuario_vinculo" as never) as any).delete().eq("user_id", data.userId);
    const { error } = await (supabaseAdmin.from("gerente_usuario_vinculo" as never) as any).upsert(
      { gerente_nome: data.gerenteNome, user_id: data.userId, vinculado_por: ctx.userId },
      { onConflict: "gerente_nome" },
    );
    return error ? { ok: false as const, erro: error.message } : { ok: true as const };
  });
