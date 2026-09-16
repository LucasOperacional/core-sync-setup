/**
 * Sanitizador central de dados pessoais e sensíveis.
 *
 * Toda informação que sai do sistema para registros (logs), alertas, telemetria,
 * monitoramento ou ferramentas externas DEVE passar por aqui primeiro.
 *
 * Regra base: negar por padrão. Em objetos usamos lista de campos permitidos
 * (allowlist); qualquer campo fora da lista é substituído por [DADO_PROTEGIDO].
 */

export const REDACTED = "[DADO_PROTEGIDO]";

/** Campos técnicos permitidos em logs/telemetria. Nada fora desta lista é registrado. */
export const LOG_ALLOWED_FIELDS = [
  "action",
  "attempt",
  "browser",
  "cardKey",
  "code",
  "count",
  "duration",
  "durationMs",
  "elapsedMs",
  "environment",
  "errorCode",
  "errorKind",
  "event",
  "eventId",
  "httpStatus",
  "kind",
  "latencyMs",
  "limit",
  "method",
  "mechanism",
  "outcome",
  "page",
  "platform",
  "reason",
  "release",
  "requestId",
  "resource",
  "retryAfterSeconds",
  "route",
  "severity",
  "size",
  "source",
  "status",
  "statusCode",
  "step",
  "table",
  "timestamp",
  "traceId",
  "version",
] as const;

/** Nomes de campos sempre proibidos, mesmo que apareçam aninhados. */
const DENY_FIELD_PATTERN =
  /(cpf|cnpj|rg|cid|atestado|curriculo|currículo|candidat|nome|name|full_?name|display_?name|email|mail|phone|telefone|celular|whatsapp|senha|password|secret|token|jwt|bearer|cookie|session|authorization|apikey|api_?key|key|matricula|matrícula|endereco|endereço|address|cep|birth|nascimento|documento|document|file_?name|filename|path|url|payload|body|content|texto|message_?body|anexo|attachment|diagnostic|diagnostico|diagnóstico|prontuario|prontuário|salario|salário|pix|conta|agencia|agência|cartao|cartão)/i;

const PATTERNS: Array<RegExp> = [
  // CPF (com ou sem máscara)
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  // CNPJ
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  // CID-10 (ex.: J06.9, M54)
  /\b[A-TV-Z]\d{2}(\.\d{1,2})?\b/g,
  // E-mail
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  // Telefone brasileiro
  /(\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
  // CRM / registro profissional
  /\bCRM[\s/:-]*[A-Z]{0,2}[\s-]*\d{3,8}\b/gi,
  // Tokens/JWT
  /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g,
  // Chaves de API conhecidas
  /\b(sb_(publishable|secret)_[\w-]{10,}|sk-[\w-]{10,}|AIza[\w-]{20,}|Bearer\s+[\w.\-+/=]{10,})/gi,
  // Cartão de crédito (4 grupos de 4 dígitos, com ou sem separador)
  /\b\d{4}[ .-]?\d{4}[ .-]?\d{4}[ .-]?\d{1,4}\b/g,
];

/** Substitui dados sensíveis dentro de um texto livre. */
export function sanitizeText(input: unknown, maxLength = 500): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  for (const pattern of PATTERNS) text = text.replace(pattern, REDACTED);
  // Remove pares "campo: valor" cujo nome do campo é proibido.
  text = text.replace(
    /\b([\w.\-[\]]+)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;)}\]]+)/g,
    (match, field: string) => (DENY_FIELD_PATTERN.test(field) ? `${field}=${REDACTED}` : match),
  );
  return text.slice(0, maxLength);
}

/** Remove qualquer dado pessoal de uma URL: mantém apenas origem + caminho. */
export function sanitizeUrl(input: unknown): string {
  const raw = typeof input === "string" ? input : String(input ?? "");
  try {
    const url = new URL(raw, "http://local");
    const path = url.pathname
      .split("/")
      .map((part) => (PATTERNS.some((p) => new RegExp(p.source).test(part)) ? REDACTED : part))
      .join("/");
    return url.origin === "http://local" ? path : `${url.origin}${path}`;
  } catch {
    return sanitizeText(raw.split("?")[0] ?? "", 300);
  }
}

/** Nome de arquivo seguro: sem nome, CPF ou documento da pessoa. */
export function safeFileName(extension: string, prefix = "arquivo"): string {
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${prefix}-${randomInternalId()}${ext ? `.${ext}` : ""}`;
}

/** Identificador interno aleatório para eventos de monitoramento. */
export function randomInternalId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Aplica a lista de campos permitidos a um objeto e sanitiza os valores restantes.
 * Campos fora da allowlist viram [DADO_PROTEGIDO] (a chave é mantida para diagnóstico).
 */
export function sanitizeForLog(
  value: unknown,
  allowed: readonly string[] = LOG_ALLOWED_FIELDS,
  depth = 0,
): unknown {
  if (value == null) return value;
  if (depth > 4) return REDACTED;

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeText(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return sanitizeText(`${value.name}: ${value.message}`);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item, allowed, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (DENY_FIELD_PATTERN.test(key) || !allowed.includes(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = sanitizeForLog(raw, allowed, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

/** Verifica se um valor ainda contém algum indício de dado sensível (usado nos testes). */
export function containsSensitiveData(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const withoutRedactions = text.split(REDACTED).join("");
  return PATTERNS.some((pattern) =>
    new RegExp(pattern.source, pattern.flags).test(withoutRedactions),
  );
}

/** Mensagem segura para exibir ao usuário — sem detalhe técnico nem dado pessoal. */
export function safeUserMessage(fallback = "Não foi possível concluir a operação."): string {
  return fallback;
}
