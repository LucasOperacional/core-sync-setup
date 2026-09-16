/**
 * Gemini Enhancer — Usa a API do Google Gemini para melhorar a extração de dados
 * de PDFs e planilhas.
 *
 * Implementa fila sequencial (mutex), retry com backoff exponencial,
 * cache de resultados e controle de tokens.
 *
 * Documentação: https://ai.google.dev/gemini-api/docs
 *
 * Modelos suportados (fallback automático):
 *   gemini-2.5-flash (padrão)
 *   gemini-2.5-flash-lite
 *   gemini-flash-latest
 */

import { registrarChamadaGemini } from "./gemini-log";

const STORAGE_KEY = "gemini-api-config-v1";
const TOKEN_USAGE_KEY = "gemini-token-usage-v1";

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_BASE_URL_V1 = "https://generativelanguage.googleapis.com/v1";
// Modelos que não servem para geração de texto (nunca tentar como fallback)
const NON_TEXT_MODEL_PATTERN =
  /tts|image|imagen|embedding|aqa|veo|live|robotic|native-audio|computer-use|gemini-3-pro-image/i;
const TEST_TIMEOUT_MS = 30_000;
const OPERATION_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 4;
const BACKOFF_DELAYS = [2000, 4000, 8000, 8000];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeminiConfig {
  apiKey: string;
}

export interface GeminiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastUsed: string | null;
}

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly isBillingError: boolean = false,
    public readonly attempt: number = 0,
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

export function loadGeminiConfig(): GeminiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GeminiConfig>;
      return { apiKey: parsed.apiKey ?? "" };
    }
  } catch {
    /* cache inválido */
  }
  return { apiKey: "" };
}

export function saveGeminiConfig(config: GeminiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage cheio */
  }
}

export function isGeminiConfigured(): boolean {
  const config = loadGeminiConfig();
  return config.apiKey.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Token usage persistence
// ---------------------------------------------------------------------------

export function loadGeminiTokenUsage(): GeminiTokenUsage {
  try {
    const raw = localStorage.getItem(TOKEN_USAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as GeminiTokenUsage;
    }
  } catch {
    /* cache inválido */
  }
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    lastUsed: null,
  };
}

export function saveGeminiTokenUsage(usage: GeminiTokenUsage): void {
  try {
    localStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(usage));
  } catch {
    /* storage cheio */
  }
}

export function resetGeminiTokenUsage(): void {
  saveGeminiTokenUsage({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    lastUsed: null,
  });
}

export function addGeminiTokenUsage(prompt: number, completion: number): void {
  const current = loadGeminiTokenUsage();
  current.promptTokens += prompt;
  current.completionTokens += completion;
  current.totalTokens += prompt + completion;
  current.requestCount += 1;
  current.lastUsed = new Date().toISOString();
  saveGeminiTokenUsage(current);
}

function trackUsage(data: Record<string, unknown>): void {
  const meta = data["usageMetadata"] as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  if (meta) {
    addGeminiTokenUsage(meta.promptTokenCount ?? 0, meta.candidatesTokenCount ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Mutex — only one request at a time
// ---------------------------------------------------------------------------

let _lock: Promise<void> = Promise.resolve();

function acquireLock(): { ready: Promise<void>; release: () => void } {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = _lock;
  _lock = _lock.then(() => next);
  return { ready, release };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: Record<string, unknown>;
  timestamp: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(body: Record<string, unknown>): string {
  try {
    const contents = body["contents"] as
      Array<{ role?: string; parts?: Array<{ text?: string }> }> | undefined;
    if (!contents) return "";
    const parts = contents.map(
      (c) => `${c.role ?? ""}:${(c.parts?.[0]?.text ?? "").slice(0, 200)}`,
    );
    return `gemini|${String(body["model"] ?? DEFAULT_MODEL)}|${parts.join("|")}`.slice(0, 2000);
  } catch {
    return "";
  }
}

function getCached(key: string): Record<string, unknown> | null {
  if (!key) return null;
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  if (!key) return;
  _cache.set(key, { data, timestamp: Date.now() });
  if (_cache.size > 100) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Error detection helpers
// ---------------------------------------------------------------------------

const BILLING_PATTERNS = [
  "billing",
  "quota",
  "exceeded",
  "payment",
  "budget",
  "resource_exhausted",
  "rate_limit",
];

function isBillingError(status: number, body: string): boolean {
  if (status !== 429 && status !== 402 && status !== 403) return false;
  const lower = body.toLowerCase();
  return BILLING_PATTERNS.some((p) => lower.includes(p));
}

function isModelNotFoundError(status: number, body: string): boolean {
  if (status !== 404) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("model") || lower.includes("not found") || lower.includes("no longer available")
  );
}

function logAttempt(attempt: number, status: number, message: string): void {
  console.warn(
    `[Gemini Queue] Tentativa ${attempt}/${MAX_RETRIES} | HTTP ${status} | ${message.slice(0, 150)}`,
  );
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Normalize model name — remove "models/" prefix
// ---------------------------------------------------------------------------

function normalizeModelName(name: string): string {
  return name.replace(/^models\//, "");
}

// ---------------------------------------------------------------------------
// Direct single-model request (no queue, no fallback) — used internally
// ---------------------------------------------------------------------------

async function directModelRequest(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
  baseUrl: string = GEMINI_BASE_URL,
): Promise<
  | { ok: true; data: Record<string, unknown>; status: number }
  | { ok: false; status: number; errorBody: string }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      return { ok: true, data, status: response.status };
    }

    const errorBody = await response.text().catch(() => "");
    return { ok: false, status: response.status, errorBody };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (signal?.aborted) {
        return { ok: false, status: 0, errorBody: "Requisição cancelada pelo usuário." };
      }
      return {
        ok: false,
        status: 0,
        errorBody: `Timeout: requisição excedeu ${Math.round(timeoutMs / 1000)}s.`,
      };
    }
    return {
      ok: false,
      status: 0,
      errorBody: err instanceof Error ? err.message : "Erro de rede desconhecido.",
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------
// List available models — normalizes names and filters by generateContent
// ---------------------------------------------------------------------------

async function listAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(`${GEMINI_BASE_URL}/models?key=${apiKey}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = (await response.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    return (data.models ?? [])
      .filter((m) => {
        const methods = m.supportedGenerationMethods ?? [];
        return methods.includes("generateContent");
      })
      .map((m) => normalizeModelName(m.name ?? ""))
      .filter((n) => n.includes("gemini"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public: get list of supported models (for UI display)
// ---------------------------------------------------------------------------

export function getSupportedModels(): string[] {
  return [DEFAULT_MODEL, ...FALLBACK_MODELS];
}

// ---------------------------------------------------------------------------
// Build candidate model list dynamically from the API (self-healing:
// funciona mesmo quando o Google renomeia/aposenta modelos)
// ---------------------------------------------------------------------------

async function buildCandidateModels(apiKey: string): Promise<string[]> {
  const hardcoded = [DEFAULT_MODEL, ...FALLBACK_MODELS];
  const available = await listAvailableModels(apiKey);

  // Filtra apenas modelos de texto (remove tts/image/embedding/etc.)
  const textModels = available.filter((m) => !NON_TEXT_MODEL_PATTERN.test(m));

  if (textModels.length === 0) return hardcoded;

  // Ordena: preferidos primeiro (na ordem da lista fixa), depois os demais.
  const preferred = hardcoded.filter((m) => textModels.includes(m));
  const extras = textModels.filter((m) => !preferred.includes(m));
  return [...preferred, ...extras];
}

// ---------------------------------------------------------------------------
// Resolve best model — tries default + fallbacks, returns first working one
// ---------------------------------------------------------------------------

async function resolveBestModel(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ model: string; data: Record<string, unknown>; status: number }> {
  const modelsToTry = await buildCandidateModels(apiKey);
  const failedModels: Array<{ model: string; status: number; error: string }> = [];

  for (const model of modelsToTry) {
    console.info(`[Gemini] Tentando modelo: ${model}`);
    let result = await directModelRequest(apiKey, model, body, timeoutMs, signal);

    // 404 pode significar que o projeto da chave só tem a API v1 habilitada —
    // tenta a mesma chamada na v1 antes de desistir do modelo.
    if (!result.ok && isModelNotFoundError(result.status, result.errorBody)) {
      console.warn(`[Gemini] Modelo ${model} retornou 404 na v1beta. Tentando na v1...`);
      result = await directModelRequest(apiKey, model, body, timeoutMs, signal, GEMINI_BASE_URL_V1);
    }

    if (result.ok) {
      return { model, data: result.data, status: result.status };
    }

    // If it's a 404 (model not found), try next model
    if (isModelNotFoundError(result.status, result.errorBody)) {
      console.warn(`[Gemini] Modelo ${model} não encontrado (404). Tentando próximo...`);
      failedModels.push({ model, status: result.status, error: result.errorBody.slice(0, 100) });
      continue;
    }

    // For billing/quota errors, throw immediately — won't help to try other models
    if (isBillingError(result.status, result.errorBody)) {
      throw new GeminiRequestError(
        `Limite de cota ou créditos atingido (HTTP ${result.status}). Verifique seu projeto no Google Cloud Console. Resposta: ${result.errorBody.slice(0, 200)}`,
        result.status,
        false,
        true,
      );
    }

    // For auth errors (401/403), throw immediately — no point trying other models
    if (result.status === 401 || result.status === 403) {
      throw new GeminiRequestError(
        `Problema de autenticação ou permissão (HTTP ${result.status}). Verifique sua chave em aistudio.google.com/apikey. Resposta: ${result.errorBody.slice(0, 200)}`,
        result.status,
        false,
      );
    }

    // 429 (rate limit) / 5xx (sobrecarga, ex.: 503 UNAVAILABLE): tenta o próximo
    // modelo antes de desistir — a sobrecarga costuma ser por modelo.
    if (result.status === 429 || result.status >= 500) {
      console.warn(
        `[Gemini] Modelo ${model} indisponível (HTTP ${result.status}). Tentando próximo modelo...`,
      );
      failedModels.push({ model, status: result.status, error: result.errorBody.slice(0, 100) });
      // pequena pausa para aliviar sobrecarga momentânea
      await delay(600);
      continue;
    }

    // For network errors (status 0), throw as retryable
    if (result.status === 0) {
      throw new GeminiRequestError(
        result.errorBody || "Erro de rede ao conectar com a API Gemini.",
        0,
        true,
      );
    }

    // For other non-retryable errors, throw with details
    throw new GeminiRequestError(
      `Erro HTTP ${result.status} no modelo ${model}. Resposta: ${result.errorBody.slice(0, 300)}`,
      result.status,
      false,
    );
  }

  const testedList = modelsToTry.join(", ");
  const failDetails = failedModels.map((f) => `${f.model} → HTTP ${f.status}`).join("; ");

  // Se todos falharam por sobrecarga/limite (429/5xx), é temporário e re-tentável.
  const allOverloaded =
    failedModels.length > 0 && failedModels.every((f) => f.status === 429 || f.status >= 500);
  if (allOverloaded) {
    const lastStatus = failedModels[failedModels.length - 1]?.status ?? 503;
    throw new GeminiRequestError(
      `Os modelos Gemini estão temporariamente sobrecarregados (HTTP ${lastStatus}). Testados: ${testedList} (${failDetails}). Isso costuma ser passageiro — tente novamente em alguns instantes.`,
      lastStatus,
      true,
    );
  }

  // Caso contrário (404s), lista os modelos disponíveis para uma mensagem melhor
  const available = await listAvailableModels(apiKey);

  if (available.length > 0) {
    throw new GeminiRequestError(
      `Nenhum dos modelos testados (${testedList}) respondeu com sucesso. Detalhes: ${failDetails}. Modelos com generateContent na sua conta: ${available.slice(0, 10).join(", ")}. Atualize a lista de modelos ou verifique se sua chave tem acesso a eles.`,
      404,
      false,
    );
  }

  throw new GeminiRequestError(
    `Nenhum modelo respondeu com sucesso. Testados: ${testedList}. Detalhes: ${failDetails}. A API não retornou nenhum modelo com suporte a generateContent — verifique se a API "Generative Language API" está habilitada no Google Cloud Console para o projeto desta chave.`,
    404,
    false,
  );
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiRequestOptions {
  apiKey: string;
  model?: string;
  contents: Array<{
    role: string;
    parts: GeminiPart[];
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<Record<string, unknown>>;
  timeoutMs?: number;
  noRetry?: boolean;
  noCache?: boolean;
  signal?: AbortSignal;
  /** Rótulo exibido na aba de monitoramento de chamadas. */
  logLabel?: string;
}

export interface GeminiResponse {
  data: Record<string, unknown>;
  status: number;
  cached: boolean;
}

/** Wrapper que registra cada chamada no log de monitoramento da API. */
async function enqueueGeminiRequest(options: GeminiRequestOptions): Promise<GeminiResponse> {
  const inicio = Date.now();
  const partes = options.contents.flatMap((c) => c.parts);
  const promptChars = partes.reduce((acc, p) => acc + ("text" in p ? p.text.length : 0), 0);
  const temImagem = partes.some((p) => "inlineData" in p);
  const base = {
    inicio: new Date(inicio).toISOString(),
    rotulo: options.logLabel ?? "Chamada Gemini",
    modelo: options.model ?? DEFAULT_MODEL,
    promptChars,
    temImagem,
  };

  try {
    const result = await executeGeminiRequest(options);
    const meta = result.data["usageMetadata"] as
      { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    registrarChamadaGemini({
      ...base,
      duracaoMs: Date.now() - inicio,
      status: result.status,
      ok: true,
      cached: result.cached,
      tentativas: 1,
      promptTokens: meta?.promptTokenCount ?? 0,
      completionTokens: meta?.candidatesTokenCount ?? 0,
      resposta: extractGeminiText(result.data),
    });
    return result;
  } catch (err) {
    const status = err instanceof GeminiRequestError ? err.status : 0;
    const tentativas =
      err instanceof GeminiRequestError && typeof err.attempt === "number" ? err.attempt : 1;
    registrarChamadaGemini({
      ...base,
      duracaoMs: Date.now() - inicio,
      status,
      ok: false,
      cached: false,
      tentativas,
      promptTokens: 0,
      completionTokens: 0,
      resposta: "",
      erro: err instanceof Error ? err.message : "Erro desconhecido.",
    });
    throw err;
  }
}

async function executeGeminiRequest(options: GeminiRequestOptions): Promise<GeminiResponse> {
  const {
    apiKey,
    model,
    contents,
    generationConfig,
    systemInstruction,
    tools,
    timeoutMs = OPERATION_TIMEOUT_MS,
    noRetry = false,
    noCache = false,
    signal,
  } = options;

  const body: Record<string, unknown> = { contents };
  if (generationConfig) body["generationConfig"] = generationConfig;
  if (systemInstruction) body["systemInstruction"] = systemInstruction;
  if (tools) body["tools"] = tools;

  // Check cache
  if (!noCache) {
    body["model"] = model ?? DEFAULT_MODEL;
    const key = cacheKey(body);
    const cached = getCached(key);
    if (cached) {
      return { data: cached, status: 200, cached: true };
    }
  }

  const lock = acquireLock();
  await lock.ready;

  try {
    if (signal?.aborted) {
      throw new GeminiRequestError("Requisição cancelada pelo usuário.", 0, false);
    }

    const maxAttempts = noRetry ? 1 : MAX_RETRIES;
    let lastError: GeminiRequestError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new GeminiRequestError("Requisição cancelada pelo usuário.", 0, false);
      }

      try {
        let resultData: Record<string, unknown>;
        let resultStatus: number;

        if (model) {
          const direct = await directModelRequest(apiKey, model, body, timeoutMs, signal);
          if (!direct.ok) {
            if (isModelNotFoundError(direct.status, direct.errorBody)) {
              // Specific model not found, try fallbacks
              const resolved = await resolveBestModel(apiKey, body, timeoutMs, signal);
              resultData = resolved.data;
              resultStatus = resolved.status;
            } else if (direct.status === 401 || direct.status === 403) {
              throw new GeminiRequestError(
                `Problema de autenticação ou permissão (HTTP ${direct.status}). Verifique sua chave em aistudio.google.com/apikey. Resposta: ${direct.errorBody.slice(0, 200)}`,
                direct.status,
                false,
                false,
                attempt,
              );
            } else if (isBillingError(direct.status, direct.errorBody)) {
              throw new GeminiRequestError(
                `Limite de cota ou créditos atingido (HTTP ${direct.status}). Resposta: ${direct.errorBody.slice(0, 200)}`,
                direct.status,
                false,
                true,
                attempt,
              );
            } else if (direct.status === 429) {
              throw new GeminiRequestError(
                `Limite de requisições excedido (HTTP 429). Resposta: ${direct.errorBody.slice(0, 200)}`,
                direct.status,
                true,
                false,
                attempt,
              );
            } else if (direct.status >= 500) {
              throw new GeminiRequestError(
                `Erro no servidor Gemini (HTTP ${direct.status}). Resposta: ${direct.errorBody.slice(0, 200)}`,
                direct.status,
                true,
                false,
                attempt,
              );
            } else if (direct.status === 0) {
              throw new GeminiRequestError(
                direct.errorBody || "Erro de rede.",
                0,
                true,
                false,
                attempt,
              );
            } else {
              throw new GeminiRequestError(
                `Erro HTTP ${direct.status} no modelo ${model}. Resposta: ${direct.errorBody.slice(0, 300)}`,
                direct.status,
                false,
                false,
                attempt,
              );
            }
          } else {
            resultData = direct.data;
            resultStatus = direct.status;
          }
        } else {
          const resolved = await resolveBestModel(apiKey, body, timeoutMs, signal);
          resultData = resolved.data;
          resultStatus = resolved.status;
        }

        // Success
        if (!noCache) {
          body["model"] = model ?? DEFAULT_MODEL;
          setCache(cacheKey(body), resultData);
        }
        return { data: resultData, status: resultStatus, cached: false };
      } catch (err) {
        if (err instanceof GeminiRequestError) {
          // Non-retryable errors: throw immediately
          if (!err.retryable || attempt >= maxAttempts) throw err;
          lastError = err;
          logAttempt(attempt, err.status, err.message);
          await delay(BACKOFF_DELAYS[attempt - 1] ?? 8000);
          continue;
        }

        lastError = new GeminiRequestError(
          err instanceof Error ? err.message : "Erro desconhecido.",
          0,
          true,
          false,
          attempt,
        );
        logAttempt(attempt, 0, lastError.message);
        if (attempt < maxAttempts) {
          await delay(BACKOFF_DELAYS[attempt - 1] ?? 8000);
        }
      }
    }

    throw lastError ?? new GeminiRequestError(`Falha após ${maxAttempts} tentativas.`, 0, false);
  } finally {
    lock.release();
  }
}

// ---------------------------------------------------------------------------
// Helper: extract text from Gemini response
// ---------------------------------------------------------------------------

function extractText(data: Record<string, unknown>): string {
  const candidates = data["candidates"] as
    Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Testa a conexão com a API Gemini fazendo uma chamada simples.
 * Tenta o modelo padrão e, se falhar com 404, tenta modelos alternativos.
 */
export async function testGeminiConnection(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  model?: string;
  latencyMs?: number;
  availableModels?: string[];
}> {
  const start = Date.now();

  try {
    // First, list models to verify the API key and show available models
    const availableModels = await listAvailableModels(apiKey);
    if (availableModels.length === 0) {
      console.warn(
        "[Gemini] Nenhum modelo com generateContent listado pela API. A chave pode não ter acesso.",
      );
    } else {
      console.info(
        `[Gemini] Modelos disponíveis (com generateContent): ${availableModels.slice(0, 15).join(", ")}`,
      );
    }

    const body: Record<string, unknown> = {
      contents: [
        { role: "user", parts: [{ text: "Responda apenas: Integração Gemini funcionando." }] },
      ],
      generationConfig: { maxOutputTokens: 30 },
    };

    // Retenta com backoff quando o erro é temporário (sobrecarga 503 / limite 429)
    let resolved: { model: string; data: Record<string, unknown>; status: number } | null = null;
    let lastRetryable: GeminiRequestError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resolved = await resolveBestModel(apiKey, body, TEST_TIMEOUT_MS);
        break;
      } catch (err) {
        if (err instanceof GeminiRequestError && err.retryable && attempt < 2) {
          lastRetryable = err;
          await delay(BACKOFF_DELAYS[attempt] ?? 4000);
          continue;
        }
        throw err;
      }
    }
    if (!resolved)
      throw lastRetryable ?? new GeminiRequestError("Falha ao conectar com a API Gemini.", 0, true);
    const latencyMs = Date.now() - start;

    trackUsage(resolved.data);
    const modelVersion = (resolved.data["modelVersion"] as string) ?? resolved.model;
    return { ok: true, model: modelVersion, latencyMs, availableModels };
  } catch (err) {
    const latencyMs = Date.now() - start;

    if (err instanceof GeminiRequestError) {
      return { ok: false, error: err.message, latencyMs };
    }

    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido",
      latencyMs,
    };
  }
}

export interface GeminiEnhancedRecord {
  nome: string;
  empresa: string;
  matricula: string;
  cargo: string;
}

/**
 * Envia um lote de registros para o Gemini refinar.
 */
export async function enhanceRecordsWithGemini(
  records: Array<{ nome: string; empresa: string; matricula: string; cargo: string }>,
): Promise<GeminiEnhancedRecord[]> {
  const config = loadGeminiConfig();
  if (!config.apiKey) {
    throw new GeminiRequestError("Chave da API Gemini não configurada.", 0, false);
  }

  const batch = records.slice(0, 50);

  const systemText =
    "Corrija dados de funcionários extraídos de PDFs/planilhas. Receba um array JSON com campos: nome, empresa, matricula, cargo. Corrija nomes (capitalização, OCR), separe campos misturados, mantenha valores originais se não puder corrigir. Responda APENAS com um array JSON válido.";

  const result = await enqueueGeminiRequest({
    apiKey: config.apiKey,
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(batch) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
  });

  trackUsage(result.data);

  const content = extractText(result.data);

  try {
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as GeminiEnhancedRecord[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    console.warn("[Gemini Enhancer] Resposta não é JSON válido:", content.slice(0, 200));
  }

  return batch;
}

/**
 * Analisa texto bruto usando o Gemini para extrair dados estruturados.
 */
export async function analyzeTextWithGemini(rawText: string, context: string): Promise<string> {
  const config = loadGeminiConfig();
  if (!config.apiKey) {
    throw new GeminiRequestError("Chave da API Gemini não configurada.", 0, false);
  }

  const truncatedText =
    rawText.length > 6000 ? rawText.slice(0, 6000) + "\n[...texto truncado...]" : rawText;

  const result = await enqueueGeminiRequest({
    apiKey: config.apiKey,
    systemInstruction: {
      parts: [{ text: `Analise documentos operacionais. ${context}` }],
    },
    contents: [{ role: "user", parts: [{ text: truncatedText }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  });

  trackUsage(result.data);
  return extractText(result.data);
}

/**
 * Chat completion com Gemini — usado pelo chat assistant.
 */
export async function chatWithGemini(
  messages: Array<{ role: "user" | "model"; text: string }>,
  systemPrompt: string,
  options?: { signal?: AbortSignal },
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const config = loadGeminiConfig();
  if (!config.apiKey) {
    throw new GeminiRequestError("Chave da API Gemini não configurada.", 0, false);
  }

  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const result = await enqueueGeminiRequest({
    apiKey: config.apiKey,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
    noCache: true,
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  trackUsage(result.data);

  const content = extractText(result.data);
  const meta = result.data["usageMetadata"] as
    { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  return {
    content: content || "Desculpe, não consegui gerar uma resposta.",
    promptTokens: meta?.promptTokenCount ?? 0,
    completionTokens: meta?.candidatesTokenCount ?? 0,
  };
}

/**
 * Chamada genérica ao Gemini (suporta imagens via inlineData e Google Search grounding).
 */
export async function geminiGenerate(options: GeminiRequestOptions): Promise<GeminiResponse> {
  const result = await enqueueGeminiRequest(options);
  trackUsage(result.data);
  return result;
}

/** Junta todos os blocos de texto da resposta do Gemini. */
export function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = data["candidates"] as
    Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

export interface GeminiGroundingSource {
  title: string;
  uri: string;
}

/** Extrai as fontes usadas pelo Google Search grounding. */
export function extractGeminiSources(data: Record<string, unknown>): GeminiGroundingSource[] {
  const candidates = data["candidates"] as
    | Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
        };
      }>
    | undefined;
  const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const out: GeminiGroundingSource[] = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    if (!uri) continue;
    if (out.some((s) => s.uri === uri)) continue;
    out.push({ title: c.web?.title || uri, uri });
  }
  return out;
}
