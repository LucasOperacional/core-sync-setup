/**
 * Abre o documento para o signatário a partir do link individual.
 * O token nunca é gravado: guardamos apenas o seu hash.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/assinatura/documento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          admin,
          hashTexto,
          urlTemporaria,
          registrarAuditoria,
          ipDaRequisicao,
          dispositivoDaRequisicao,
        } = await import("@/lib/assinatura/servidor.server");

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
          .select("id,documento_id,nome,ordem,status,email,telefone")
          .eq("token_hash", await hashTexto(token))
          .maybeSingle();
        if (!signatario) return json({ erro: "Link inválido ou expirado." }, 404);

        const { data: documento } = await cliente
          .from("assinatura_documentos")
          .select("id,titulo,status,protocolo,campos,exige_codigo,expira_em,preenchido_path")
          .eq("id", signatario.documento_id)
          .maybeSingle();
        if (!documento) return json({ erro: "Documento não encontrado." }, 404);

        const expirado = documento.expira_em !== null && new Date(documento.expira_em) < new Date();
        if (expirado && documento.status !== "concluido") {
          await cliente
            .from("assinatura_documentos")
            .update({ status: "expirado" })
            .eq("id", documento.id);
          return json({ erro: "O prazo para assinatura deste documento expirou." }, 410);
        }
        if (documento.status === "cancelado" || signatario.status === "cancelado") {
          return json({ erro: "Este documento foi cancelado." }, 410);
        }

        const ip = ipDaRequisicao(request);
        const dispositivo = dispositivoDaRequisicao(request);

        if (signatario.status === "enviado") {
          await cliente
            .from("assinatura_signatarios")
            .update({
              status: "visualizado",
              visualizado_em: new Date().toISOString(),
              ip,
              dispositivo,
            })
            .eq("id", signatario.id);
          if (["enviado", "rascunho"].includes(documento.status)) {
            await cliente
              .from("assinatura_documentos")
              .update({ status: "visualizado" })
              .eq("id", documento.id);
          }
          await registrarAuditoria({
            documentoId: documento.id,
            signatarioId: signatario.id,
            evento: "documento_visualizado",
            ip,
            dispositivo,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campos = (documento.campos ?? []) as any[];
        const meusCampos = campos.filter(
          (c) => c.signatario === signatario.ordem || c.signatario == null,
        );

        return json({
          documento: {
            titulo: documento.titulo,
            protocolo: documento.protocolo,
            status: documento.status,
            exigeCodigo: documento.exige_codigo,
            pdfUrl: await urlTemporaria(documento.preenchido_path, 900),
          },
          signatario: {
            nome: signatario.nome,
            ordem: signatario.ordem,
            status: signatario.status === "enviado" ? "visualizado" : (signatario.status as string),
            temEmail: Boolean(signatario.email),
            temTelefone: Boolean(signatario.telefone),
          },
          campos: meusCampos,
        });
      },
    },
  },
});

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
