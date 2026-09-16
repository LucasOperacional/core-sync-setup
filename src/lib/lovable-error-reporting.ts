import { sanitizeForLog, sanitizeText, sanitizeUrl } from "./privacy/redaction";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    new Error(
      sanitizeText(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 300),
    ),
    sanitizeForLog({
      source: "react_error_boundary",
      route: sanitizeUrl(window.location.pathname),
      ...context,
    }) as Record<string, unknown>,
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message = sanitizeText(
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${sanitizeUrl(error.url)}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error),
    300,
  );
  const stack = error instanceof Error && error.stack ? sanitizeText(error.stack, 2000) : undefined;
  window.__lovableReportRuntimeError?.({
    message,
    ...(stack !== undefined && { stack }),
    filename: sanitizeUrl(window.location.pathname),
  });
}
