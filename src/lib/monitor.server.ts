/**
 * Núcleo do monitoramento central (Lovable Monitor).
 *
 * Toda comunicação com o painel central acontece somente aqui, no servidor:
 * chaves e tokens nunca chegam ao navegador. Nenhuma informação pessoal é
 * enviada — apenas status técnico, tempo de resposta, versão e verificações.
 */

import { sanitizeText, sanitizeUrl } from "./privacy/redaction";

export type CheckStatus = "ok" | "fail" | "unknown";

export type MonitorConfig = {
  apiUrl: string;
  projectId: string;
  projectName: string;
  apiKey: string;
  environment: string;
  publicUrl: string;
  version: string;
};

export type ResultadoSaude = {
  project_id: string;
  project_name: string;
  status: "healthy" | "unhealthy";
  version: string;
  latency_ms: number;
  timestamp: string;
  checks: { database: CheckStatus; auth: CheckStatus; edge_functions: CheckStatus };
};

const env = (nome: string) => (process.env[nome] ?? "").trim();

/** Lê a configuração do monitor a partir dos Secrets do backend. */
export function lerConfigMonitor(): { config: MonitorConfig; faltando: string[] } {
  const config: MonitorConfig = {
    apiUrl: env("MONITOR_API_URL").replace(/\/+$/, ""),
    projectId: env("MONITOR_PROJECT_ID"),
    projectName: env("MONITOR_PROJECT_NAME") || "CIOP",
    apiKey: env("MONITOR_API_KEY"),
    environment: env("PROJECT_ENVIRONMENT") || "production",
    publicUrl: env("PROJECT_PUBLIC_URL"),
    version: env("PROJECT_VERSION") || "1.0.0",
  };
  const faltando = (
    [
      ["MONITOR_API_URL", config.apiUrl],
      ["MONITOR_PROJECT_ID", config.projectId],
      ["MONITOR_API_KEY", config.apiKey],
    ] as const
  )
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);
  return { config, faltando };
}

/** fetch com tempo limite — nunca deixa o heartbeat pendurado. */
async function fetchComTimeout(url: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Executa as verificações de saúde: banco, autenticação e funções do servidor. */
export async function verificarSaude(): Promise<ResultadoSaude> {
  const inicio = Date.now();
  const { config } = lerConfigMonitor();

  let database: CheckStatus = "ok";
  let auth: CheckStatus = "ok";
  let edge_functions: CheckStatus = "ok";

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true });
    if (error) database = "fail";
  } catch {
    database = "fail";
  }

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const apikey = env("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !apikey) {
      auth = "unknown";
    } else {
      const res = await fetchComTimeout(
        `${supabaseUrl}/auth/v1/health`,
        { headers: { apikey } },
        5000,
      );
      auth = res.ok ? "ok" : "fail";
    }
  } catch {
    auth = "fail";
  }

  // As rotas de servidor deste projeto executam este próprio código: se
  // chegamos aqui, o runtime está ativo. A verificação vira "fail" apenas se
  // o runtime não conseguir montar o cliente do banco.
  if (database === "fail") edge_functions = "unknown";

  const critico = database === "fail" || auth === "fail";

  return {
    project_id: config.projectId,
    project_name: config.projectName,
    status: critico ? "unhealthy" : "healthy",
    version: config.version,
    latency_ms: Date.now() - inicio,
    timestamp: new Date().toISOString(),
    checks: { database, auth, edge_functions },
  };
}

type EnvioResultado = {
  ok: boolean;
  tentativas: number;
  erro?: string;
  statusHttp?: number;
  ignorado?: boolean;
  saude: ResultadoSaude;
};

/** Evita rajadas/duplicidade de heartbeat no mesmo worker. */
let ultimoEnvioMs = 0;
const JANELA_DEDUP_MS = 30_000;

/** Resume o corpo de erro sem despejar HTML de página 404 na interface. */
async function resumirErroHttp(res: Response, url: string): Promise<string> {
  let corpo = "";
  try {
    corpo = (await res.text()).trim();
  } catch {
    corpo = "";
  }
  const pareceHtml = /^<(?:!doctype|html)/i.test(corpo) || corpo.includes("<!DOCTYPE html");
  if (res.status === 404) {
    return sanitizeText(
      `HTTP 404 — endereço do painel central não encontrado (${sanitizeUrl(url)})`,
      300,
    );
  }
  if (pareceHtml || !corpo) {
    return sanitizeText(`HTTP ${res.status} em ${sanitizeUrl(url)}`, 300);
  }
  return sanitizeText(
    `HTTP ${res.status} ${corpo.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")}`,
    300,
  );
}

async function enviarAoMonitor(
  caminho: string,
  corpo: Record<string, unknown>,
  config: MonitorConfig,
): Promise<{ ok: boolean; tentativas: number; erro?: string; statusHttp?: number }> {
  let ultimoErro = "";
  let statusHttp: number | undefined;
  const base = config.apiUrl.replace(/\/+$/, "");
  // Alguns painéis expõem as rotas sob /api ou /functions/v1; tentamos as variações.
  const candidatos = base.endsWith("/api")
    ? [`${base}${caminho}`]
    : [`${base}${caminho}`, `${base}/api${caminho}`, `${base}/functions/v1${caminho}`];

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    for (const url of candidatos) {
      try {
        const res = await fetchComTimeout(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
            "x-project-id": config.projectId,
          },
          body: JSON.stringify(corpo),
        });
        statusHttp = res.status;
        if (res.ok) return { ok: true, tentativas: tentativa, statusHttp };
        ultimoErro = await resumirErroHttp(res, url);
        if (res.status !== 404) break; // só vale testar outra variação quando a rota não existe
      } catch (err) {
        ultimoErro = sanitizeText(err instanceof Error ? err.message : String(err), 300);
      }
    }
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 800));
  }
  return {
    ok: false,
    tentativas: 3,
    erro: ultimoErro || "falha desconhecida",
    ...(statusHttp !== undefined ? { statusHttp } : {}),
  };
}

/** Registra o projeto no painel central (idempotente pelo MONITOR_PROJECT_ID). */
export async function registrarProjeto(): Promise<{ ok: boolean; erro?: string }> {
  const { config, faltando } = lerConfigMonitor();
  if (faltando.length > 0)
    return { ok: false, erro: `Configuração incompleta: ${faltando.join(", ")}` };

  const saude = await verificarSaude();
  const envio = await enviarAoMonitor(
    "/projects/register",
    {
      project_id: config.projectId,
      project_name: config.projectName,
      environment: config.environment,
      public_url: sanitizeUrl(config.publicUrl),
      version: config.version,
      health_endpoint: `${sanitizeUrl(config.publicUrl)}/api/public/project-health`,
      status: saude.status,
      checks: saude.checks,
      timestamp: new Date().toISOString(),
    },
    config,
  );
  return envio.ok ? { ok: true } : { ok: false, ...(envio.erro ? { erro: envio.erro } : {}) };
}

/** Envia o heartbeat com verificação de saúde, deduplicação e três tentativas. */
export async function enviarHeartbeat(opcoes: { forcar?: boolean } = {}): Promise<EnvioResultado> {
  const { config, faltando } = lerConfigMonitor();
  const saude = await verificarSaude();

  if (faltando.length > 0) {
    return {
      ok: false,
      tentativas: 0,
      erro: `Configuração incompleta: ${faltando.join(", ")}`,
      saude,
    };
  }

  const agora = Date.now();
  if (!opcoes.forcar && agora - ultimoEnvioMs < JANELA_DEDUP_MS) {
    return { ok: true, tentativas: 0, ignorado: true, saude };
  }
  ultimoEnvioMs = agora;

  const envio = await enviarAoMonitor(
    "/heartbeat",
    {
      project_id: config.projectId,
      project_name: config.projectName,
      environment: config.environment,
      status: saude.status,
      latency_ms: saude.latency_ms,
      version: config.version,
      public_url: sanitizeUrl(config.publicUrl),
      checks: saude.checks,
      timestamp: saude.timestamp,
    },
    config,
  );

  await registrarHeartbeatLocal({ saude, envio, ambiente: config.environment });

  return {
    ok: envio.ok,
    tentativas: envio.tentativas,
    ...(envio.erro ? { erro: envio.erro } : {}),
    ...(envio.statusHttp !== undefined ? { statusHttp: envio.statusHttp } : {}),
    saude,
  };
}

async function registrarHeartbeatLocal(input: {
  saude: ResultadoSaude;
  envio: { ok: boolean; tentativas: number; erro?: string };
  ambiente: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("monitor_heartbeats").insert({
      status: input.saude.status,
      latency_ms: input.saude.latency_ms,
      versao: input.saude.version,
      ambiente: input.ambiente,
      tentativas: input.envio.tentativas,
      ok: input.envio.ok,
      erro: input.envio.erro ? sanitizeText(input.envio.erro, 300) : null,
      checks: input.saude.checks,
    });
  } catch {
    // registro de diagnóstico nunca interrompe o monitoramento
  }
}

/** Encaminha um erro técnico já sanitizado ao painel central. */
export async function encaminharErro(evento: {
  tipo: string;
  mensagem: string;
  rota?: string | null;
  statusHttp?: number | null;
  origem?: string | null;
}): Promise<boolean> {
  const { config, faltando } = lerConfigMonitor();
  if (faltando.length > 0) return false;
  const envio = await enviarAoMonitor(
    "/errors",
    {
      project_id: config.projectId,
      project_name: config.projectName,
      environment: config.environment,
      version: config.version,
      type: evento.tipo,
      message: evento.mensagem,
      route: evento.rota ?? null,
      http_status: evento.statusHttp ?? null,
      source: evento.origem ?? null,
      timestamp: new Date().toISOString(),
    },
    config,
  );
  return envio.ok;
}

/** Compara duas cadeias em tempo constante (evita ataques de temporização). */
export function comparaSegredo(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Assinatura HMAC-SHA256 em hexadecimal usando a chave do monitor. */
export async function assinaturaHmac(mensagem: string, chave: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
