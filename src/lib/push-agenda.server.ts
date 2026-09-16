/** Processamento dos avisos agendados: descobre os vencidos, envia e reprograma.
 * Executa somente no servidor (usa o cliente administrativo).
 */

import { ehCategoriaPush, rotaInternaValida } from "./push-tipos";

const DIA_MS = 24 * 60 * 60 * 1000;

export type ResumoAgenda = {
  processados: number;
  enviados: number;
  falhas: number;
  detalhes: Array<{ id: string; ok: boolean; destinatarios: number; erro?: string }>;
};

/** Calcula o próximo horário futuro conforme a repetição escolhida. */
export function proximoHorario(base: Date, repeticao: string, agora = new Date()): Date | null {
  const passo = repeticao === "diaria" ? DIA_MS : repeticao === "semanal" ? 7 * DIA_MS : 0;
  if (passo === 0) return null;
  let proximo = new Date(base.getTime() + passo);
  let guarda = 0;
  while (proximo.getTime() <= agora.getTime() && guarda < 1000) {
    proximo = new Date(proximo.getTime() + passo);
    guarda += 1;
  }
  return proximo;
}

/** Resolve quem recebe o aviso, conforme o público escolhido. */
export async function destinatariosDoPublico(
  publico: string,
  selecionados: string[],
): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (publico === "selecionados") return [...new Set(selecionados)];

  if (publico === "supervisores") {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "supervisor");
    return [...new Set((data ?? []).map((r) => r.user_id))];
  }

  const { data } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("enabled", true);
  return [...new Set((data ?? []).map((r) => r.user_id))];
}

/** Envia todos os avisos agendados cujo horário já chegou. */
export async function processarAgendamentosVencidos(limite = 20): Promise<ResumoAgenda> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispararNotificacao } = await import("./push-envio.server");

  const agora = new Date();
  const { data: pendentes, error } = await supabaseAdmin
    .from("push_agendamentos")
    .select("*")
    .eq("status", "agendado")
    .lte("proximo_envio_em", agora.toISOString())
    .order("proximo_envio_em", { ascending: true })
    .limit(limite);

  if (error) throw new Error(error.message);

  const resumo: ResumoAgenda = { processados: 0, enviados: 0, falhas: 0, detalhes: [] };

  for (const item of pendentes ?? []) {
    resumo.processados += 1;
    const proximo = proximoHorario(
      new Date(item.proximo_envio_em ?? item.agendado_para),
      item.repeticao,
      agora,
    );

    try {
      if (!ehCategoriaPush(item.category)) throw new Error("Categoria inválida.");
      const destinatarios = await destinatariosDoPublico(
        item.publico,
        (item.recipient_user_ids ?? []) as string[],
      );
      if (destinatarios.length === 0) throw new Error("Nenhum destinatário para este público.");

      const r = await dispararNotificacao({
        category: item.category as never,
        event: item.event_type || "aviso_agendado",
        recipientUserIds: destinatarios,
        context: { agendamento_id: item.id, publico: item.publico },
        targetUrl: rotaInternaValida(item.target_url),
        deduplicationKey: `agenda:${item.id}:${item.proximo_envio_em ?? item.agendado_para}`,
        titleOverride: item.title || null,
        bodyOverride: item.body || null,
      });

      await supabaseAdmin
        .from("push_agendamentos")
        .update({
          status: proximo ? "agendado" : "enviado",
          ultimo_envio_em: agora.toISOString(),
          proximo_envio_em: proximo ? proximo.toISOString() : null,
          erro: null,
        })
        .eq("id", item.id);

      resumo.enviados += 1;
      resumo.detalhes.push({ id: item.id, ok: r.ok, destinatarios: destinatarios.length });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Falha no envio agendado.";
      await supabaseAdmin
        .from("push_agendamentos")
        .update({
          status: proximo ? "agendado" : "falhou",
          proximo_envio_em: proximo ? proximo.toISOString() : null,
          erro: mensagem.slice(0, 400),
        })
        .eq("id", item.id);

      resumo.falhas += 1;
      resumo.detalhes.push({ id: item.id, ok: false, destinatarios: 0, erro: mensagem });
    }
  }

  return resumo;
}
