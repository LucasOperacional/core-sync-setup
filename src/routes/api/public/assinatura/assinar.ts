/**
 * Conclui a assinatura de um signatário.
 *
 * O PDF original é preservado: as informações e a assinatura são desenhadas
 * numa cópia. Ao final, o documento assinado recebe protocolo, hash SHA-256,
 * QR Code e certificado de conclusão.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

interface Corpo {
  token?: unknown;
  aceite?: unknown;
  codigo?: unknown;
  valores?: unknown;
  assinaturas?: unknown;
}

export const Route = createFileRoute("/api/public/assinatura/assinar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          admin,
          hashTexto,
          enviarArquivo,
          baixarArquivo,
          base64ParaBytes,
          registrarAuditoria,
          ipDaRequisicao,
          dispositivoDaRequisicao,
          statusPorSignatarios,
        } = await import("@/lib/assinatura/servidor.server");
        const { aplicarCamposNoPdf, anexarCertificado, hashSha256 } =
          await import("@/lib/assinatura/pdf-assinatura");

        let corpo: Corpo;
        try {
          corpo = (await request.json()) as Corpo;
        } catch {
          return json({ erro: "Requisição inválida." }, 400);
        }

        const token = typeof corpo.token === "string" ? corpo.token : "";
        if (token.length < 32) return json({ erro: "Link inválido." }, 400);
        if (corpo.aceite !== true) {
          return json({ erro: "É necessário aceitar o termo de consentimento." }, 400);
        }
        const valores = (corpo.valores ?? {}) as Record<string, string>;
        const assinaturas = (corpo.assinaturas ?? {}) as Record<string, string>;

        const cliente = await admin();
        const { data: signatario } = await cliente
          .from("assinatura_signatarios")
          .select("id,documento_id,nome,email,ordem,status,codigo_hash,codigo_expira_em")
          .eq("token_hash", await hashTexto(token))
          .maybeSingle();
        if (!signatario) return json({ erro: "Link inválido ou expirado." }, 404);
        if (signatario.status === "assinado") {
          return json({ erro: "Este documento já foi assinado por você." }, 409);
        }
        if (signatario.status === "cancelado") return json({ erro: "Documento cancelado." }, 410);

        const { data: documento } = await cliente
          .from("assinatura_documentos")
          .select(
            "id,titulo,status,protocolo,campos,exige_codigo,expira_em,preenchido_path,assinado_path",
          )
          .eq("id", signatario.documento_id)
          .maybeSingle();
        if (!documento?.preenchido_path) return json({ erro: "Documento indisponível." }, 404);
        if (documento.status === "cancelado") return json({ erro: "Documento cancelado." }, 410);
        if (documento.expira_em && new Date(documento.expira_em) < new Date()) {
          await cliente
            .from("assinatura_documentos")
            .update({ status: "expirado" })
            .eq("id", documento.id);
          return json({ erro: "O prazo para assinatura expirou." }, 410);
        }

        if (documento.exige_codigo) {
          const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim() : "";
          const validoAte = signatario.codigo_expira_em
            ? new Date(signatario.codigo_expira_em)
            : null;
          if (
            !codigo ||
            !signatario.codigo_hash ||
            !validoAte ||
            validoAte < new Date() ||
            (await hashTexto(codigo)) !== signatario.codigo_hash
          ) {
            return json({ erro: "Código de confirmação inválido ou expirado." }, 400);
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const todosCampos = (documento.campos ?? []) as any[];
        const meusCampos = todosCampos.filter((c) => c.signatario === signatario.ordem);
        for (const campo of meusCampos) {
          const ehAssinatura = campo.tipo === "assinatura" || campo.tipo === "rubrica";
          const preenchido = ehAssinatura
            ? typeof assinaturas[campo.id] === "string" && assinaturas[campo.id]!.length > 100
            : Boolean((valores[campo.id] ?? "").trim());
          if (campo.obrigatorio && !preenchido) {
            return json({ erro: `Preencha o campo obrigatório: ${campo.rotulo}` }, 400);
          }
        }

        const ip = ipDaRequisicao(request);
        const dispositivo = dispositivoDaRequisicao(request);

        // Guarda a imagem da assinatura separadamente (bucket privado).
        for (const [campoId, dataUrl] of Object.entries(assinaturas)) {
          if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) continue;
          await enviarArquivo(
            `${documento.id}/assinaturas/${signatario.id}-${campoId}.png`,
            base64ParaBytes(dataUrl),
            "image/png",
          );
        }

        // Base cumulativa: parcial (se alguém já assinou) ou preenchido.
        const { data: jaAssinados } = await cliente
          .from("assinatura_signatarios")
          .select("id,status")
          .eq("documento_id", documento.id);
        const algumAssinado = (jaAssinados ?? []).some((s) => s.status === "assinado");
        const caminhoParcial = `${documento.id}/parcial.pdf`;
        const base = await baixarArquivo(
          algumAssinado ? caminhoParcial : documento.preenchido_path,
        );

        const camposParaAplicar = meusCampos.map((c) => ({ ...c, valor: "" }));
        let atualizado = await aplicarCamposNoPdf(base, camposParaAplicar, valores, assinaturas);
        await enviarArquivo(caminhoParcial, atualizado);

        const agora = new Date().toISOString();
        await cliente
          .from("assinatura_signatarios")
          .update({ status: "assinado", assinado_em: agora, ip, dispositivo })
          .eq("id", signatario.id);
        await registrarAuditoria({
          documentoId: documento.id,
          signatarioId: signatario.id,
          evento: "assinatura_registrada",
          detalhe: signatario.nome,
          ip,
          dispositivo,
        });

        const { data: signatariosAtualizados } = await cliente
          .from("assinatura_signatarios")
          .select("id,nome,email,status,assinado_em,ip,dispositivo,ordem")
          .eq("documento_id", documento.id)
          .order("ordem");
        const lista = signatariosAtualizados ?? [];
        const novoStatus = statusPorSignatarios(lista);

        if (novoStatus === "concluido") {
          const origem = new URL(request.url).origin;
          const urlValidacao = `${origem}/validar?p=${documento.protocolo}`;
          atualizado = await anexarCertificado(atualizado, {
            titulo: documento.titulo,
            protocolo: documento.protocolo,
            hash: await hashSha256(atualizado),
            urlValidacao,
            concluidoEm: new Date(agora).toLocaleString("pt-BR"),
            signatarios: lista.map((s) => ({
              nome: s.nome,
              email: s.email,
              assinadoEm: s.assinado_em ? new Date(s.assinado_em).toLocaleString("pt-BR") : null,
              ip: s.ip,
              dispositivo: s.dispositivo,
            })),
          });
          const hashFinal = await hashSha256(atualizado);
          const caminhoFinal = `${documento.id}/assinado.pdf`;
          await enviarArquivo(caminhoFinal, atualizado);
          await cliente
            .from("assinatura_documentos")
            .update({
              status: "concluido",
              assinado_path: caminhoFinal,
              hash_sha256: hashFinal,
              concluido_em: agora,
            })
            .eq("id", documento.id);
          await registrarAuditoria({
            documentoId: documento.id,
            evento: "documento_concluido",
            detalhe: `Hash ${hashFinal.slice(0, 16)}...`,
            ip,
            dispositivo,
          });
          return json({ ok: true, status: "concluido", protocolo: documento.protocolo });
        }

        await cliente
          .from("assinatura_documentos")
          .update({ status: novoStatus })
          .eq("id", documento.id);
        return json({ ok: true, status: novoStatus, protocolo: documento.protocolo });
      },
    },
  },
});
