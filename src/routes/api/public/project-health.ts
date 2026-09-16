import { createFileRoute } from "@tanstack/react-router";
import { comparaSegredo, lerConfigMonitor, verificarSaude } from "@/lib/monitor.server";

/**
 * Endpoint de saúde do projeto para o painel central (Lovable Monitor).
 * 200 = saudável · 503 = falha crítica · 401 = chave inválida.
 * Nunca devolve credenciais, dados de usuários ou informação interna sensível.
 */

const CORS_BASE = {
  "Access-Control-Allow-Headers": "authorization, content-type, x-project-id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

/** CORS somente para a origem do painel central e a URL pública do projeto. */
function origemPermitida(request: Request): Record<string, string> {
  const { config } = lerConfigMonitor();
  const origem = request.headers.get("origin") ?? "";
  const permitidas = [config.apiUrl, config.publicUrl]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return origem && permitidas.includes(origem)
    ? { ...CORS_BASE, "Access-Control-Allow-Origin": origem, Vary: "Origin" }
    : CORS_BASE;
}

export const Route = createFileRoute("/api/public/project-health")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: origemPermitida(request) }),
      GET: async ({ request }) => {
        const headers = { "content-type": "application/json", ...origemPermitida(request) };
        const { config } = lerConfigMonitor();

        // Quando existe chave do monitor, exigimos Bearer válido.
        if (config.apiKey) {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
          const projeto = request.headers.get("x-project-id");
          if (!comparaSegredo(token, config.apiKey)) {
            return new Response(JSON.stringify({ status: "unauthorized" }), {
              status: 401,
              headers,
            });
          }
          if (projeto && config.projectId && projeto !== config.projectId) {
            return new Response(JSON.stringify({ status: "unauthorized" }), {
              status: 401,
              headers,
            });
          }
        }

        const saude = await verificarSaude();
        return new Response(JSON.stringify(saude), {
          status: saude.status === "healthy" ? 200 : 503,
          headers,
        });
      },
    },
  },
});
