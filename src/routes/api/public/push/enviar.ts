/** Envio interno de notificações disparado por eventos do próprio sistema.
 * Exige o segredo x-internal-secret (PUSH_INTERNAL_SECRET). Sem ele, nada é enviado.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ehCategoriaPush, MAX_DESTINATARIOS, rotaInternaValida } from "@/lib/push-tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function origensPermitidas(): string[] {
  return (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function cabecalhosCors(origem: string | null): Record<string, string> {
  const permitidas = origensPermitidas();
  if (!origem || !permitidas.includes(origem)) return {};
  return {
    "access-control-allow-origin": origem,
    "access-control-allow-headers": "content-type, x-internal-secret",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
}

function json(corpo: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/public/push/enviar")({
  server: {
    handlers: {
      OPTIONS: ({ request }) =>
        new Response(null, { status: 204, headers: cabecalhosCors(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const cors = cabecalhosCors(request.headers.get("origin"));
        const segredo = process.env["PUSH_INTERNAL_SECRET"] ?? "";
        const enviado = request.headers.get("x-internal-secret") ?? "";

        if (!segredo) {
          return json({ erro: "PUSH_INTERNAL_SECRET não configurado." }, 503, cors);
        }
        if (enviado.length !== segredo.length || enviado !== segredo) {
          return json({ erro: "Não autorizado." }, 401, cors);
        }

        let corpo: Record<string, unknown>;
        try {
          corpo = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ erro: "Corpo inválido." }, 400, cors);
        }

        const category = corpo["category"];
        const event = corpo["event"];
        if (!ehCategoriaPush(category)) return json({ erro: "Categoria inválida." }, 400, cors);
        if (typeof event !== "string" || !event.trim() || event.length > 80) {
          return json({ erro: "Evento inválido." }, 400, cors);
        }

        const ids = Array.isArray(corpo["recipient_user_ids"])
          ? (corpo["recipient_user_ids"] as unknown[]).map(String)
          : [];
        if (ids.length === 0) return json({ erro: "Informe os destinatários." }, 400, cors);
        if (ids.length > MAX_DESTINATARIOS)
          return json({ erro: "Muitos destinatários." }, 400, cors);
        if (ids.some((id) => !UUID.test(id)))
          return json({ erro: "Destinatário inválido." }, 400, cors);

        try {
          const { dispararNotificacao } = await import("@/lib/push-envio.server");
          const r = await dispararNotificacao({
            category,
            event: event.trim(),
            recipientUserIds: [...new Set(ids)],
            context: (corpo["context"] as Record<string, unknown> | undefined) ?? null,
            targetUrl: rotaInternaValida(corpo["target_url"]),
            deduplicationKey:
              typeof corpo["deduplication_key"] === "string"
                ? corpo["deduplication_key"].slice(0, 200)
                : null,
            ignorarHorarioSilencioso: corpo["critico"] === true,
          });
          return json({ ok: r.ok, fonte: r.fonte, resultados: r.resultados }, 200, cors);
        } catch (erro) {
          return json(
            { erro: erro instanceof Error ? erro.message : "Falha no envio." },
            500,
            cors,
          );
        }
      },
    },
  },
});
