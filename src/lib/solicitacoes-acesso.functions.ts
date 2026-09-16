import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";

export type SolicitacaoAcesso = {
  id: string;
  userId: string;
  nome: string;
  email: string;
  roleSolicitada: string;
  departamento: string;
  status: "pendente" | "aprovada" | "recusada";
  observacao: string;
  createdAt: string;
  decididoEm: string | null;
};

const ROLES_VALIDAS = ["diretor", "cordenador", "mesa_operacional", "admin", "user"] as const;

function mapear(row: any): SolicitacaoAcesso {
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome ?? "",
    email: row.email ?? "",
    roleSolicitada: row.role_solicitada ?? "diretor",
    departamento: row.departamento ?? "",
    status: (row.status ?? "pendente") as SolicitacaoAcesso["status"],
    observacao: row.observacao ?? "",
    createdAt: row.created_at,
    decididoEm: row.decidido_em ?? null,
  };
}

/** Lista as solicitações de acesso (somente administradores). */
export const listarSolicitacoesAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SolicitacaoAcesso[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("solicitacoes_acesso")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapear);
  });

/** Aprova a solicitação: concede a função e deixa as permissões de páginas em branco. */
export const aprovarSolicitacaoAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; role?: string }) => {
    if (!input.id) throw new Error("Solicitação inválida.");
    const role = input.role && ROLES_VALIDAS.includes(input.role as any) ? input.role : undefined;
    return { id: input.id, role };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sol, error } = await (supabaseAdmin as any)
      .from("solicitacoes_acesso")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sol) throw new Error("Solicitação não encontrada.");
    if (sol.status !== "pendente") throw new Error("Esta solicitação já foi decidida.");

    const role = data.role ?? sol.role_solicitada ?? "diretor";

    await (supabaseAdmin as any)
      .from("user_roles")
      .upsert({ user_id: sol.user_id, role }, { onConflict: "user_id,role" });

    const { error: upErr } = await (supabaseAdmin as any)
      .from("solicitacoes_acesso")
      .update({
        status: "aprovada",
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true as const, userId: sol.user_id as string };
  });

/** Recusa a solicitação de acesso. */
export const recusarSolicitacaoAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; observacao?: string }) => {
    if (!input.id) throw new Error("Solicitação inválida.");
    const observacao = (input.observacao ?? "").trim().slice(0, 500);
    return { id: input.id, observacao };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("solicitacoes_acesso")
      .update({
        status: "recusada",
        observacao: data.observacao,
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pendente");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Situação da própria solicitação, para exibir avisos ao usuário. */
export const minhaSolicitacaoAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SolicitacaoAcesso | null> => {
    const { data } = await (context.supabase as any)
      .from("solicitacoes_acesso")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapear(data) : null;
  });
