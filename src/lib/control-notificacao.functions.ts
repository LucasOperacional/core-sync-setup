/**
 * Aviso no WhatsApp quando um supervisor inicia um control
 * (checklist da Supervisão de Campo).
 *
 * Envia para o número fixo de notificação com nome do supervisor,
 * posto e cliente, data/hora e o link do relatório.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarMensagemEvolution } from "./evolution-go.functions";

/** Número que recebe os avisos de início de control. */
export const NUMERO_NOTIFICACAO_CONTROL = "5562996928605";

const LINK_RELATORIO = "https://core-sync-setup.lovable.app/supervisor-campo";

export const notificarInicioControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { postoNome?: string; postoId?: number } | undefined) => ({
    postoNome: String(input?.postoNome ?? "").trim(),
    postoId: Number.isFinite(Number(input?.postoId)) ? Number(input?.postoId) : 0,
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const supervisor = (perfil?.display_name ?? "").trim() || "Supervisor";

    let cliente = "";
    if (data.postoNome) {
      const { data: posto } = await context.supabase
        .from("nexti_workplaces")
        .select("client_name")
        .eq("name", data.postoNome)
        .maybeSingle();
      cliente = String(posto?.client_name ?? "").trim();
    }

    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const texto = [
      "🟢 *Control iniciado*",
      `Supervisor: ${supervisor}`,
      `Posto: ${data.postoNome || "Não informado"}`,
      `Cliente: ${cliente || "Não informado"}`,
      `Data e hora: ${quando}`,
      `Relatório: ${LINK_RELATORIO}`,
    ].join("\n");

    const envio = await enviarMensagemEvolution(NUMERO_NOTIFICACAO_CONTROL, texto);
    console.log(
      "[control-notificacao] aviso de início",
      JSON.stringify({ supervisor, posto: data.postoNome, ok: envio.ok, erro: envio.erro ?? null }),
    );
    return envio;
  });

/** Aviso no WhatsApp quando o supervisor finaliza o relatório do control. */
export const notificarFimControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input:
        | {
            postoNome?: string;
            percentual?: number;
            naoConformes?: number;
            duracaoSegundos?: number | null;
          }
        | undefined,
    ) => ({
      postoNome: String(input?.postoNome ?? "").trim(),
      percentual: Number.isFinite(Number(input?.percentual)) ? Number(input?.percentual) : 0,
      naoConformes: Number.isFinite(Number(input?.naoConformes)) ? Number(input?.naoConformes) : 0,
      duracaoSegundos: Number.isFinite(Number(input?.duracaoSegundos))
        ? Number(input?.duracaoSegundos)
        : null,
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const supervisor = (perfil?.display_name ?? "").trim() || "Supervisor";

    let cliente = "";
    if (data.postoNome) {
      const { data: posto } = await context.supabase
        .from("nexti_workplaces")
        .select("client_name")
        .eq("name", data.postoNome)
        .maybeSingle();
      cliente = String(posto?.client_name ?? "").trim();
    }

    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const duracao =
      data.duracaoSegundos === null
        ? ""
        : `${Math.floor(data.duracaoSegundos / 60)}min ${data.duracaoSegundos % 60}s`;

    const texto = [
      "✅ *Control finalizado*",
      `Supervisor: ${supervisor}`,
      `Posto: ${data.postoNome || "Não informado"}`,
      `Cliente: ${cliente || "Não informado"}`,
      `Conformidade: ${data.percentual}%`,
      `Não conformes: ${data.naoConformes}`,
      ...(duracao ? [`Tempo de preenchimento: ${duracao}`] : []),
      `Data e hora: ${quando}`,
      `Relatório: ${LINK_RELATORIO}`,
    ].join("\n");

    const envio = await enviarMensagemEvolution(NUMERO_NOTIFICACAO_CONTROL, texto);
    console.log(
      "[control-notificacao] aviso de fim",
      JSON.stringify({ supervisor, posto: data.postoNome, ok: envio.ok, erro: envio.erro ?? null }),
    );
    return envio;
  });
