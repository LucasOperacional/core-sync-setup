import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehSuperAdmin } from "@/lib/usuarios-guard.server";

/** Papéis que podem ver as atividades de todos os usuários. */
const PAPEIS_GESTAO = ["admin", "cordenador", "diretor"] as const;

export type DetalhesAtividade = Record<string, string | number | boolean | null>;

export type AtividadeUsuario = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_nome: string | null;
  acao: string;
  modulo: string;
  rota: string | null;
  detalhes: DetalhesAtividade;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type Ctx = {
  supabase: any;
  userId: string;
  claims?: Record<string, unknown> | null;
};

async function podeVerTodos(context: Ctx): Promise<boolean> {
  const email = (context.claims?.["email"] as string | undefined) ?? null;
  if (ehSuperAdmin(email)) return true;
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", [...PAPEIS_GESTAO])
    .limit(1);
  return !!(data && data.length > 0);
}

async function identidade(context: Ctx) {
  const email = (context.claims?.["email"] as string | undefined) ?? null;
  let nome: string | null = null;
  try {
    const { data } = await context.supabase
      .from("profiles")
      .select("nome,email")
      .eq("id", context.userId)
      .maybeSingle();
    if (data) {
      nome = (data.nome as string | null) ?? null;
      if (!nome && data.email) nome = String(data.email).split("@")[0] ?? null;
    }
  } catch {
    // segue sem nome
  }
  if (!nome && email) nome = email.split("@")[0] ?? null;
  return { email, nome };
}

const registroSchema = z.object({
  acao: z.string().trim().min(1).max(200),
  modulo: z.string().trim().min(1).max(80).default("geral"),
  rota: z.string().trim().max(300).optional(),
  detalhes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

/** Grava uma atividade do usuário logado. */
export const registrarAtividade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registroSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { email, nome } = await identidade(context as Ctx);
      const ip =
        getRequestHeader("cf-connecting-ip") ??
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
      const userAgent = getRequestHeader("user-agent") ?? null;

      const { error } = await context.supabase.from("user_activity_logs").insert({
        user_id: context.userId,
        user_email: email,
        user_nome: nome,
        acao: data.acao,
        modulo: data.modulo,
        rota: data.rota ?? null,
        detalhes: data.detalhes ?? {},
        ip_address: ip,
        user_agent: userAgent,
      });
      if (error) return { ok: false, erro: error.message };
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Falha ao registrar a atividade.",
      };
    }
  });

const consultaSchema = z.object({
  de: z.string().trim().optional(),
  ate: z.string().trim().optional(),
  usuario: z.string().trim().optional(),
  modulo: z.string().trim().optional(),
  busca: z.string().trim().optional(),
  limite: z.number().int().min(1).max(1000).optional(),
});

/** Lista as atividades: gestores veem todas, demais veem apenas as próprias. */
export const listarAtividades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => consultaSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    try {
      const todos = await podeVerTodos(context as Ctx);
      let query = context.supabase
        .from("user_activity_logs")
        .select(
          "id,user_id,user_email,user_nome,acao,modulo,rota,detalhes,ip_address,user_agent,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(data.limite ?? 300);

      if (!todos) query = query.eq("user_id", context.userId);
      if (data.de) query = query.gte("created_at", `${data.de}T00:00:00`);
      if (data.ate) query = query.lte("created_at", `${data.ate}T23:59:59`);
      if (data.modulo && data.modulo !== "todos") query = query.eq("modulo", data.modulo);
      if (data.usuario && data.usuario !== "todos") query = query.eq("user_id", data.usuario);
      if (data.busca) query = query.ilike("acao", `%${data.busca}%`);

      const { data: linhas, error } = await query;
      if (error)
        return { ok: false, erro: error.message, atividades: [] as AtividadeUsuario[], todos };
      return { ok: true, erro: null, atividades: (linhas ?? []) as AtividadeUsuario[], todos };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Falha ao carregar as atividades.",
        atividades: [] as AtividadeUsuario[],
        todos: false,
      };
    }
  });
