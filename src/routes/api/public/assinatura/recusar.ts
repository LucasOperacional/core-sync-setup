/** Recusa da assinatura pelo signatário. */

import { createFileRoute } from "@tanstack/react-router";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/assinatura/recusar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { admin, hashTexto, registrarAuditoria, ipDaRequisicao, dispositivoDaRequisicao } =
          await import("@/lib/assinatura/servidor.server");

        let corpo: { token?: unknown; motivo?: unknown };
        try {
          corpo = (await request.json()) as { token?: unknown; motivo?: unknown };
        } catch {
          return json({ erro: "Requisição inválida." }, 400);
        }
        const token = typeof corpo.token === "string" ? corpo.token : "";
        const motivo = (typeof corpo.motivo === "string" ? corpo.motivo : "").slice(0, 300);
        if (token.length < 32) return json({ erro: "Link inválido." }, 400);
        if (motivo.trim().length < 3) return json({ erro: "Informe o motivo da recusa." }, 400);

        const cliente = await admin();
        const { data: signatario } = await cliente
          .from("assinatura_signatarios")
          .select("id,documento_id,nome,status")
          .eq("token_hash", await hashTexto(token))
          .maybeSingle();
        if (!signatario) return json({ erro: "Link inválido ou expirado." }, 404);
        if (signatario.status === "assinado") return json({ erro: "Já assinado." }, 409);

        const ip = ipDaRequisicao(request);
        const dispositivo = dispositivoDaRequisicao(request);
        const agora = new Date().toISOString();

        await cliente
          .from("assinatura_signatarios")
          .update({
            status: "recusado",
            recusado_em: agora,
            motivo_recusa: motivo,
            ip,
            dispositivo,
          })
          .eq("id", signatario.id);
        await cliente
          .from("assinatura_documentos")
          .update({ status: "recusado" })
          .eq("id", signatario.documento_id);
        await registrarAuditoria({
          documentoId: signatario.documento_id,
          signatarioId: signatario.id,
          evento: "assinatura_recusada",
          detalhe: motivo,
          ip,
          dispositivo,
        });

        return json({ ok: true });
      },
    },
  },
});
