import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint público de monitoramento (health check).
 * Requer um token de integração criado no Painel Administrativo:
 *   Authorization: Bearer ciop_mon_xxxxxxxx
 * Retorna o status do sistema e registra cada chamada para o painel.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/monitor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const inicio = Date.now();
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

        if (!token || !token.startsWith("ciop_mon_")) {
          return json({ status: "unauthorized", error: "Token de integração ausente." }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(token);

        const { data: tokenRow } = await supabaseAdmin
          .from("monitoring_tokens")
          .select("id, revogado_em, total_requisicoes")
          .eq("token_hash", hash)
          .maybeSingle();

        if (!tokenRow || tokenRow.revogado_em) {
          return json({ status: "unauthorized", error: "Token inválido ou revogado." }, 401);
        }

        // Verificação de saúde: leitura leve no banco.
        let dbOk = true;
        let erroDb: string | null = null;
        try {
          const { error } = await supabaseAdmin
            .from("user_roles")
            .select("user_id", { count: "exact", head: true });
          if (error) {
            dbOk = false;
            erroDb = error.message;
          }
        } catch (err) {
          dbOk = false;
          erroDb = err instanceof Error ? err.message : "erro desconhecido";
        }

        const duracao = Date.now() - inicio;
        const status = dbOk ? 200 : 503;

        await Promise.all([
          supabaseAdmin
            .from("monitoring_tokens")
            .update({
              last_used_at: new Date().toISOString(),
              total_requisicoes: (tokenRow.total_requisicoes ?? 0) + 1,
            })
            .eq("id", tokenRow.id),
          supabaseAdmin.from("monitoring_pings").insert({
            token_id: tokenRow.id,
            endpoint: "/api/public/monitor",
            status,
            duracao_ms: duracao,
            ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
            user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          }),
        ]);

        return json(
          {
            status: dbOk ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            responseTimeMs: duracao,
            checks: {
              api: "ok",
              database: dbOk ? "ok" : "fail",
              ...(erroDb ? { erro: erroDb } : {}),
            },
          },
          status,
        );
      },
    },
  },
});
