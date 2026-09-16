/**
 * Privacidade — auditoria de acesso e expurgo automático.
 *
 * A auditoria grava somente quem acessou, quando, qual módulo e a finalidade.
 * O conteúdo do documento NUNCA é registrado.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeText } from "./privacy/redaction";
import { assertAdmin } from "./usuarios-guard.server";

export type AcessoDocumentoInput = {
  modulo: string;
  acao?: string;
  finalidade?: string;
  /** Identificador interno aleatório — nunca CPF, matrícula ou nome. */
  referenciaInterna?: string;
};

/** Registra o acesso a um documento sensível (sem qualquer conteúdo). */
export const registrarAcessoDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AcessoDocumentoInput) => {
    if (!input?.modulo) throw new Error("Módulo inválido.");
    return {
      modulo: sanitizeText(input.modulo, 60),
      acao: sanitizeText(input.acao ?? "leitura", 60),
      finalidade: sanitizeText(input.finalidade ?? "execucao_contrato", 200),
      referenciaInterna: (input.referenciaInterna ?? "").replace(/[^\w-]/g, "").slice(0, 64),
    };
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc(
        "privacidade_registrar_acesso" as never,
        {
          _modulo: data.modulo,
          _acao: data.acao,
          _finalidade: data.finalidade,
          _referencia_interna: data.referenciaInterna || null,
        } as never,
      );
      return { ok: true };
    } catch {
      // A auditoria nunca interrompe a operação do usuário.
      return { ok: false };
    }
  });

/** Apaga dados técnicos e de monitoramento vencidos (prazos da área de LGPD). */
export const expurgarDadosVencidos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; resumo: Record<string, number> }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("privacidade_expurgar_dados" as never);
    if (error) throw new Error("Não foi possível concluir o expurgo agora.");
    const apagados = ((data ?? {}) as { apagados?: Record<string, unknown> }).apagados ?? {};
    const resumo: Record<string, number> = {};
    for (const [tabela, total] of Object.entries(apagados)) resumo[tabela] = Number(total ?? 0);
    return { ok: true, resumo };
  });
