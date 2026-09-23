import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";

/* Recursos que acompanham todas as telas são carregados depois da primeira
   pintura: a página abre mais rápido e nada é perdido. */
const ChatAssistant = lazy(() =>
  import("../components/ChatAssistant").then((m) => ({ default: m.ChatAssistant })),
);
const RastreioSempreAtivo = lazy(() =>
  import("../components/CompartilharLocalizacaoCard").then((m) => ({
    default: m.CompartilharLocalizacaoCard,
  })),
);
const RegistroAtividadeAuto = lazy(() =>
  import("../components/RegistroAtividadeAuto").then((m) => ({ default: m.RegistroAtividadeAuto })),
);
const SinoNotificacoes = lazy(() =>
  import("../components/SinoNotificacoes").then((m) => ({ default: m.SinoNotificacoes })),
);

/* ─── 404 Page ─── */

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Global Error Boundary ─── */

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    // Log technical details to console for debugging — never expose to user.
    console.error("[ErrorBoundary]", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    reportLovableError(error, { boundary: "tanstack_root_error_component" });

    // Register with IA Operacional (carregada sob demanda)
    void import("../lib/operational-ai")
      .then(({ OperationalAI }) =>
        OperationalAI.getInstance().captureError({
          errorType: "root_error_boundary",
          message: error?.message ?? "Unknown root error",
          technicalDetails: error?.stack,
          severity: "critical",
          component: "__root.tsx",
        }),
      )
      .catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="size-8 text-destructive"
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou volte à página inicial.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Loading Screen ─── */

function PendingComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

/* ─── Route Definition ─── */

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "CIOP" },
      { name: "description", content: "CIOP — Painel Central Operacional" },
      { name: "author", content: "Lovable" },
      { name: "theme-color", content: "#0F172A" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "CIOP" },
      { property: "og:title", content: "CIOP" },
      { property: "og:description", content: "CIOP — Painel Central Operacional" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
  pendingComponent: PendingComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <HeadContent />
        <style>
          {`
            /* Ocultar badge automático de marca d'água da plataforma */
            #lovable-badge,
            .lovable-badge,
            a[href*="lovable.dev"] {
              display: none !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          `}
        </style>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("tema-app");if(t==="claro"){document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}`,
          }}
        />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [mounted, setMounted] = useState(false);

  // Os serviços de fundo entram só depois que a tela já apareceu.
  useEffect(() => {
    const ocioso =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));

    const id = ocioso(() => {
      setMounted(true);

      void import("../lib/operational-ai")
        .then(({ OperationalAI }) => {
          const ai = OperationalAI.getInstance();
          ai.init();
          ai.restoreFormData();
        })
        .catch(() => {});

      // Mark the signed-in user as online as soon as the app is opened.
      void import("../lib/presence").then(({ startPresence }) => startPresence());
    });
    void id;


    // Regra geral: as APIs ligadas pelo superadmin valem para todos os usuários
    // e para todos os cards. Falha aqui nunca interrompe a tela.
    void import("../lib/api-globais")
      .then(({ aplicarApisGlobais }) => aplicarApisGlobais())
      .catch(() => {});

    // Captura de erros técnicos para o monitoramento central (sem dados pessoais).
    void import("../lib/monitor-client")
      .then(({ instalarCapturaErros }) => instalarCapturaErros())
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
      {mounted && (
        <Suspense fallback={null}>
          <SinoNotificacoes />
          <RegistroAtividadeAuto />
          <ChatAssistant />
          {/* Rastreio do supervisor: fica ativo em qualquer página, invisível. */}
          <div className="hidden">
            <RastreioSempreAtivo />
          </div>
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
