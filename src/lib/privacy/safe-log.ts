/**
 * Registro (log) protegido — única forma autorizada de gravar diagnóstico.
 *
 * Nunca registra a requisição completa: apenas os campos técnicos permitidos,
 * já sanitizados. Detalhes sensíveis nunca chegam ao console, ao servidor,
 * ao Sentry, à Cloudflare ou a qualquer ferramenta externa.
 */

import {
  LOG_ALLOWED_FIELDS,
  REDACTED,
  sanitizeForLog,
  sanitizeText,
  sanitizeUrl,
} from "./redaction";

export type SafeLogFields = Record<string, unknown>;

export function buildSafeLog(event: string, fields: SafeLogFields = {}): Record<string, unknown> {
  return {
    event: sanitizeText(event, 120),
    ...(sanitizeForLog(fields, LOG_ALLOWED_FIELDS) as Record<string, unknown>),
  };
}

export function safeLog(event: string, fields?: SafeLogFields): void {
  console.log(JSON.stringify(buildSafeLog(event, fields)));
}

export function safeWarn(event: string, fields?: SafeLogFields): void {
  console.warn(JSON.stringify(buildSafeLog(event, fields)));
}

/** Registra falhas mantendo somente tipo/código do erro — nunca o conteúdo. */
export function safeError(event: string, error: unknown, fields?: SafeLogFields): void {
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(
    JSON.stringify({
      ...buildSafeLog(event, fields),
      errorKind: sanitizeText(kind, 60),
      reason: sanitizeText(error instanceof Error ? error.message : String(error ?? ""), 300),
    }),
  );
}

/** Sanitiza uma requisição para diagnóstico: método, rota e status apenas. */
export function safeRequestSummary(input: {
  method?: string;
  url?: string;
  status?: number;
}): Record<string, unknown> {
  return {
    method: sanitizeText(input.method ?? "", 10),
    route: sanitizeUrl(input.url ?? ""),
    status: typeof input.status === "number" ? input.status : null,
  };
}

export { REDACTED, sanitizeForLog, sanitizeText, sanitizeUrl };
