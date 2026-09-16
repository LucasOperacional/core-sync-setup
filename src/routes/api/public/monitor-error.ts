import { createFileRoute } from "@tanstack/react-router";
import { encaminharErro } from "@/lib/monitor.server";
import { sanitizeText, sanitizeUrl } from "@/lib/privacy/redaction";

/**
 * Recebe erros técnicos do navegador (JavaScript, promessas, HTTP 4xx/5xx,
 * falhas do backend, tempo esgotado) e os encaminha ao painel central.
 *
 * Somente informação técnica sanitizada é aceita e armazenada: nenhum dado
 * pessoal, documento ou credencial chega ao monitor.
 */

const TIPOS = new Set([
  "javascript",
  "onerror",
  "unhandledrejection",
  "http",
  "supabase",
  "network",
  "timeout",
]);

export const Route = createFileRoute("/api/public/monitor-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const responder = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });

        let corpo: Record<string, unknown>;
        try {
          corpo = (await request.json()) as Record<string, unknown>;
        } catch {
          return responder({ ok: false }, 400);
        }

        const tipo = String(corpo["tipo"] ?? "javascript");
        if (!TIPOS.has(tipo)) return responder({ ok: false }, 400);

        const mensagem = sanitizeText(corpo["mensagem"], 400);
        if (!mensagem.trim()) return responder({ ok: false }, 400);

        const rota = corpo["rota"] ? sanitizeUrl(corpo["rota"]) : null;
        const statusHttpBruto = Number(corpo["statusHttp"]);
        const statusHttp = Number.isFinite(statusHttpBruto) ? statusHttpBruto : null;
        const origem = corpo["origem"] ? sanitizeText(corpo["origem"], 60) : "browser";

        let enviado = false;
        try {
          enviado = await encaminharErro({ tipo, mensagem, rota, statusHttp, origem });
        } catch {
          // canal de aviso indisponível — segue o registro
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Limite de chamadas por dispositivo/IP para impedir rajadas.
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for") ??
            "desconhecido";
          try {
            const { data } = await supabaseAdmin.rpc("security_check_rate_limit", {
              _identity: `monitor-error:${ip.split(",")[0]?.trim() ?? ip}`,
              _resource: "monitor_error",
              _limit: 30,
              _window_seconds: 60,
            });
            const r = (data ?? {}) as Record<string, unknown>;
            if (r["allowed"] === false) return responder({ ok: false, limited: true }, 429);
          } catch {
            // escudo indisponível — segue o registro
          }

          await supabaseAdmin.from("monitor_errors").insert({
            tipo,
            mensagem,
            rota,
            status_http: statusHttp,
            origem,
            enviado,
          });
        } catch {
          // banco indisponível: o monitor nunca deve derrubar a página
          return responder({ ok: true, stored: false, forwarded: enviado }, 202);
        }

        return responder({ ok: true, forwarded: enviado }, 202);
      },
    },
  },
});
