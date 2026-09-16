import { Component, type ErrorInfo, type ReactNode } from "react";
import { OperationalAI } from "@/lib/operational-ai";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  recovering: boolean;
  errorMessage: string;
}

/**
 * Error Boundary integrada à IA Operacional.
 *
 * Captura erros de renderização, registra no motor, e mostra
 * tela amigável com botão de recuperação.
 */
export class OperationalErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, recovering: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error?.message ?? "Erro de renderização" };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      const ai = OperationalAI.getInstance();
      ai.captureError({
        errorType: "react_render_error",
        message: error?.message ?? "Erro de renderização desconhecido",
        technicalDetails: `${error?.stack ?? ""}\n\nComponent stack: ${info?.componentStack ?? "N/A"}`,
        severity: "high",
        component: this.props.componentName,
      });
    } catch (e) {
      console.warn("[OperationalErrorBoundary] Falha ao registrar erro na IA Operacional:", e);
    }
  }

  override componentWillUnmount() {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
  }

  handleRetry = () => {
    if (this.retryCount >= 3) {
      return;
    }
    this.retryCount++;
    this.setState({ hasError: false, recovering: true, errorMessage: "" });
    
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {
      this.setState({ recovering: false });
    }, 500);
  };

  override render() {
    if (this.state.recovering) {
      return (
        <div className="flex min-h-[200px] items-center justify-center bg-background">
          <div className="text-center">
            <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-sm text-muted-foreground">
              Identificamos uma instabilidade e estamos tentando recuperar esta função.
            </p>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[200px] items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-md border border-destructive/25 bg-destructive/10">
              <svg
                className="size-6 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">
              Não foi possível recuperar esta função automaticamente.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O erro foi registrado para análise.
            </p>
            {this.retryCount < 3 && (
              <button
                onClick={this.handleRetry}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tentar novamente
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
