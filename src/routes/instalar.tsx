import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Share, CheckCircle2, Smartphone, Lock } from "lucide-react";
import { appInstalado, marcarAppInstalado } from "@/lib/app-instalado";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar aplicativo | CIOP" },
      {
        name: "description",
        content:
          "Instale o CIOP no celular para acesso rápido em tela cheia e envio do GPS em segundo plano.",
      },
      { property: "og:title", content: "Instalar aplicativo | CIOP" },
      {
        property: "og:description",
        content: "Adicione o CIOP à tela inicial do seu celular.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),

  component: InstalarPage,
});

type PromptEvent = Event & { prompt: () => Promise<void> };

function InstalarPage() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const aoReceber = (evento: Event) => {
      evento.preventDefault();
      setPrompt(evento as PromptEvent);
    };
    window.addEventListener("beforeinstallprompt", aoReceber);
    // Regra: instalado o aplicativo, o GPS fica travado e já começa a alimentar
    // o rastreio em tempo real — pede a permissão de localização na hora.
    const travarGps = () => {
      navigator.geolocation?.getCurrentPosition(
        () => undefined,
        () => undefined,
        { enableHighAccuracy: true, timeout: 20_000 },
      );
    };
    const aoInstalar = () => {
      marcarAppInstalado();
      setInstalado(true);
      travarGps();
    };
    window.addEventListener("appinstalled", aoInstalar);

    setIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    const jaInstalado = appInstalado();
    setInstalado(jaInstalado);
    if (jaInstalado) travarGps();

    return () => {
      window.removeEventListener("beforeinstallprompt", aoReceber);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Painel Inicial
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold uppercase sm:text-4xl">
            <Smartphone className="size-8 text-primary" />
            Instalar aplicativo
          </h1>
          <p className="mt-2 text-sm normal-case text-muted-foreground">
            Coloque o sistema na tela inicial do celular. Ele abre em tela cheia, como um
            aplicativo, e continua enviando o GPS do supervisor em segundo plano.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {instalado ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-5">
            <CheckCircle2 className="size-6 text-primary" />
            <p className="text-sm font-medium">
              O aplicativo já está instalado neste aparelho. Abra pelo ícone na tela inicial.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase">Instalação</h2>
            {prompt ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Toque no botão abaixo e confirme a instalação.
                </p>
                <button
                  onClick={() => {
                    void prompt.prompt();
                    setPrompt(null);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="size-4" /> Instalar agora
                </button>
              </>
            ) : ios ? (
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Share className="mt-0.5 size-4 shrink-0 text-primary" />
                  No Safari, toque no botão de compartilhar (quadrado com a seta para cima).
                </li>
                <li>2. Escolha “Adicionar à Tela de Início”.</li>
                <li>3. Confirme em “Adicionar”. O ícone aparece na tela inicial.</li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Abra este endereço no Chrome do celular.</li>
                <li>2. Toque no menu (três pontinhos) no canto superior direito.</li>
                <li>3. Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</li>
              </ol>
            )}
          </div>
        )}

        {instalado ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
            <Lock className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold uppercase text-amber-700">
                Localização travada
              </h2>
              <p className="mt-1 text-sm normal-case text-muted-foreground">
                Com o aplicativo instalado, a localização deste aparelho fica ligada de forma
                permanente e não pode ser desligada pelo sistema. Mantenha a permissão de
                localização como “Permitir sempre” nas configurações do celular.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
