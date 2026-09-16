/**
 * API Shield — camada única de proteção das chamadas de API de TODOS os cards.
 *
 * O que ela faz em cada chamada:
 *  1. Limite local (token bucket em memória) — corta rajadas antes de sair do navegador
 *  2. Limite no servidor (por usuário/recurso) — anti-abuso / anti-DDoS
 *  3. Disjuntor (circuit breaker) por recurso — para de insistir em API quebrada
 *  4. Retentativas com backoff exponencial só para erros temporários
 *  5. Timeout de segurança e classificação do erro em mensagem clara
 *  6. Registro do resultado no log de segurança (alimenta a IA de Segurança)
 */

import { guardApiCall, registrarEventoApi } from "./security-shield.functions";

/* ─── Cards/áreas protegidas ─── */
export const PROTECTED_CARDS = [
  { key: "nexti", label: "Integração NEXTI", resource: "nexti.api" },
  { key: "gemini", label: "IA Gemini", resource: "gemini.api" },
  { key: "openai", label: "IA OpenAI", resource: "openai.api" },
  { key: "chat-ia", label: "Chat Oficial com IA", resource: "chat-ia.api" },
  { key: "chat-interno", label: "Chat Interno", resource: "chat-interno.db" },
  { key: "usuarios", label: "Gestão de Usuários", resource: "usuarios.admin" },
  { key: "protocolo-folhas-ponto", label: "Folhas de Ponto", resource: "protocolo.folhas" },
  { key: "protocolo-limpeza-geral", label: "Limpeza Geral", resource: "protocolo.limpeza" },
  { key: "assinatura-documentos", label: "Assinatura de Documentos", resource: "assinatura.db" },
  { key: "atestados", label: "Atestados", resource: "atestados.db" },
  {
    key: "verificador-atestados",
    label: "Verificador de Atestados",
    resource: "atestados.verificador",
  },
  { key: "faltas", label: "Faltas", resource: "faltas.db" },
  { key: "control", label: "Control", resource: "control.db" },
  { key: "canais", label: "Lançamento CRT", resource: "canais.db" },
  { key: "admin", label: "Painel Admin", resource: "admin.import" },
  { key: "ia-operacional", label: "IA Operacional", resource: "ia-operacional.diag" },
] as const;

export type ProtectedCardKey = (typeof PROTECTED_CARDS)[number]["key"];

export class ApiShieldError extends Error {
  constructor(
    message: string,
    public readonly kind:
      "blocked" | "timeout" | "network" | "auth" | "server" | "client" | "unknown",
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds = 0,
  ) {
    super(message);
    this.name = "ApiShieldError";
  }
}

/* ─── Limite local (por recurso) ─── */
const localHits = new Map<string, number[]>();

function localRateOk(resource: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (localHits.get(resource) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    localHits.set(resource, hits);
    return false;
  }
  hits.push(now);
  localHits.set(resource, hits);
  return true;
}

/* ─── Disjuntor por recurso ─── */
type Breaker = { failures: number; openUntil: number };
const breakers = new Map<string, Breaker>();
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

function breakerState(resource: string): Breaker {
  return breakers.get(resource) ?? { failures: 0, openUntil: 0 };
}

function breakerOpen(resource: string): number {
  const b = breakerState(resource);
  return b.openUntil > Date.now() ? Math.ceil((b.openUntil - Date.now()) / 1000) : 0;
}

function breakerFail(resource: string): void {
  const b = breakerState(resource);
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD) {
    b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    b.failures = 0;
  }
  breakers.set(resource, b);
}

function breakerSuccess(resource: string): void {
  breakers.set(resource, { failures: 0, openUntil: 0 });
}

export function getShieldRuntimeState(): Array<{
  resource: string;
  openSeconds: number;
  failures: number;
}> {
  return [...breakers.entries()].map(([resource, b]) => ({
    resource,
    openSeconds: b.openUntil > Date.now() ? Math.ceil((b.openUntil - Date.now()) / 1000) : 0,
    failures: b.failures,
  }));
}

/* ─── Classificação de erros ─── */
function statusFrom(err: unknown): number | undefined {
  const anyErr = err as {
    status?: number;
    httpStatus?: number;
    response?: { status?: number };
  } | null;
  const s = anyErr?.status ?? anyErr?.httpStatus ?? anyErr?.response?.status;
  if (typeof s === "number") return s;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = msg.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

export function classifyError(err: unknown): ApiShieldError {
  if (err instanceof ApiShieldError) return err;
  const msg = err instanceof Error ? err.message : String(err ?? "Erro desconhecido");
  const status = statusFrom(err);
  const lower = msg.toLowerCase();

  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("excedeu")) {
    return new ApiShieldError(
      "A chamada demorou demais e foi interrompida por segurança.",
      "timeout",
      status,
    );
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("rede")
  ) {
    return new ApiShieldError(
      "Sem conexão com o serviço. Verifique a internet e tente novamente.",
      "network",
      status,
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("unauthorized") ||
    lower.includes("não autorizado")
  ) {
    return new ApiShieldError(
      "Acesso não autorizado. Faça login novamente ou verifique as credenciais.",
      "auth",
      status,
    );
  }
  if (status === 429) {
    return new ApiShieldError(
      "Muitas requisições em pouco tempo. Aguarde alguns instantes.",
      "blocked",
      429,
      30,
    );
  }
  if (status && status >= 500) {
    return new ApiShieldError(
      `Serviço temporariamente indisponível (HTTP ${status}). Tente de novo em instantes.`,
      "server",
      status,
    );
  }
  if (status && status >= 400) {
    return new ApiShieldError(msg || `Requisição inválida (HTTP ${status}).`, "client", status);
  }
  return new ApiShieldError(msg, "unknown", status);
}

function isRetryable(err: ApiShieldError): boolean {
  return err.kind === "network" || err.kind === "server" || err.kind === "timeout";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ProtectOptions {
  cardKey: string;
  resource: string;
  /** Limite de chamadas na janela (padrão 30) */
  limit?: number;
  /** Janela do limite em segundos (padrão 60) */
  windowSeconds?: number;
  /** Retentativas para erros temporários (padrão 2) */
  retries?: number;
  /** Timeout por tentativa em ms (padrão 45s; use 0 para desativar) */
  timeoutMs?: number;
  /** Não consultar o limite do servidor (para operações muito frequentes) */
  skipServerGuard?: boolean;
  signal?: AbortSignal;
}

function fireAndForget(p: Promise<unknown>): void {
  void p.catch(() => {
    /* o registro do escudo nunca quebra a operação */
  });
}

/**
 * Executa uma chamada de API sob proteção do escudo.
 * Sempre lança `ApiShieldError` com mensagem pronta para exibir ao usuário.
 */
export async function protectedApiCall<T>(
  options: ProtectOptions,
  run: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  const {
    cardKey,
    resource,
    limit = 30,
    windowSeconds = 60,
    retries = 2,
    timeoutMs = 45_000,
    skipServerGuard = false,
    signal,
  } = options;

  const started = Date.now();

  const openFor = breakerOpen(resource);
  if (openFor > 0) {
    const err = new ApiShieldError(
      `Proteção ativa: este serviço apresentou falhas repetidas. Nova tentativa liberada em ${openFor}s.`,
      "blocked",
      undefined,
      openFor,
    );
    fireAndForget(
      registrarEventoApi({
        data: { cardKey, resource, outcome: "blocked", message: err.message, severity: "high" },
      }),
    );
    throw err;
  }

  if (!localRateOk(resource, limit, windowSeconds * 1000)) {
    const err = new ApiShieldError(
      `Muitas chamadas seguidas em "${resource}". Aguarde ${windowSeconds}s antes de tentar novamente.`,
      "blocked",
      429,
      windowSeconds,
    );
    fireAndForget(
      registrarEventoApi({
        data: { cardKey, resource, outcome: "blocked", message: err.message, severity: "medium" },
      }),
    );
    throw err;
  }

  if (!skipServerGuard) {
    try {
      const decision = await guardApiCall({ data: { resource, limit, windowSeconds } });
      if (!decision.allowed) {
        const err = new ApiShieldError(
          decision.reason ?? "Chamada bloqueada pelo escudo de segurança.",
          "blocked",
          429,
          decision.retryAfterSeconds,
        );
        fireAndForget(
          registrarEventoApi({
            data: { cardKey, resource, outcome: "blocked", message: err.message, severity: "high" },
          }),
        );
        throw err;
      }
    } catch (guardErr) {
      // Bloqueio real propaga; indisponibilidade do escudo não impede o usuário.
      if (guardErr instanceof ApiShieldError) throw guardErr;
    }
  }

  let lastError: ApiShieldError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const result = await run(controller.signal);
      breakerSuccess(resource);
      fireAndForget(
        registrarEventoApi({
          data: {
            cardKey,
            resource,
            outcome: "success",
            latencyMs: Date.now() - started,
            severity: "low",
          },
        }),
      );
      return result;
    } catch (rawErr) {
      const err = classifyError(rawErr);
      lastError = err;

      if (signal?.aborted) throw err;

      if (isRetryable(err) && attempt < retries) {
        fireAndForget(
          registrarEventoApi({
            data: {
              cardKey,
              resource,
              outcome: "retry",
              httpStatus: err.httpStatus ?? null,
              message: err.message,
              severity: "medium",
              metadata: { attempt: attempt + 1 },
            },
          }),
        );
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }

      breakerFail(resource);
      fireAndForget(
        registrarEventoApi({
          data: {
            cardKey,
            resource,
            outcome: err.kind === "timeout" ? "timeout" : "error",
            httpStatus: err.httpStatus ?? null,
            latencyMs: Date.now() - started,
            message: err.message,
            severity: err.kind === "auth" || err.kind === "server" ? "high" : "medium",
          },
        }),
      );
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastError ?? new ApiShieldError("Falha desconhecida na chamada protegida.", "unknown");
}
