import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getErrorMessage,
  isInvalidServerFunctionError,
  notifyInvalidServerFunctionDetected,
  recarregarAplicacaoAtualizada,
  tentarRecargaAutomatica,
  STALE_SERVER_FUNCTION_EVENT,
} from "@/lib/server-function-refresh";

type InvalidServerFunctionNoticeProps = {
  compact?: boolean | undefined;
  className?: string | undefined;
};

export function InvalidServerFunctionNotice({
  compact = false,
  className,
}: InvalidServerFunctionNoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-primary/40 bg-card text-card-foreground shadow-sm",
        compact ? "px-4 py-3" : "px-6 py-5 text-center",
        className,
      )}
    >
      <h2
        className={cn(
          "font-display font-semibold text-foreground",
          compact ? "text-sm" : "text-lg",
        )}
      >
        Atualização necessária
      </h2>
      <p className={cn("text-muted-foreground", compact ? "mt-1 text-sm" : "mt-2 text-sm")}>
        Esta página estava com uma versão antiga aberta e tentou chamar uma função que já foi
        atualizada. Recarregue para continuar com a versão mais recente.
      </p>
      <Button className={compact ? "mt-3" : "mt-5"} onClick={recarregarAplicacaoAtualizada}>
        Recarregar agora
      </Button>
    </div>
  );
}

/**
 * Tenta recarregar automaticamente ao detectar server function desatualizada.
 * Se a recarga automática estiver em cooldown (para evitar loop), mostra o aviso manual.
 */
export function AutoReloadOrNotice({
  compact = false,
  className,
}: InvalidServerFunctionNoticeProps) {
  const [mostrarAviso, setMostrarAviso] = useState(false);

  useEffect(() => {
    const recarregou = tentarRecargaAutomatica();
    if (!recarregou) {
      // Cooldown ativo — mostra o aviso manual como fallback.
      setMostrarAviso(true);
    }
  }, []);

  if (!mostrarAviso) {
    // Está recarregando — não mostra nada.
    return null;
  }

  return <InvalidServerFunctionNotice compact={compact} className={className} />;
}

export function ServerFunctionAwareInlineError({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  if (isInvalidServerFunctionError(error)) {
    return <AutoReloadOrNotice compact {...(className ? { className } : {})} />;
  }

  return <p className={cn("text-sm text-destructive", className)}>{getErrorMessage(error)}</p>;
}

export function ServerFunctionRuntimeGuard() {
  const [detectado, setDetectado] = useState(false);
  const [mostrarAviso, setMostrarAviso] = useState(false);

  useEffect(() => {
    const detectar = () => setDetectado(true);
    const aoErro = (event: ErrorEvent) => {
      if (
        isInvalidServerFunctionError(event.error) ||
        isInvalidServerFunctionError(event.message)
      ) {
        detectar();
      }
    };
    const aoRejeitar = (event: PromiseRejectionEvent) => {
      if (isInvalidServerFunctionError(event.reason)) detectar();
    };
    const aoEvento = () => detectar();

    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    window.addEventListener(STALE_SERVER_FUNCTION_EVENT, aoEvento);

    const fetchAnterior = window.fetch;
    const fetchMonitorado: typeof window.fetch = async (input, init) => {
      const response = await fetchAnterior(input, init);
      monitorarRespostaServerFunction(input, response);
      return response;
    };
    window.fetch = fetchMonitorado;

    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
      window.removeEventListener(STALE_SERVER_FUNCTION_EVENT, aoEvento);
      if (window.fetch === fetchMonitorado) window.fetch = fetchAnterior;
    };
  }, []);

  // Quando detectado, tenta recarregar automaticamente.
  useEffect(() => {
    if (!detectado) return;
    const recarregou = tentarRecargaAutomatica();
    if (!recarregou) {
      // Cooldown ativo — mostra o banner manual como fallback.
      setMostrarAviso(true);
    }
  }, [detectado]);

  if (!mostrarAviso) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-4 py-3 print:hidden">
      <div className="mx-auto max-w-3xl">
        <InvalidServerFunctionNotice compact />
      </div>
    </div>
  );
}

function monitorarRespostaServerFunction(input: Parameters<typeof fetch>[0], response: Response) {
  if (response.status < 400) return;
  if (!isServerFunctionRequest(input)) return;

  void response
    .clone()
    .text()
    .then((body) => {
      if (isInvalidServerFunctionError(body)) notifyInvalidServerFunctionDetected();
    })
    .catch(() => {
      // Ignora respostas sem corpo legível; o erro normal da chamada ainda será tratado pelo app.
    });
}

function isServerFunctionRequest(input: Parameters<typeof fetch>[0]): boolean {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    return new URL(url, window.location.href).pathname.startsWith("/_serverFn/");
  } catch {
    return false;
  }
}
