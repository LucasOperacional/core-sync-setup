/**
 * Envia o código de confirmação para o signatário (e-mail).
 * O código nunca é devolvido na resposta e é guardado apenas como hash.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/assinatura/codigo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { admin, hashTexto, registrarAuditoria, ipDaRequisicao } =
          await import("@/lib/assinatura/servidor.server");

        let corpo: { token?: unknown };
        try {
          corpo = (await request.json()) as { token?: unknown };
        } catch {
          return json({ erro: "Requisição inválida." }, 400);
        }
        const token = typeof corpo.token === "string" ? corpo.token : "";
        if (token.length < 32) return json({ erro: "Link inválido." }, 400);

        const cliente = await admin();
        const { data: signatario } = await cliente
          .from("assinatura_signatarios")
          .select("id,documento_id,nome,email,status")
          .eq("token_hash", await hashTexto(token))
          .maybeSingle();
        if (!signatario) return json({ erro: "Link inválido ou expirado." }, 404);
        if (signatario.status === "assinado") return json({ erro: "Já assinado." }, 409);
        if (!signatario.email) {
          return json(
            { erro: "Não há e-mail cadastrado para receber o código. Peça o reenvio do link." },
            400,
          );
        }

        const codigo = String(Math.floor(100000 + Math.random() * 900000));
        const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await cliente
          .from("assinatura_signatarios")
          .update({ codigo_hash: await hashTexto(codigo), codigo_expira_em: expira })
          .eq("id", signatario.id);

        try {
          const { sendLovableEmail } = await import("@lovable.dev/email-js");
          const html = `<p>Olá, ${signatario.nome}.</p><p>Seu código de confirmação é <strong style="font-size:20px">${codigo}</strong>.</p><p>Ele vale por 10 minutos. Se você não solicitou, ignore este e-mail.</p>`;
          await sendLovableEmail(
            {
              from: "Assinatura de Documentos <assinatura@notify.email.operacional.cloud>",
              sender_domain: "notify.email.operacional.cloud",
              to: signatario.email,
              subject: "Código de confirmação da assinatura",
              html,
              text: `Olá, ${signatario.nome}. Seu código de confirmação é ${codigo}. Ele vale por 10 minutos.`,
            },
            { apiKey: process.env["LOVABLE_API_KEY"]! },
          );
        } catch {
          return json(
            {
              erro: "Não foi possível enviar o código agora. O domínio de envio de e-mails precisa estar verificado.",
            },
            502,
          );
        }

        await registrarAuditoria({
          documentoId: signatario.documento_id,
          signatarioId: signatario.id,
          evento: "codigo_enviado",
          ip: ipDaRequisicao(request),
        });

        return json({ ok: true });
      },
    },
  },
});
