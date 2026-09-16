import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "solicitacoes-vagas";

export interface EnvioVagaInput {
  emailDestino: string;
  arquivo: string;
  pdfBase64: string;
  cargo: string;
  posto: string;
  localidade: string;
  salario: string;
  horario: string;
  dataInicio: string;
  solicitante: string;
  fiscalResponsavel: string;
  tipo: string;
  justificativa: string;
  atividade: string;
  perfil: string;
}

function validar(input: EnvioVagaInput): EnvioVagaInput {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.emailDestino ?? "").trim())) {
    throw new Error("E-mail de destino inválido.");
  }
  if (!input.pdfBase64) throw new Error("PDF da solicitação não recebido.");
  if (input.pdfBase64.length > 14_000_000) throw new Error("PDF muito grande para envio.");
  return input;
}

/** Guarda o PDF e registra a vaga como requisição aguardando aprovação. */
export const enviarSolicitacaoVagaPorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const caminho = `${context.userId}/${Date.now()}-${data.arquivo.replace(/[^\w.-]+/g, "_")}`;

    const upload = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(`Falha ao guardar o PDF: ${upload.error.message}`);

    const { analisarVaga } = await import("@/lib/vagas-aprovacao");
    const analise = analisarVaga({
      cargo: data.cargo,
      posto: data.posto,
      localidade: data.localidade,
      salario: data.salario,
      horario: data.horario,
      dataInicio: data.dataInicio,
      solicitante: data.solicitante,
      justificativa: data.justificativa,
      atividade: data.atividade,
      perfil: data.perfil,
    });

    const { error } = await supabaseAdmin.from("solicitacoes_vagas").insert({
      user_id: context.userId,
      cargo: data.cargo,
      posto: data.posto,
      localidade: data.localidade,
      salario: data.salario,
      horario: data.horario,
      data_inicio: data.dataInicio,
      solicitante: data.solicitante,
      fiscal_responsavel: data.fiscalResponsavel,
      tipo: data.tipo,
      justificativa: data.justificativa,
      atividade: data.atividade,
      perfil: data.perfil,
      arquivo: data.arquivo,
      caminho_pdf: caminho,
      email_destino: data.emailDestino.trim(),
      status: "pendente",
      aprovacao_automatica: false,
      motivo_decisao: analise.aprovada
        ? "Dados conferidos. Aguardando aprovação de Admin, Diretor ou Cordenador."
        : analise.motivo,
      pendencias: analise.pendencias,
      decidido_em: null,
    });
    if (error) throw new Error(`Falha ao registrar a solicitação: ${error.message}`);

    return { registrado: true as const, aguardandoAprovacao: true as const };
  });
