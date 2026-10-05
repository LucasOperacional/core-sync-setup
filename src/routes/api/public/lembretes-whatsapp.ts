import { createFileRoute } from "@tanstack/react-router";
import { comparaSegredo } from "@/lib/monitor.server";

/** Disparo dos lembretes de WhatsApp vencidos — chamado pelo agendador do banco a cada minuto. */

async function autorizado(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const cronSecret = (process.env["LOVABLE_CRON_SECRET"] ?? "").trim();
  if (cronSecret && comparaSegredo(token, cronSecret)) return true;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("monitor_cron").select("token").limit(1).maybeSingle();
    return !!data?.token && comparaSegredo(token, data.token);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/lembretes-whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await autorizado(request))) {
          return new Response(JSON.stringify({ status: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const { dispararLembretesVencidos } = await import("@/lib/lembretes-whatsapp.functions");
          const r = await dispararLembretesVencidos();
          return new Response(JSON.stringify({ ok: true, ...r }), {
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
