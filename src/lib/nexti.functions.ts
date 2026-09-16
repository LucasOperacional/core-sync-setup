import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, type ServerGuardContext } from "@/lib/security-guard.server";

const DEFAULT_BASE_URL = "https://api.nexti.com";
const DEFAULT_TOKEN_ENDPOINT = "/security/oauth/token";
const DEFAULT_TEST_ENDPOINT = "/api/persons/all?size=1";
const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type NextiResult = {
  ok: boolean;
  message?: string | undefined;
  error?: string | undefined;
  causeCode?: string | undefined;
  httpStatus?: number | undefined;
  endpoint?: string | undefined;
  latencyMs?: number | undefined;
  attempts?: number | undefined;
  checkedAt?: string | undefined;
  data?: string | undefined;
  details?: Record<string, string | number | boolean | null> | undefined;
};

type NextiInput = {
  action?: "testConnection" | "request" | "diagnostics";
  endpoint?: string;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

type NextiError = Error & {
  causeCode?: string | undefined;
  httpStatus?: number | undefined;
  nextiResponse?: string | undefined;
};

function fail(
  message: string,
  causeCode: string,
  httpStatus: number,
  nextiResponse?: string,
): NextiError {
  return Object.assign(new Error(message), { causeCode, httpStatus, nextiResponse });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export type NextiConfig = {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  token: string;
  tokenEndpoint: string;
  testEndpoint: string;
};

type DbConfigRow = {
  enabled?: boolean | null;
  base_url?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  username?: string | null;
  token?: string | null;
  token_endpoint?: string | null;
  test_endpoint?: string | null;
};

/**
 * Cliente server-only usado para ler/gravar a configuração da NEXTI.
 * A tabela `nexti_config` é restrita a admin no banco; sem isso qualquer
 * outro papel (diretor, supervisor, coordenador, usuário) ficava sem
 * credenciais e a integração falhava. O acesso continua só no servidor.
 */
async function configClient(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadConfig(_supabase?: unknown): Promise<NextiConfig> {
  let row: DbConfigRow | null = null;
  try {
    const supabase = await configClient();
    const { data } = await (supabase as any)
      .from("nexti_config")
      .select(
        "enabled, base_url, client_id, client_secret, username, token, token_endpoint, test_endpoint",
      )
      .eq("id", true)
      .maybeSingle();
    row = (data as DbConfigRow | null) ?? null;
  } catch {
    row = null;
  }

  const pick = (dbValue: string | null | undefined, envName: string) =>
    (dbValue ?? "").trim() || env(envName);

  // A URL base precisa ser só a origem (https://api.nexti.com). Quando alguém
  // salva a URL completa do token, todos os caminhos ficavam prefixados com
  // /security/oauth/token e a NEXTI respondia 403.
  const baseUrlBruta = pick(row?.base_url, "NEXTI_BASE_URL") || DEFAULT_BASE_URL;
  let baseUrl = DEFAULT_BASE_URL;
  try {
    const parsed = new URL(baseUrlBruta);
    baseUrl = parsed.pathname.includes("/security/oauth/token")
      ? parsed.origin
      : `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    baseUrl = DEFAULT_BASE_URL;
  }

  return {
    enabled: row?.enabled !== false,
    baseUrl,
    clientId: pick(row?.client_id, "NEXTI_CLIENT_ID"),
    clientSecret: pick(row?.client_secret, "NEXTI_CLIENT_SECRET"),
    username: pick(row?.username, "NEXTI_USERNAME"),
    token: pick(row?.token, "NEXTI_TOKEN"),
    tokenEndpoint: pick(row?.token_endpoint, "NEXTI_TOKEN_ENDPOINT") || DEFAULT_TOKEN_ENDPOINT,
    testEndpoint: pick(row?.test_endpoint, "NEXTI_TEST_ENDPOINT") || DEFAULT_TEST_ENDPOINT,
  };
}

function requireConfigValue(
  config: NextiConfig,
  key: Exclude<keyof NextiConfig, "enabled">,
  label: string,
): string {
  const value = config[key].trim();
  if (!value) {
    throw fail(
      `${label} não está configurada. Preencha no card de configuração e salve.`,
      "missing_config",
      503,
    );
  }
  return value;
}

export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw fail("URL base da NEXTI inválida.", "invalid_url", 400);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw fail("URL base da NEXTI deve usar HTTP ou HTTPS.", "invalid_url", 400);
  }
  // Correção automática: se o usuário colou a URL completa do token
  // (ex.: https://api.nexti.com/security/oauth/token?...) no campo de URL base,
  // mantém apenas a origem.
  if (parsed.pathname.includes("/security/oauth/token")) {
    return parsed.origin;
  }
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw fail(
      "Endpoint da NEXTI inválido. Use somente caminho relativo, como /api/persons?size=1.",
      "invalid_endpoint",
      400,
    );
  }
  // Tolerante a URL completa colada no campo: extrai apenas o caminho.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname || "/";
    } catch {
      throw fail("Endpoint da NEXTI inválido.", "invalid_endpoint", 400);
    }
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildUrl(baseUrl: string, endpoint: string, query?: NextiInput["query"]): string {
  const url = new URL(`${baseUrl}${normalizeEndpoint(endpoint)}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Tenta extrair a explicação que a NEXTI mandou no corpo da resposta. */
function mensagemDoCorpo(body: string): string {
  const texto = String(body ?? "").trim();
  if (!texto) return "";
  let dado: unknown = texto;
  try {
    dado = JSON.parse(texto);
  } catch {
    // corpo em texto puro
  }
  const partes: string[] = [];
  const coletar = (valor: unknown, profundidade = 0) => {
    if (partes.length >= 3 || profundidade > 4) return;
    if (typeof valor === "string") {
      const v = valor.trim();
      if (v && v.length < 300 && !partes.includes(v)) partes.push(v);
      return;
    }
    if (Array.isArray(valor)) {
      for (const item of valor) coletar(item, profundidade + 1);
      return;
    }
    if (valor && typeof valor === "object") {
      const rec = valor as Record<string, unknown>;
      for (const chave of [
        "message",
        "mensagem",
        "error_description",
        "errorMessage",
        "detail",
        "details",
        "errors",
        "error",
        "value",
      ]) {
        if (chave in rec) coletar(rec[chave], profundidade + 1);
      }
      return;
    }
  };
  coletar(dado);
  if (partes.length === 0 && typeof dado === "string") partes.push(dado.slice(0, 300));
  return partes.join(" ").trim();
}

function comDetalhe(cause: string, body: string): string {
  const detalhe = mensagemDoCorpo(body);
  return detalhe ? `${cause} Detalhe da NEXTI: ${detalhe}` : cause;
}

function classifyHttpError(status: number, body: string): { code: string; cause: string } {
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return {
      code: "invalid_request",
      cause: comDetalhe(
        `A NEXTI recusou a requisição (${status}). Verifique os dados enviados (CPF, PIS, matrícula, empresa, cargo, posto e escala) ou o endpoint informado.`,
        body,
      ),
    };
  }
  if (status === 401) {
    return {
      code: "authentication",
      cause:
        "Autenticação recusada pela NEXTI. Verifique Client ID, Client Secret, usuário, token e endpoint de autenticação.",
    };
  }
  if (status === 403) {
    return {
      code: "permission",
      cause:
        "A NEXTI negou acesso (403). Verifique se o Client ID/Secret estão corretos em Configurações > API de Integração e se o endpoint de teste está certo (ex.: /persons?size=1).",
    };
  }
  if (status === 408) return { code: "timeout", cause: "Tempo limite excedido pela NEXTI." };
  if (status === 429)
    return { code: "rate_limit", cause: "Limite de requisições da NEXTI atingido." };
  if (status >= 500)
    return {
      code: "server_unavailable",
      cause: comDetalhe(`Servidor da NEXTI indisponível ou instável (${status}).`, body),
    };
  if (body.toLowerCase().includes("cors")) {
    return {
      code: "cors",
      cause: "Resposta indica bloqueio de CORS. A chamada permanece intermediada pelo backend.",
    };
  }
  return { code: "nexti_error", cause: "A NEXTI retornou erro para a requisição." };
}

function classifyNetworkError(error: unknown): { code: string; cause: string; status: number } {
  const name = (error as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return {
      code: "timeout",
      cause: `Timeout: a NEXTI não respondeu em até ${Math.round(TIMEOUT_MS / 1000)} segundos.`,
      status: 504,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("invalid url")) {
    return { code: "invalid_url", cause: "URL base ou endpoint da NEXTI inválido.", status: 400 };
  }
  if (
    lower.includes("dns") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("fetch")
  ) {
    return {
      code: "server_unavailable",
      cause:
        "Não foi possível alcançar o servidor da NEXTI pelo backend. Verifique URL, DNS, firewall ou indisponibilidade do serviço.",
      status: 503,
    };
  }
  return {
    code: "network_error",
    cause: "Erro de comunicação com a NEXTI pelo backend.",
    status: 503,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function authenticate(config: NextiConfig): Promise<string> {
  const baseUrl = config.baseUrl;
  const clientId = requireConfigValue(config, "clientId", "NEXTI_CLIENT_ID");
  const clientSecret = requireConfigValue(config, "clientSecret", "NEXTI_CLIENT_SECRET");
  const username = config.username.trim();
  const passwordOrToken = config.token.trim();

  // Padrão documentado pela Nexti: OAuth2 client_credentials com client_id e
  // client_secret enviados na query string do endpoint de token.
  // Quando usuário/senha de integração estiverem preenchidos, usa-se o grant
  // "password" (também aceito pela plataforma).
  const usePassword = Boolean(username && passwordOrToken);

  const query: Record<string, string> = {
    grant_type: usePassword ? "password" : "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  };
  if (usePassword) {
    query["username"] = username;
    query["password"] = passwordOrToken;
  }

  // Endpoint de token sem query string (formato aceito pelo Spring Security da Nexti).
  const tokenUrlLimpo = buildUrl(baseUrl, config.tokenEndpoint);
  const tokenUrlComQuery = buildUrl(baseUrl, config.tokenEndpoint, query);

  const basic = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  const formBody: Record<string, string> = {
    grant_type: query["grant_type"] ?? "client_credentials",
  };
  if (usePassword) {
    formBody["username"] = username;
    formBody["password"] = passwordOrToken;
  }

  // Formato validado em produção: HTTP Basic (client_id:client_secret) +
  // grant_type no corpo x-www-form-urlencoded. Os demais são fallbacks.
  const tentativas: Array<{ url: string; init: RequestInit }> = [
    {
      url: tokenUrlLimpo,
      init: {
        method: "POST",
        headers: {
          Authorization: basic,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams(formBody).toString(),
      },
    },
    {
      url: tokenUrlComQuery,
      init: {
        method: "POST",
        headers: { Authorization: basic, Accept: "application/json" },
      },
    },
    { url: tokenUrlComQuery, init: { method: "POST", headers: { Accept: "application/json" } } },
    { url: tokenUrlComQuery, init: { method: "GET", headers: { Accept: "application/json" } } },
  ];

  let response: Response | null = null;
  let rawText = "";
  let ultimoErro: { status: number; body: string } | null = null;

  for (const tentativa of tentativas) {
    try {
      const res = await fetchWithTimeout(tentativa.url, tentativa.init);
      const text = await res.text().catch(() => "");
      if (res.ok) {
        response = res;
        rawText = text;
        break;
      }
      ultimoErro = { status: res.status, body: text };
    } catch (error) {
      const classified = classifyNetworkError(error);
      ultimoErro = { status: classified.status, body: classified.cause };
    }
  }

  if (!response) {
    const status = ultimoErro?.status ?? 503;
    const body = ultimoErro?.body ?? "";
    const classified = classifyHttpError(status, body);
    throw fail(classified.cause, classified.code, status, body.slice(0, 500));
  }

  if (!response.ok) {
    const classified = classifyHttpError(response.status, rawText);
    throw fail(classified.cause, classified.code, response.status, rawText.slice(0, 500));
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw fail(
      "A NEXTI respondeu à autenticação, mas o corpo não é JSON válido.",
      "authentication",
      502,
    );
  }

  const accessToken =
    typeof data["access_token"] === "string"
      ? (data["access_token"] as string)
      : typeof data["token"] === "string"
        ? (data["token"] as string)
        : "";

  if (!accessToken) {
    throw fail("A NEXTI respondeu à autenticação sem access_token/token.", "authentication", 502);
  }

  return accessToken;
}

export async function requestNexti(options: {
  config: NextiConfig;
  endpoint: string;
  method: HttpMethod;
  query?: NextiInput["query"];
  body?: unknown;
}): Promise<{ status: number; data: unknown; latencyMs: number; attempts: number }> {
  const { config, endpoint, method, query, body } = options;
  if (config.enabled === false) {
    throw fail(
      "A integração com a API NEXTI está desligada. Ligue a API no card de configuração (IA Operacional) para voltar a sincronizar.",
      "api_disabled",
      503,
    );
  }
  const baseUrl = config.baseUrl;
  const url = buildUrl(baseUrl, endpoint, query);
  const start = Date.now();
  let token = await authenticate(config);
  let refreshed = false;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body ?? {}) }),
      });

      const text = await response.text().catch(() => "");
      lastStatus = response.status;
      lastBody = text;

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        token = await authenticate(config);
        continue;
      }

      if (response.ok) {
        return {
          status: response.status,
          data: parseBody(text),
          latencyMs: Date.now() - start,
          attempts: attempt,
        };
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
        const classified = classifyHttpError(response.status, text);
        throw fail(classified.cause, classified.code, response.status, text.slice(0, 500));
      }

      await sleep(500 * attempt ** 2);
    } catch (error) {
      if ((error as NextiError).httpStatus) throw error;

      const classified = classifyNetworkError(error);
      lastStatus = classified.status;
      lastBody = classified.cause;

      if (!RETRYABLE_STATUSES.has(classified.status) || attempt === MAX_RETRIES) {
        throw fail(classified.cause, classified.code, classified.status, lastBody);
      }

      await sleep(500 * attempt ** 2);
    }
  }

  const classified = classifyHttpError(lastStatus || 503, lastBody);
  throw fail(classified.cause, classified.code, lastStatus || 503, lastBody.slice(0, 500));
}

function diagnostics(config: NextiConfig) {
  let host: string | null = null;
  try {
    host = config.baseUrl ? new URL(config.baseUrl).host : null;
  } catch {
    host = null;
  }
  return {
    nextiBaseUrlConfigured: Boolean(config.baseUrl),
    nextiClientIdConfigured: Boolean(config.clientId),
    nextiClientSecretConfigured: Boolean(config.clientSecret),
    nextiUsernameConfigured: Boolean(config.username),
    nextiTokenConfigured: Boolean(config.token),
    tokenEndpoint: config.tokenEndpoint,
    testEndpoint: config.testEndpoint,
    baseUrlHost: host,
    timeoutMs: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  };
}

export const callNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NextiInput | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<NextiResult> => {
    await enforceRateLimit(context as unknown as ServerGuardContext, "nexti.api", 20, 60);
    const action = data.action ?? "testConnection";
    const checkedAt = new Date().toISOString();

    try {
      const config = await loadConfig((context as any).supabase);
      const baseUrl = normalizeBaseUrl(requireConfigValue(config, "baseUrl", "NEXTI_BASE_URL"));
      config.baseUrl = baseUrl;

      if (action === "diagnostics") {
        return {
          ok: true,
          message: "Backend da integração NEXTI acessível.",
          checkedAt,
          details: diagnostics(config),
        };
      }

      const method = data.method ?? "GET";

      // No teste de conexão, se o endpoint configurado falhar com 403/404,
      // tenta caminhos alternativos conhecidos da API Nexti.
      const endpointsParaTestar =
        action === "testConnection"
          ? [config.testEndpoint, "/api/persons/all?size=1", "/persons/all?size=1"].filter(
              (e, i, arr) => arr.indexOf(e) === i,
            )
          : [data.endpoint || DEFAULT_TEST_ENDPOINT];

      let result: Awaited<ReturnType<typeof requestNexti>> | null = null;
      let endpointUsado = endpointsParaTestar[0]!;
      let ultimoErro: NextiError | null = null;

      for (const endpoint of endpointsParaTestar) {
        try {
          result = await requestNexti({
            config,
            endpoint,
            method,
            ...(data.query ? { query: data.query } : {}),
            ...(data.body !== undefined ? { body: data.body } : {}),
          });
          endpointUsado = endpoint;
          break;
        } catch (error) {
          const err = error as NextiError;
          ultimoErro = err;
          // Só tenta o próximo caminho quando o problema parece ser o endpoint.
          if (action !== "testConnection" || ![403, 404, 405].includes(err.httpStatus ?? 0)) {
            throw err;
          }
        }
      }

      if (!result) throw ultimoErro ?? fail("Falha ao consultar a NEXTI.", "nexti_error", 503);
      const endpoint = endpointUsado;

      return {
        ok: true,
        ...(action === "testConnection"
          ? { message: "Conexão com a NEXTI realizada com sucesso" }
          : {}),
        httpStatus: result.status,
        endpoint,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        checkedAt,
        ...(action === "testConnection" ? {} : { data: JSON.stringify(result.data ?? null) }),
      };
    } catch (error) {
      const err = error as NextiError;
      let diag: ReturnType<typeof diagnostics> | undefined;
      try {
        diag = diagnostics(await loadConfig((context as any).supabase));
      } catch {
        diag = undefined;
      }
      const details: Record<string, string | number | boolean | null> = { ...(diag ?? {}) };
      if (err.nextiResponse) details["nextiResponse"] = err.nextiResponse;
      return {
        ok: false,
        error: err.message || "Erro desconhecido ao acessar a NEXTI.",
        causeCode: err.causeCode ?? "internal_error",
        ...(err.httpStatus ? { httpStatus: err.httpStatus } : {}),
        checkedAt,
        details,
      };
    }
  });

export type NextiConfigValues = {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  token: string;
  tokenEndpoint: string;
  testEndpoint: string;
};

type SaveConfigInput = Partial<Record<Exclude<keyof NextiConfigValues, "enabled">, string>> & {
  enabled?: boolean;
};

export const getNextiConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{
      ok: boolean;
      isAdmin: boolean;
      config?: NextiConfigValues;
      error?: string;
    }> => {
      try {
        const db = await configClient();
        const { data, error } = await db
          .from("nexti_config")
          .select(
            "enabled, base_url, client_id, client_secret, username, token, token_endpoint, test_endpoint",
          )
          .eq("id", true)
          .maybeSingle();
        if (error) throw error;

        const row = (data as DbConfigRow | null) ?? {};
        return {
          ok: true,
          isAdmin: true,
          config: {
            enabled: row.enabled !== false,
            baseUrl: row.base_url ?? "",
            clientId: row.client_id ?? "",
            clientSecret: row.client_secret ?? "",
            username: row.username ?? "",
            token: row.token ?? "",
            tokenEndpoint: row.token_endpoint ?? "",
            testEndpoint: row.test_endpoint ?? "",
          },
        };
      } catch (error) {
        return {
          ok: false,
          isAdmin: false,
          error: error instanceof Error ? error.message : "Erro ao carregar configuração.",
        };
      }
    },
  );

export const saveNextiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveConfigInput | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const ctx = context as { supabase: unknown; userId?: string };

      const payload = {
        id: true,
        enabled: data.enabled !== false,
        base_url: (data.baseUrl ?? "").trim(),
        client_id: (data.clientId ?? "").trim(),
        client_secret: (data.clientSecret ?? "").trim(),
        username: (data.username ?? "").trim(),
        token: (data.token ?? "").trim(),
        token_endpoint: (data.tokenEndpoint ?? "").trim(),
        test_endpoint: (data.testEndpoint ?? "").trim(),
        updated_by: ctx.userId ?? null,
        updated_at: new Date().toISOString(),
      };

      const db = await configClient();
      const { error } = await db.from("nexti_config").upsert(payload);
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao salvar configuração.",
      };
    }
  });

export const setNextiApiEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: Boolean(input?.enabled) }))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; enabled?: boolean; error?: string }> => {
      try {
        const ctx = context as { supabase: unknown; userId?: string };
        const db = await configClient();
        const { error } = await db.from("nexti_config").upsert({
          id: true,
          enabled: data.enabled,
          updated_by: ctx.userId ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        return { ok: true, enabled: data.enabled };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Erro ao alterar o estado da API NEXTI.",
        };
      }
    },
  );

/** Estado da integração (ligada/desligada). Disponível a qualquer usuário autenticado. */
export const getNextiApiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: boolean; enabled: boolean }> => {
    try {
      const db = await configClient();
      const { data } = await db.from("nexti_config").select("enabled").eq("id", true).maybeSingle();
      return {
        ok: true,
        enabled: (data as { enabled?: boolean | null } | null)?.enabled !== false,
      };
    } catch {
      return { ok: true, enabled: true };
    }
  });
