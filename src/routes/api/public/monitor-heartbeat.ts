import { createFileRoute } from "@tanstack/react-router";
import { comparaSegredo, enviarHeartbeat } from "@/lib/monitor.server";

/**
 * Heartbeat do projeto — chamado pelo agendador do banco a cada minuto.
 * Autenticação por token interno (nunca exposto ao navegador).
 */

async function autorizado(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;

  const cronSecret = (process.env["LOVABLE_CRON_SECRET"] ?? "").trim();
  if (cronSecret && comparaSegredo(token, cronSecret)) return true;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("monitor_cron")
      .select("token")
      .limit(1)
      .maybeSingle();
    return !!data?.token && comparaSegredo(token, data.token);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/monitor-heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await autorizado(request))) {
          return new Response(JSON.stringify({ status: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const resultado = await enviarHeartbeat();
        return new Response(
          JSON.stringify({
            sent: resultado.ok,
            skipped: resultado.ignorado ?? false,
            attempts: resultado.tentativas,
            status: resultado.saude.status,
            latency_ms: resultado.saude.latency_ms,
            checks: resultado.saude.checks,
            ...(resultado.erro ? { error: resultado.erro } : {}),
          }),
          {
            status: resultado.ok ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
