import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analisarVaga } from "@/lib/vagas-aprovacao";
import { assertAprovadorVagas } from "@/lib/vagas-guard.server";

export interface VagaSolicitacao {
  id: string;
  cargo: string;
  posto: string | null;
  localidade: string | null;
  salario: string | null;
  horario: string | null;
  data_inicio: string | null;
  solicitante: string | null;
  fiscal_responsavel: string | null;
  tipo: string | null;
  justificativa: string | null;
  atividade: string | null;
  perfil: string | null;
  arquivo: string | null;
  caminho_pdf: string | null;
  email_destino: string | null;
  status: string;
  aprovacao_automatica: boolean;
  motivo_decisao: string | null;
  pendencias: string[];
  decidido_em: string | null;
  created_at: string;
}

const CAMPOS =
  "id,cargo,posto,localidade,salario,horario,data_inicio,solicitante,fiscal_responsavel,tipo,justificativa,atividade,perfil,arquivo,caminho_pdf,email_destino,status,aprovacao_automatica,motivo_decisao,pendencias,decidido_em,created_at";

type ResultadoEmail =
  | { enviado: true }
  | {
      enviado: false;
      motivo:
        | "sem_destinatario"
        | "dominio_pendente"
        | "envio_desativado"
        | "destinatario_bloqueado"
        | "falha";
      detalhe?: string | undefined;
    };

/** E-mail configurado no painel admin para receber as vagas aprovadas. */
async function destinoConfigurado(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("valor")
      .eq("chave", "vagas_email_destino")
      .maybeSingle();
    return String(data?.valor ?? "").trim();
  } catch {
    return "";
  }
}

/** Envia o e-mail da vaga aprovada com o link do PDF. */
async function enviarEmailAprovacao(
  vaga: VagaSolicitacao,
  chaveEnvio?: string,
): Promise<ResultadoEmail> {
  const destino = (await destinoConfigurado()) || String(vaga.email_destino ?? "").trim();
  if (!destino) return { enviado: false, motivo: "sem_destinatario" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

  let linkPdf: string | undefined;
  if (vaga.caminho_pdf) {
    const assinado = await supabaseAdmin.storage
      .from("solicitacoes-vagas")
      .createSignedUrl(vaga.caminho_pdf, 60 * 60 * 24 * 7);
    linkPdf = assinado.data?.signedUrl;
  }

  try {
    const resultado = await sendTemplateEmail("solicitacao-vaga", destino, {
      idempotencyKey: chaveEnvio ?? `vaga-aprovada-${vaga.id}`,
      templateData: {
        cargo: vaga.cargo,
        posto: vaga.posto,
        localidade: vaga.localidade,
        salario: vaga.salario,
        horario: vaga.horario,
        dataInicio: vaga.data_inicio,
        solicitante: vaga.solicitante,
        tipo: vaga.tipo,
        justificativa: vaga.justificativa,
        atividade: vaga.atividade,
        perfil: vaga.perfil,
        linkPdf,
        arquivo: vaga.arquivo,
      },
    });
    if (!resultado.sent) return { enviado: false, motivo: "destinatario_bloqueado" };
    return { enviado: true };
  } catch (erro) {
    const codigo = (erro as { code?: string } | null)?.code;
    const detalhe = (erro as Error | null)?.message;
    if (codigo === "domain_not_verified")
      return { enviado: false, motivo: "dominio_pendente", detalhe };
    if (codigo === "emails_disabled")
      return { enviado: false, motivo: "envio_desativado", detalhe };
    if (codigo === "domain_not_found" || codigo === "sender_domain_not_found") {
      return { enviado: false, motivo: "dominio_pendente", detalhe };
    }
    return { enviado: false, motivo: "falha", detalhe };
  }
}

/** Reenvia o e-mail de uma vaga já existente. */
export const reenviarEmailVaga = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Vaga não informada.");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAprovadorVagas(context);

    const { data: vagaData, error: erroVaga } = await context.supabase
      .from("solicitacoes_vagas")
      .select(CAMPOS)
      .eq("id", data.id)
      .maybeSingle();
    if (erroVaga) throw new Error(erroVaga.message);
    if (!vagaData) throw new Error("Vaga não encontrada.");

    const vaga = vagaData as unknown as VagaSolicitacao;
    const destino = (await destinoConfigurado()) || String(vaga.email_destino ?? "").trim();
    const envio = await enviarEmailAprovacao(vaga, `vaga-reenvio-${vaga.id}-${Date.now()}`);
    if (!envio.enviado) {
      const motivos: Record<string, string> = {
        sem_destinatario: "Nenhum e-mail de destino está configurado no painel administrativo.",
        dominio_pendente:
          "O domínio de envio de e-mails ainda não está configurado/verificado. Configure o domínio de e-mail para liberar os envios.",
        envio_desativado: "O envio de e-mails está desativado no projeto.",
        destinatario_bloqueado: `O endereço ${destino || "de destino"} está bloqueado para recebimento.`,
        falha: "O serviço de e-mail recusou o envio.",
      };
      const base = motivos[envio.motivo] ?? "Não foi possível reenviar o e-mail.";
      throw new Error(envio.detalhe ? `${base} (${envio.detalhe})` : base);
    }
    return { enviado: true as const, destino };
  });

/** Lista as vagas abertas para aprovação (Admin, Diretor, Cordenador). */
export const listarVagasAprovacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAprovadorVagas(context);
    const { data, error } = await context.supabase
      .from("solicitacoes_vagas")
      .select(CAMPOS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as VagaSolicitacao[];
  });

/** Reaplica as regras automáticas nas vagas pendentes e envia o e-mail das aprovadas. */
export const reavaliarVagasPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAprovadorVagas(context);
    const { data, error } = await context.supabase
      .from("solicitacoes_vagas")
      .select(CAMPOS)
      .eq("status", "pendente")
      .limit(200);
    if (error) throw new Error(error.message);

    let aprovadas = 0;
    let emailsEnviados = 0;
    for (const vaga of (data ?? []) as unknown as VagaSolicitacao[]) {
      const analise = analisarVaga({
        cargo: vaga.cargo,
        posto: vaga.posto,
        localidade: vaga.localidade,
        salario: vaga.salario,
        horario: vaga.horario,
        dataInicio: vaga.data_inicio,
        solicitante: vaga.solicitante,
        justificativa: vaga.justificativa,
        atividade: vaga.atividade,
        perfil: vaga.perfil,
      });
      if (!analise.aprovada) {
        await context.supabase
          .from("solicitacoes_vagas")
          .update({
            status: "pendente",
            aprovacao_automatica: false,
            motivo_decisao: analise.motivo,
            pendencias: analise.pendencias,
            decidido_em: null,
          })
          .eq("id", vaga.id);
        continue;
      }

      const envio = await enviarEmailAprovacao(vaga);
      await context.supabase
        .from("solicitacoes_vagas")
        .update({
          status: "aprovada",
          aprovacao_automatica: true,
          motivo_decisao: envio.enviado
            ? `${analise.motivo} E-mail enviado ao destinatário.`
            : `${analise.motivo} E-mail não enviado (${envio.motivo}).`,
          pendencias: analise.pendencias,
          decidido_em: new Date().toISOString(),
          decidido_por: context.userId,
        })
        .eq("id", vaga.id);
      aprovadas += 1;
      if (envio.enviado) emailsEnviados += 1;
    }
    return { aprovadas, emailsEnviados, analisadas: (data ?? []).length };
  });

/** Aprova ou recusa a requisição; ao aprovar, envia o e-mail automaticamente. */
export const decidirVaga = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decisao: "aprovada" | "recusada"; motivo?: string }) => {
    if (!data?.id) throw new Error("Vaga não informada.");
    if (data.decisao !== "aprovada" && data.decisao !== "recusada") {
      throw new Error("Decisão inválida.");
    }
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAprovadorVagas(context);

    const { data: vagaData, error: erroVaga } = await context.supabase
      .from("solicitacoes_vagas")
      .select(CAMPOS)
      .eq("id", data.id)
      .maybeSingle();
    if (erroVaga) throw new Error(erroVaga.message);
    if (!vagaData) throw new Error("Vaga não encontrada.");
    const vaga = vagaData as unknown as VagaSolicitacao;

    let envio: ResultadoEmail | null = null;
    if (data.decisao === "aprovada") {
      envio = await enviarEmailAprovacao(vaga);
    }

    const base =
      data.motivo?.trim() ||
      (data.decisao === "aprovada" ? "Aprovada manualmente." : "Recusada manualmente.");
    const motivo =
      envio === null
        ? base
        : envio.enviado
          ? `${base} E-mail enviado para ${vaga.email_destino}.`
          : `${base} E-mail não enviado (${envio.motivo}).`;

    const { error } = await context.supabase
      .from("solicitacoes_vagas")
      .update({
        status: data.decisao,
        aprovacao_automatica: false,
        motivo_decisao: motivo,
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      email: envio ? (envio.enviado ? ("enviado" as const) : envio.motivo) : null,
    };
  });

/** Gera um link temporário para o PDF da solicitação. */
export const linkPdfVaga = createServerFn({ method: "POST" })
  .inputValidator((data: { caminho: string }) => {
    if (!data?.caminho) throw new Error("Arquivo não informado.");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAprovadorVagas(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assinado, error } = await supabaseAdmin.storage
      .from("solicitacoes-vagas")
      .createSignedUrl(data.caminho, 60 * 10);
    if (error || !assinado?.signedUrl) throw new Error("Não foi possível abrir o PDF.");
    return { url: assinado.signedUrl };
  });

/** Fecha (encerra) as vagas informadas — usado nos cards por posto do RH. */
export const fecharVagas = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[]; posto?: string }) => {
    if (!Array.isArray(data?.ids) || data.ids.length === 0) {
      throw new Error("Nenhuma vaga informada.");
    }
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAprovadorVagas(context);
    const { error } = await context.supabase
      .from("solicitacoes_vagas")
      .update({
        status: "fechada",
        motivo_decisao: `Vaga fechada${data.posto ? ` no posto ${data.posto}` : ""}.`,
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
      })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { fechadas: data.ids.length };
  });

/** Remove todas as vagas registradas (limpeza da lista de aprovação). */

export const limparVagasAprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAprovadorVagas(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existentes, error: erroLista } = await supabaseAdmin
      .from("solicitacoes_vagas")
      .select("id");
    if (erroLista) throw new Error(erroLista.message);
    const total = existentes?.length ?? 0;
    if (total === 0) return { removidas: 0 };
    const { error } = await supabaseAdmin
      .from("solicitacoes_vagas")
      .delete()
      .in(
        "id",
        existentes!.map((v) => v.id),
      );
    if (error) throw new Error(error.message);
    return { removidas: total };
  });
