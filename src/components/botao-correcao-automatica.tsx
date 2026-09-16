import { useCallback, useState } from "react";
import { Wrench, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Botão de correção automática da prévia.
 * Limpa caches do navegador, service workers e dados temporários
 * (mantendo a sessão de login) e recarrega a aplicação.
 */
export function BotaoCorrecaoAutomatica() {
  const [executando, setExecutando] = useState(false);

  const corrigir = useCallback(async () => {
    if (executando) return;
    setExecutando(true);
    toast.loading("Executando correção automática...", { id: "correcao-preview" });

    try {
      // 1. Remove service workers que podem servir versões antigas da prévia.
      if ("serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((r) => r.unregister().catch(() => false)));
      }

      // 2. Limpa os caches do navegador.
      if (typeof caches !== "undefined") {
        const chaves = await caches.keys();
        await Promise.all(chaves.map((c) => caches.delete(c).catch(() => false)));
      }

      // 3. Limpa dados temporários preservando a sessão de autenticação.
      try {
        const preservar = Object.keys(localStorage).filter(
          (k) => k.startsWith("sb-") || k.includes("auth"),
        );
        const backup = preservar.map((k) => [k, localStorage.getItem(k)] as const);
        localStorage.clear();
        for (const [k, v] of backup) if (v !== null) localStorage.setItem(k, v);
        sessionStorage.clear();
      } catch {
        // Armazenamento indisponível — segue para o recarregamento.
      }

      toast.success("Correção aplicada. Recarregando a prévia...", {
        id: "correcao-preview",
      });

      // 4. Recarrega ignorando o cache.
      const url = new URL(window.location.href);
      url.searchParams.set("_fix", Date.now().toString());
      window.setTimeout(() => window.location.replace(url.toString()), 600);
    } catch (erro) {
      console.error("[correcao-automatica]", erro);
      toast.error("Não foi possível concluir a correção automática.", {
        id: "correcao-preview",
      });
      setExecutando(false);
    }
  }, [executando]);

  return (
    <button
      type="button"
      onClick={corrigir}
      disabled={executando}
      title="Correção automática da prévia"
      aria-label="Correção automática da prévia"
      className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
    >
      {executando ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
      <span className="hidden sm:inline">Correção automática</span>
    </button>
  );
}
