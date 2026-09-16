import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERGUNTAS, type PerguntaRoteiro } from "@/lib/roteiro-campo-perguntas";
import { ehSuperAdmin } from "@/lib/usuarios-guard.server";

export const CHAVE_CHECKLIST = "checklist_campo_perguntas";

/** Papéis com permissão para editar as perguntas do checklist. */
const PAPEIS_EDICAO = ["admin", "cordenador"] as const;

type GuardContext = {
  supabase: any;
  userId: string;
  claims?: Record<string, unknown> | null;
};

/** Só superadmin, admin e coordenador podem alterar as perguntas. */
async function assertPodeEditarChecklist(context: GuardContext) {
  const email = (context.claims?.["email"] as string | undefined) ?? null;
  if (ehSuperAdmin(email)) return;

  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", [...PAPEIS_EDICAO])
    .limit(1);
  if (data && data.length > 0) return;

  // Fallback: confirma o e-mail direto no Auth quando o token não traz a claim.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (ehSuperAdmin(userData?.user?.email)) return;
  } catch {
    // ignora e cai no erro abaixo
  }

  throw new Error("Somente superadmin, administrador ou coordenador podem editar as perguntas.");
}

/** Informa se o usuário logado pode editar as perguntas do checklist. */
export const podeEditarChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertPodeEditarChecklist(context);
      return { pode: true };
    } catch {
      return { pode: false };
    }
  });

function normalizar(lista: unknown): PerguntaRoteiro[] | null {
  if (!Array.isArray(lista)) return null;
  const itens: PerguntaRoteiro[] = [];
  for (const bruto of lista) {
    if (!bruto || typeof bruto !== "object") continue;
    const p = bruto as Record<string, unknown>;
    const texto = String(p["texto"] ?? "").trim();
    const funcao = String(p["funcao"] ?? "").trim();
    const bloco = String(p["bloco"] ?? "").trim() || "Geral";
    const id = String(p["id"] ?? "").trim() || `p-${itens.length + 1}-${Date.now()}`;
    if (!texto || !funcao) continue;
    itens.push({
      id,
      texto,
      bloco,
      funcao: funcao as PerguntaRoteiro["funcao"],
      critica: Boolean(p["critica"]),
    });
  }
  return itens;
}

/** Lê o checklist salvo; devolve o padrão quando ainda não houve edição. */
export const obterPerguntasChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_config")
      .select("valor,updated_at")
      .eq("chave", CHAVE_CHECKLIST)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.valor)
      return { perguntas: PERGUNTAS, personalizado: false, atualizadoEm: null as string | null };
    try {
      const perguntas = normalizar(JSON.parse(data.valor));
      if (!perguntas || perguntas.length === 0) {
        return {
          perguntas: PERGUNTAS,
          personalizado: false,
          atualizadoEm: data.updated_at ?? null,
        };
      }
      return { perguntas, personalizado: true, atualizadoEm: data.updated_at ?? null };
    } catch {
      return { perguntas: PERGUNTAS, personalizado: false, atualizadoEm: data.updated_at ?? null };
    }
  });

/** Salva o checklist editado. */
export const salvarPerguntasChecklist = createServerFn({ method: "POST" })
  .inputValidator((data: { perguntas: PerguntaRoteiro[] }) => {
    const perguntas = normalizar(data?.perguntas);
    if (!perguntas || perguntas.length === 0) throw new Error("Inclua ao menos uma pergunta.");
    return { perguntas };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertPodeEditarChecklist(context);
    const { error } = await context.supabase.from("app_config").upsert(
      {
        chave: CHAVE_CHECKLIST,
        valor: JSON.stringify(data.perguntas),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chave" },
    );
    if (error) throw new Error("Sem permissão para alterar o checklist.");
    return { perguntas: data.perguntas };
  });

/** Volta ao checklist padrão do sistema. */
export const restaurarPerguntasChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPodeEditarChecklist(context);
    const { error } = await context.supabase
      .from("app_config")
      .delete()
      .eq("chave", CHAVE_CHECKLIST);
    if (error) throw new Error("Sem permissão para alterar o checklist.");
    return { perguntas: PERGUNTAS };
  });
