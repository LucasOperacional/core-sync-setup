/** Dispara os avisos programados cujo horário já chegou.
 * Exige o segredo x-internal-secret (PUSH_INTERNAL_SECRET); pode ser chamado por um agendador.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/push/processar-agenda")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["PUSH_INTERNAL_SECRET"] ?? "";
        const enviado = request.headers.get("x-internal-secret") ?? "";
        if (!segredo) return json({ erro: "PUSH_INTERNAL_SECRET não configurado." }, 503);
        if (enviado.length !== segredo.length || enviado !== segredo) {
          return json({ erro: "Não autorizado." }, 401);
        }

        try {
          const { processarAgendamentosVencidos } = await import("@/lib/push-agenda.server");
          const resumo = await processarAgendamentosVencidos();
          return json({ ok: true, ...resumo }, 200);
        } catch (erro) {
          return json({ erro: erro instanceof Error ? erro.message : "Falha na agenda." }, 500);
        }
      },
    },
  },
});
