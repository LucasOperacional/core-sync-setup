/**
 * Telemetria anônima e configuração de monitoramento externo.
 *
 * - Pixels/analytics recebem apenas eventos anônimos de uma lista fechada.
 * - Sentry (se algum dia for habilitado) já nasce sem dados pessoais:
 *   sendDefaultPii desligado, payloads removidos, breadcrumbs limpos e
 *   gravação de sessão desativada nas páginas com dados de pessoas.
 * - Nenhum identificador real (CPF, matrícula, nome, e-mail) é enviado:
 *   usamos um identificador interno aleatório por dispositivo.
 */

import { REDACTED, randomInternalId, sanitizeForLog, sanitizeText, sanitizeUrl } from "./redaction";

/** Eventos anônimos permitidos nos pixels. Qualquer outro é descartado. */
export const ALLOWED_PIXEL_EVENTS = [
  "view_job",
  "start_application",
  "submit_application",
  "page_view",
] as const;

export type PixelEvent = (typeof ALLOWED_PIXEL_EVENTS)[number];

const ANON_ID_KEY = "anon-monitor-id-v1";

/** Identificador interno aleatório do dispositivo — sem vínculo com a pessoa. */
export function getAnonymousMonitorId(): string {
  if (typeof window === "undefined") return randomInternalId();
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
    const created = randomInternalId();
    window.localStorage.setItem(ANON_ID_KEY, created);
    return created;
  } catch {
    return randomInternalId();
  }
}

type PixelGlobals = {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
};

/** Envia somente eventos anônimos, sem propriedades pessoais. */
export function trackAnonymousEvent(event: PixelEvent, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  if (!ALLOWED_PIXEL_EVENTS.includes(event)) return;

  // Apenas campos técnicos e contadores são permitidos junto do evento.
  const payload = sanitizeForLog(props, ["count", "step", "route", "source", "page"]) as Record<
    string,
    unknown
  >;
  // Campos não permitidos são descartados por completo (não apenas mascarados).
  const safePayload: Record<string, unknown> = { anon_id: getAnonymousMonitorId() };
  for (const [key, value] of Object.entries(payload)) {
    if (value !== REDACTED) safePayload[key] = value;
  }

  const w = window as unknown as PixelGlobals;
  try {
    w.fbq?.("trackCustom", event, safePayload);
    w.gtag?.("event", event, safePayload);
  } catch {
    /* telemetria nunca quebra a aplicação */
  }
}

/** Rotas que exibem dados de pessoas — gravação de sessão proibida. */
export const NO_SESSION_REPLAY_ROUTES = [
  "/atestados",
  "/verificador-atestados",
  "/faltas",
  "/rh",
  "/usuarios",
  "/supervisor",
  "/coordenacao",
  "/aprovacao-de-vagas",
  "/control",
  "/gps",
  "/chat-interno",
  "/chat-ia",
  "/lgpd",
  "/painel-nexti",
  "/protocolo-folhas-ponto",
  "/protocolo-limpeza-geral",
  "/assinatura-documentos",
  "/assinar",
];

export function isSessionReplayBlocked(pathname: string): boolean {
  return NO_SESSION_REPLAY_ROUTES.some((route) => pathname.startsWith(route));
}

type SentryEventLike = {
  request?: {
    data?: unknown;
    headers?: unknown;
    cookies?: unknown;
    query_string?: unknown;
    url?: unknown;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: Array<Record<string, unknown>>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
};

/** Remove tudo que possa conter dado pessoal de um evento de monitoramento. */
export function scrubMonitoringEvent<T extends SentryEventLike>(event: T): T {
  if (event.request) {
    event.request = {
      url: sanitizeUrl(event.request.url),
      data: REDACTED,
      headers: REDACTED,
      cookies: REDACTED,
      query_string: REDACTED,
    };
  }
  event.user = { id: getAnonymousMonitorId() };
  event.breadcrumbs = [];
  event.extra = {};
  event.contexts = {};
  if (event.message) event.message = sanitizeText(event.message, 300);
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((v) => ({
      ...v,
      value: sanitizeText(v.value ?? "", 300),
    }));
  }
  return event;
}

/**
 * Configuração obrigatória caso o Sentry (ou monitor equivalente) seja ligado.
 * Já sai com PII desativado, máscara total e sem breadcrumbs.
 */
export function buildMonitoringOptions(pathname = "/") {
  return {
    sendDefaultPii: false,
    attachStacktrace: true,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: isSessionReplayBlocked(pathname) ? 0 : 0,
    beforeSend: (event: SentryEventLike) => scrubMonitoringEvent(event),
    beforeBreadcrumb: () => null,
    replayOptions: {
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [] as string[],
    },
  };
}
