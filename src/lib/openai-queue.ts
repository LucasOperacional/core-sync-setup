/**
 * OpenAI Request Queue — Garante execução sequencial (uma por vez),
 * retry com backoff exponencial respeitando Retry-After,
 * detecção de erros de billing/quota, e cache de resultados.
 *
 * Uso: importe `enqueueOpenAIRequest` em vez de chamar fetch diretamente.
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000];

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class OpenAIRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly isBillingError: boolean = false,
    public readonly attempt: number = 0,
  ) {
    super(message);
    this.name = "OpenAIRequestError";
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
// Result cache (keyed by a hash of the request body)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: Record<string, unknown>;
  timestamp: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(body: Record<string, unknown>): string {
  // Simple deterministic key from model + messages content
  try {
    const messages = body["messages"] as Array<{ role: string; content: string }> | undefined;
    if (!messages) return "";
    const parts = messages.map((m) => `${m.role}:${m.content.slice(0, 200)}`);
    return `${String(body["model"])}|${parts.join("|")}`.slice(0, 2000);
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
  // Evict old entries if cache grows too large
  if (_cache.size > 100) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Billing / quota error detection
// ---------------------------------------------------------------------------

const BILLING_PATTERNS = [
  "insufficient_quota",
  "billing",
  "exceeded your current quota",
  "account is not active",
  "payment",
  "plan limit",
  "monthly limit",
  "rate limit reached for.*per month",
  "budget",
];

function isBillingError(status: number, body: string): boolean {
  if (status !== 429 && status !== 402 && status !== 403) return false;
  const lower = body.toLowerCase();
  return BILLING_PATTERNS.some((p) => lower.includes(p) || new RegExp(p, "i").test(lower));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// ---------------------------------------------------------------------------
// Logging (safe — no secrets)
// ---------------------------------------------------------------------------

function logAttempt(attempt: number, status: number, message: string): void {
  console.warn(
    `[OpenAI Queue] Tentativa ${attempt}/${MAX_RETRIES} | HTTP ${status} | ${message.slice(0, 150)}`,
  );
}

// ---------------------------------------------------------------------------
// Main queue function
// ---------------------------------------------------------------------------

export interface QueuedRequestOptions {
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  /** Set to true to skip retry (e.g. for connection tests). */
  noRetry?: boolean;
  /** Set to true to skip cache lookup. */
  noCache?: boolean;
  /** AbortSignal from the caller (e.g. user cancellation). */
  signal?: AbortSignal;
}

export interface QueuedResponse {
  data: Record<string, unknown>;
  status: number;
  cached: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enqueue an OpenAI chat completions request.
 * Guarantees sequential execution (one at a time).
 * Retries with exponential backoff on 429/5xx, respects Retry-After.
 * Does NOT retry on billing/quota errors — throws immediately with a clear message.
 */
export async function enqueueOpenAIRequest(options: QueuedRequestOptions): Promise<QueuedResponse> {
  const {
    apiKey,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    noRetry = false,
    noCache = false,
    signal,
  } = options;

  // Check cache first (before acquiring lock)
  if (!noCache) {
    const key = cacheKey(body);
    const cached = getCached(key);
    if (cached) {
      return { data: cached, status: 200, cached: true };
    }
  }

  // Acquire sequential lock
  const lock = acquireLock();
  await lock.ready;

  try {
    // Check if caller already aborted
    if (signal?.aborted) {
      throw new OpenAIRequestError("Requisição cancelada pelo usuário.", 0, false);
    }

    const maxAttempts = noRetry ? 1 : MAX_RETRIES;
    let lastError: OpenAIRequestError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check abort between retries
      if (signal?.aborted) {
        throw new OpenAIRequestError("Requisição cancelada pelo usuário.", 0, false);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Link caller's signal to our controller
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);

        if (response.ok) {
          const data = (await response.json()) as Record<string, unknown>;
          // Cache successful result
          if (!noCache) {
            setCache(cacheKey(body), data);
          }
          return { data, status: response.status, cached: false };
        }

        // Read error body once
        const errorBody = await response.text().catch(() => "");

        // Billing / quota — never retry
        if (isBillingError(response.status, errorBody)) {
          throw new OpenAIRequestError(
            "Limite de créditos ou cota mensal da OpenAI atingido. Verifique seu plano e faturamento em platform.openai.com/account/billing.",
            response.status,
            false,
            true,
            attempt,
          );
        }

        // Non-retryable HTTP error
        if (!isRetryableStatus(response.status)) {
          const msg =
            response.status === 401
              ? "Chave de API inválida ou expirada."
              : response.status === 403
                ? "Acesso negado. Verifique as permissões da chave."
                : `Erro HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
          throw new OpenAIRequestError(msg, response.status, false, false, attempt);
        }

        // Retryable error (429 rate limit or 5xx)
        logAttempt(attempt, response.status, errorBody.slice(0, 150));

        lastError = new OpenAIRequestError(
          `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
          response.status,
          true,
          false,
          attempt,
        );

        if (attempt < maxAttempts) {
          // Respect Retry-After header if present
          const retryAfterHeader = response.headers.get("Retry-After");
          let waitMs = BACKOFF_DELAYS[attempt - 1] ?? 8000;
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds) && seconds > 0) {
              waitMs = Math.min(seconds * 1000, 30_000);
            }
          }
          await delay(waitMs);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);

        // Re-throw our own errors
        if (err instanceof OpenAIRequestError) {
          if (!err.retryable || attempt >= maxAttempts) throw err;
          lastError = err;
          if (attempt < maxAttempts) {
            await delay(BACKOFF_DELAYS[attempt - 1] ?? 8000);
          }
          continue;
        }

        // Timeout
        if (err instanceof DOMException && err.name === "AbortError") {
          if (signal?.aborted) {
            throw new OpenAIRequestError(
              "Requisição cancelada pelo usuário.",
              0,
              false,
              false,
              attempt,
            );
          }
          lastError = new OpenAIRequestError(
            `Timeout: requisição excedeu ${Math.round(timeoutMs / 1000)}s.`,
            0,
            true,
            false,
            attempt,
          );
          logAttempt(attempt, 0, "Timeout");
          if (attempt < maxAttempts) {
            await delay(BACKOFF_DELAYS[attempt - 1] ?? 8000);
          }
          continue;
        }

        // Network error
        lastError = new OpenAIRequestError(
          err instanceof Error ? err.message : "Erro de rede desconhecido.",
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

    throw lastError ?? new OpenAIRequestError(`Falha após ${maxAttempts} tentativas.`, 0, false);
  } finally {
    lock.release();
  }
}
