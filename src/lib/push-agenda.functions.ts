/** Funções de servidor dos avisos agendados (uso restrito a administradores). */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";
import { ehCategoriaPush, MAX_DESTINATARIOS, rotaInternaValida } from "./push-tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLICOS = ["supervisores", "selecionados", "todos"];
const REPETICOES = ["unica", "diaria", "semanal"];

export type EntradaAgendamento = {
  category: string;
  event?: string | null;
  title?: string | null;
  body?: string | null;
  targetUrl?: string | null;
  publico: string;
  recipientUserIds?: string[] | null;
  agendadoPara: string;
  repeticao: string;
};

function validarAgendamento(input: EntradaAgendamento): EntradaAgendamento {
  if (!ehCategoriaPush(input.category)) throw new Error("Categoria inválida.");
  if (!PUBLICOS.includes(input.publico)) throw new Error("Público inválido.");
  if (!REPETICOES.includes(input.repeticao)) throw new Error("Repetição inválida.");

  const quando = new Date(input.agendadoPara);
  if (Number.isNaN(quando.getTime())) throw new Error("Data e hora inválidas.");

  const ids = input.recipientUserIds ?? [];
  if (input.publico === "selecionados") {
    if (ids.length === 0) throw new Error("Escolha ao menos uma pessoa.");
    if (ids.length > MAX_DESTINATARIOS) throw new Error("Muitas pessoas selecionadas.");
    for (const id of ids) if (!UUID.test(String(id))) throw new Error("Pessoa inválida.");
  }

  const titulo = (input.title ?? "").trim();
  const corpo = (input.body ?? "").trim();
  if (titulo.length > 80) throw new Error("Título muito longo.");
  if (corpo.length > 300) throw new Error("Mensagem muito longa.");

  return {
    category: input.category,
    event: (input.event ?? "aviso_agendado").trim().slice(0, 80) || "aviso_agendado",
    title: titulo || null,
    body: corpo || null,
    targetUrl: rotaInternaValida(input.targetUrl),
    publico: input.publico,
    recipientUserIds: input.publico === "selecionados" ? [...new Set(ids.map(String))] : [],
    agendadoPara: quando.toISOString(),
    repeticao: input.repeticao,
  };
}

/** Cria um aviso programado. */
export const criarAvisoAgendado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarAgendamento)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: criado, error } = await supabaseAdmin
      .from("push_agendamentos")
      .insert({
        criado_por: context.userId,
        category: data.category,
        event_type: data.event ?? "aviso_agendado",
        title: data.title ?? null,
        body: data.body ?? null,
        target_url: data.targetUrl ?? null,
        publico: data.publico,
        recipient_user_ids: data.recipientUserIds ?? [],
        agendado_para: data.agendadoPara,
        proximo_envio_em: data.agendadoPara,
        repeticao: data.repeticao,
        status: "agendado",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: criado.id };
  });

/** Lista os avisos programados, do mais próximo para o mais distante. */
export const listarAvisosAgendados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("push_agendamentos")
      .select("*")
      .order("proximo_envio_em", { ascending: true, nullsFirst: false })
      .order("agendado_para", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Cancela ou exclui um aviso programado. */
export const alterarAvisoAgendado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; acao: "cancelar" | "reativar" | "excluir" }) => {
    if (!UUID.test(input?.id ?? "")) throw new Error("Aviso inválido.");
    if (!["cancelar", "reativar", "excluir"].includes(input.acao)) throw new Error("Ação inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.acao === "excluir") {
      const { error } = await supabaseAdmin.from("push_agendamentos").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { error } = await supabaseAdmin
      .from("push_agendamentos")
      .update({
        status: data.acao === "cancelar" ? "cancelado" : "agendado",
        erro: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia agora todos os avisos cujo horário já passou. */
export const processarAvisosAgendados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { processarAgendamentosVencidos } = await import("./push-agenda.server");
    return processarAgendamentosVencidos();
  });
