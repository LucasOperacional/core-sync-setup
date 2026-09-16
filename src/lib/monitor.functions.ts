import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";
import { sanitizeUrl } from "./privacy/redaction";

export type StatusMonitor = {
  configurado: boolean;
  faltando: string[];
  projectId: string;
  projectName: string;
  ambiente: string;
  versao: string;
  urlPublica: string;
  status: string | null;
  latencyMs: number | null;
  ultimoHeartbeat: string | null;
  ultimoHeartbeatOk: boolean | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
  falhasConsecutivas: number;
};

/** Situação atual da integração com o painel central (somente administradores). */
export const statusMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatusMonitor> => {
    await assertAdmin(context);
    const { lerConfigMonitor } = await import("./monitor.server");
    const { config, faltando } = lerConfigMonitor();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: batidas }, { data: erros }] = await Promise.all([
      supabaseAdmin
        .from("monitor_heartbeats")
        .select("status, latency_ms, ok, erro, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("monitor_errors")
        .select("mensagem, created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const lista = batidas ?? [];
    const ultima = lista[0];
    let falhas = 0;
    for (const b of lista) {
      if (b.ok) break;
      falhas += 1;
    }

    return {
      configurado: faltando.length === 0,
      faltando,
      projectId: config.projectId,
      projectName: config.projectName,
      ambiente: config.environment,
      versao: config.version,
      urlPublica: sanitizeUrl(config.publicUrl),
      status: ultima?.status ?? null,
      latencyMs: ultima?.latency_ms ?? null,
      ultimoHeartbeat: ultima?.created_at ?? null,
      ultimoHeartbeatOk: ultima ? ultima.ok : null,
      ultimoErro: erros?.[0]?.mensagem ?? ultima?.erro ?? null,
      ultimoErroEm: erros?.[0]?.created_at ?? null,
      falhasConsecutivas: falhas,
    };
  });

export type TesteConexao = {
  resultado: "conectado" | "falha" | "incompleto";
  mensagem: string;
  latencyMs: number | null;
  status: string | null;
};

/** Testa a conexão com o painel central e registra o projeto se necessário. */
export const testarConexaoMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TesteConexao> => {
    await assertAdmin(context);
    const { lerConfigMonitor, registrarProjeto, verificarSaude } = await import("./monitor.server");
    const { faltando } = lerConfigMonitor();
    if (faltando.length > 0) {
      return {
        resultado: "incompleto",
        mensagem: `Configuração incompleta: ${faltando.join(", ")}.`,
        latencyMs: null,
        status: null,
      };
    }
    const saude = await verificarSaude();
    const registro = await registrarProjeto();
    return registro.ok
      ? {
          resultado: "conectado",
          mensagem: "Projeto registrado e conectado ao painel central.",
          latencyMs: saude.latency_ms,
          status: saude.status,
        }
      : {
          resultado: "falha",
          mensagem: registro.erro ?? "Não foi possível falar com o painel central.",
          latencyMs: saude.latency_ms,
          status: saude.status,
        };
  });

/** Envia um heartbeat imediatamente (botão do painel de administração). */
export const enviarHeartbeatAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { enviarHeartbeat } = await import("./monitor.server");
    const r = await enviarHeartbeat({ forcar: true });
    return {
      ok: r.ok,
      tentativas: r.tentativas,
      status: r.saude.status,
      latencyMs: r.saude.latency_ms,
      checks: r.saude.checks,
      erro: r.erro ?? null,
    };
  });
