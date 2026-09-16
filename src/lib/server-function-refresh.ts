export const INVALID_SERVER_FUNCTION_ID_TEXT = "Invalid server function ID";
export const SERVER_FUNCTION_INFO_NOT_FOUND_TEXT = "Server function info not found";
export const STALE_SERVER_FUNCTION_EVENT = "protocolo:stale-server-function";

const STALE_SERVER_FUNCTION_MARKERS = [
  INVALID_SERVER_FUNCTION_ID_TEXT,
  SERVER_FUNCTION_INFO_NOT_FOUND_TEXT,
  "server function id",
  "/_serverFn/",
];

/** Chave usada no sessionStorage para evitar loop infinito de recargas. */
const AUTO_RELOAD_KEY = "protocolo:auto-reload-ts";
/** Intervalo mínimo entre recargas automáticas (ms). */
const AUTO_RELOAD_COOLDOWN_MS = 10_000;

export function isInvalidServerFunctionError(error: unknown): boolean {
  return containsInvalidServerFunctionMarker(error, new Set<unknown>());
}

export function notifyInvalidServerFunctionDetected() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STALE_SERVER_FUNCTION_EVENT));
}

export function recarregarAplicacaoAtualizada() {
  if (typeof window === "undefined") return;
  window.location.reload();
}

/**
 * Tenta recarregar a página automaticamente quando uma server function
 * desatualizada é detectada.  Usa sessionStorage para não entrar em loop
 * caso a recarga não resolva (ex.: deploy ainda não propagou).
 *
 * @returns `true` se iniciou a recarga, `false` se está em cooldown.
 */
export function tentarRecargaAutomatica(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const ultimaRecarga = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) || "0");
    if (Date.now() - ultimaRecarga < AUTO_RELOAD_COOLDOWN_MS) {
      // Já recarregou recentemente — não recarregar de novo para evitar loop.
      return false;
    }
    sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponível (ex.: iframe sandboxed) — recarrega mesmo assim.
  }

  window.location.reload();
  return true;
}

export function getErrorMessage(error: unknown, fallback = "Não foi possível carregar os dados.") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function containsInvalidServerFunctionMarker(error: unknown, seen: Set<unknown>): boolean {
  if (error == null) return false;

  if (typeof error === "string") return textHasInvalidServerFunctionMarker(error);
  if (typeof error === "number" || typeof error === "boolean") return false;

  if (seen.has(error)) return false;
  seen.add(error);

  if (error instanceof Response) {
    return error.url.includes("/_serverFn/") && error.status >= 400;
  }

  if (error instanceof Error) {
    if (textHasInvalidServerFunctionMarker(error.message)) return true;
    if (textHasInvalidServerFunctionMarker(error.stack ?? "")) return true;
    return containsInvalidServerFunctionMarker(error.cause, seen);
  }

  if (typeof error === "object") {
    const maybeRecord = error as Record<string, unknown>;
    const fields = [
      maybeRecord["message"],
      maybeRecord["stack"],
      maybeRecord["statusText"],
      maybeRecord["url"],
      maybeRecord["cause"],
      maybeRecord["error"],
    ];
    return fields.some((field) => containsInvalidServerFunctionMarker(field, seen));
  }

  return false;
}

function textHasInvalidServerFunctionMarker(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!normalized) return false;
  const hasServerFnPath = normalized.includes("/_serverfn/");
  const hasInvalidId = normalized.includes(INVALID_SERVER_FUNCTION_ID_TEXT.toLowerCase());
  const hasMissingInfo = normalized.includes(SERVER_FUNCTION_INFO_NOT_FOUND_TEXT.toLowerCase());
  if (hasInvalidId || hasMissingInfo) return true;
  return (
    hasServerFnPath && STALE_SERVER_FUNCTION_MARKERS.some((marker) => normalized.includes(marker))
  );
}
