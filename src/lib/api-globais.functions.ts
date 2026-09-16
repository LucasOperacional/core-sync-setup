import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Regra geral das APIs: quando o superadmin (ou admin/diretor) liga uma API,
 * a configuração é gravada em `app_config` e passa a valer para TODOS os
 * usuários e TODOS os cards do sistema.
 *
 * Toda falha aqui é silenciosa (nunca quebra a tela): se não houver
 * configuração global, cada card continua usando a configuração local.
 */

export type ProvedorApiGlobal = "gemini" | "openai" | "manus";

export const APIS_GLOBAIS: Record<
  ProvedorApiGlobal,
  { config: string; storage: string; label: string }
> = {
  gemini: {
    config: "api_global_gemini",
    storage: "gemini-api-config-v1",
    label: "IA Gemini",
  },
  openai: {
    config: "api_global_openai",
    storage: "openai-api-config-v1",
    label: "IA OpenAI",
  },
  manus: {
    config: "api_global_manus",
    storage: "manus-api-config-v1",
    label: "Manus AI",
  },
};

const PROVEDORES = Object.keys(APIS_GLOBAIS) as ProvedorApiGlobal[];

function provedorValido(valor: unknown): valor is ProvedorApiGlobal {
  return typeof valor === "string" && (PROVEDORES as string[]).includes(valor);
}

/** Lê as configurações globais de API (qualquer usuário autenticado). */
export const obterApisGlobais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const vazio: Record<ProvedorApiGlobal, string | null> = {
      gemini: null,
      openai: null,
      manus: null,
    };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const chaves = PROVEDORES.map((p) => APIS_GLOBAIS[p].config);
      const { data, error } = await supabaseAdmin
        .from("app_config")
        .select("chave,valor")
        .in("chave", chaves);
      if (error || !data) return vazio;
      for (const linha of data) {
        const provedor = PROVEDORES.find((p) => APIS_GLOBAIS[p].config === linha.chave);
        if (provedor) vazio[provedor] = (linha.valor ?? "").trim() || null;
      }
      return vazio;
    } catch {
      return vazio;
    }
  });

/**
 * Publica a configuração de uma API para todos os usuários.
 * Só admin/diretor conseguem gravar (regra do banco) — para os demais
 * a função apenas responde `publicado: false`, sem erro na tela.
 */
export const publicarApiGlobal = createServerFn({ method: "POST" })
  .inputValidator((data: { provedor: string; valor: string }) => {
    if (!provedorValido(data?.provedor)) throw new Error("Provedor inválido.");
    return { provedor: data.provedor, valor: String(data?.valor ?? "") };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    try {
      const { error } = await context.supabase.from("app_config").upsert(
        {
          chave: APIS_GLOBAIS[data.provedor].config,
          valor: data.valor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chave" },
      );
      return { publicado: !error };
    } catch {
      return { publicado: false };
    }
  });
