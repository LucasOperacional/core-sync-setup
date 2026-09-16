/** Busca o rastreio perto dos postos da NEXTI e lembra do Relatório de Supervisão de Campo. */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";
import type { LembreteRastreio } from "./rastreio-lembrete.server";

export type ResultadoRastreioLembrete = {
  escopo: "eu" | "todos";
  postosConsultados: number;
  lembretes: LembreteRastreio[];
};

type Entrada = {
  escopo?: "eu" | "todos";
  enviar?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export const verificarRastreioPerto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Entrada) => ({
    escopo: input?.escopo === "todos" ? ("todos" as const) : ("eu" as const),
    enviar: input?.enviar !== false,
    latitude:
      typeof input?.latitude === "number" && Number.isFinite(input.latitude)
        ? input.latitude
        : null,
    longitude:
      typeof input?.longitude === "number" && Number.isFinite(input.longitude)
        ? input.longitude
        : null,
  }))
  .handler(async ({ data, context }): Promise<ResultadoRastreioLembrete> => {
    const { verificarProximidadeEAvisar } = await import("./rastreio-lembrete.server");

    let userIds = [context.userId];
    let posicaoAgora: { latitude: number; longitude: number } | null = null;

    if (data.escopo === "todos") {
      await assertAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const desde = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: posicoes } = await supabaseAdmin
        .from("rastreamento_localizacoes")
        .select("user_id")
        .gte("capturado_em", desde)
        .limit(5000);
      userIds = [...new Set((posicoes ?? []).map((p) => String(p.user_id)))];
    } else if (data.latitude !== null && data.longitude !== null) {
      posicaoAgora = { latitude: data.latitude, longitude: data.longitude };
    }

    if (userIds.length === 0) {
      return { escopo: data.escopo, postosConsultados: 0, lembretes: [] };
    }

    const resultado = await verificarProximidadeEAvisar({
      userIds,
      posicaoAgora,
      enviar: data.enviar,
    });

    return {
      escopo: data.escopo,
      postosConsultados: resultado.postos,
      lembretes: resultado.lembretes,
    };
  });
