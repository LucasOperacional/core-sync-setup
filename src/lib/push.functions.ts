/** Funções de servidor das notificações: autorização, prévia com a IA e envio.
 * A autorização é sempre validada no servidor — nunca só na tela.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";
import { ehCategoriaPush, MAX_DESTINATARIOS, rotaInternaValida } from "./push-tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntradaEnvio = {
  category: string;
  event: string;
  recipientUserIds?: string[] | null;
  context?: Record<string, unknown> | null;
  targetUrl?: string | null;
  deduplicationKey?: string | null;
  titleOverride?: string | null;
  bodyOverride?: string | null;
};

function validarEntrada(input: EntradaEnvio): EntradaEnvio {
  if (!ehCategoriaPush(input.category)) throw new Error("Categoria inválida.");
  if (typeof input.event !== "string" || !input.event.trim() || input.event.length > 80) {
    throw new Error("Evento inválido.");
  }
  const ids = input.recipientUserIds ?? null;
  if (ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Destinatários inválidos.");
    if (ids.length > MAX_DESTINATARIOS) throw new Error("Muitos destinatários em uma só chamada.");
    for (const id of ids) if (!UUID.test(String(id))) throw new Error("Destinatário inválido.");
  }
  return { ...input, recipientUserIds: ids };
}

/** Envia uma notificação. Usuário comum só envia para si mesmo; admin envia para outros. */
export const enviarNotificacaoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarEntrada)
  .handler(async ({ data, context }) => {
    const proprio = [context.userId];
    let destinatarios = data.recipientUserIds ?? proprio;

    const somenteEle = destinatarios.length === 1 && destinatarios[0] === context.userId;
    if (!somenteEle) {
      await assertAdmin(context); // administradores podem escolher outros destinatários
    } else {
      destinatarios = proprio;
    }

    const { dispararNotificacao } = await import("./push-envio.server");
    const resultado = await dispararNotificacao({
      category: data.category as never,
      event: data.event.trim(),
      recipientUserIds: [...new Set(destinatarios)],
      context: data.context ?? null,
      targetUrl: rotaInternaValida(data.targetUrl),
      deduplicationKey: data.deduplicationKey ?? null,
      titleOverride: somenteEle ? null : (data.titleOverride ?? null),
      bodyOverride: somenteEle ? null : (data.bodyOverride ?? null),
    });

    return {
      ok: resultado.ok,
      fonte: resultado.fonte,
      titulo: resultado.titulo,
      corpo: resultado.corpo,
      resultados: resultado.resultados,
    };
  });

/** Prévia do texto gerado pela IA, para o administrador revisar antes de enviar. */
export const previaTextoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { category: string; event: string; context?: Record<string, unknown> }) => {
      if (!ehCategoriaPush(input.category)) throw new Error("Categoria inválida.");
      if (!input.event?.trim()) throw new Error("Informe o evento.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { gerarTextoComGemini } = await import("./push-envio.server");
    const { TEXTO_PADRAO } = await import("./push-tipos");
    const gerado = await gerarTextoComGemini({
      category: data.category as never,
      event: data.event.trim(),
      context: data.context ?? null,
    });
    const padrao = TEXTO_PADRAO[data.category as keyof typeof TEXTO_PADRAO];
    return gerado
      ? { ...gerado, fonte: "gemini" as const }
      : { ...padrao, priority: "normal" as const, fonte: "padrao" as const };
  });

/** Situação das chaves e segredos (apenas sim/não, nunca os valores). */
export const diagnosticoPush = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { segredosPush } = await import("./push-envio.server");
    const s = segredosPush();
    return {
      pronto: s.faltando.length === 0,
      faltando: s.faltando,
      geminiConfigurado: s.geminiConfigurado,
      envioInternoConfigurado: Boolean(process.env["PUSH_INTERNAL_SECRET"]),
      chavePublicaNoFrontend: Boolean(process.env["VITE_VAPID_PUBLIC_KEY"]),
    };
  });

/** Lista de pessoas para o painel administrativo de envio. */
export const listarPessoasPush = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: perfis } = await supabaseAdmin.from("user_profiles").select("id, display_name");
    const { data: papeis } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: lista } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    const nomes = new Map((perfis ?? []).map((p) => [p.id, p.display_name ?? ""]));
    const papelPor = new Map<string, string>();
    for (const p of papeis ?? []) papelPor.set(p.user_id, String(p.role));

    const { data: aparelhos } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id")
      .eq("enabled", true);
    const comAparelho = new Set((aparelhos ?? []).map((a) => a.user_id));

    return (lista?.users ?? []).map((u) => ({
      id: u.id,
      nome: nomes.get(u.id) || (u.email ?? "").split("@")[0] || "Sem nome",
      email: u.email ?? "",
      papel: papelPor.get(u.id) ?? "usuario",
      temAparelho: comAparelho.has(u.id),
    }));
  });
