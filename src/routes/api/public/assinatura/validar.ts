/**
 * Validação pública de autenticidade pelo protocolo (ou QR Code).
 * Devolve apenas dados de conferência — nunca o documento, CPF ou tokens.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function nomeParcial(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]!;
  return `${partes[0]} ${partes
    .slice(1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(" ")}`;
}

export const Route = createFileRoute("/api/public/assinatura/validar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { admin } = await import("@/lib/assinatura/servidor.server");
        const protocolo = (new URL(request.url).searchParams.get("p") ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 40);
        if (!/^ASS-\d{8}-[0-9A-F]{6}$/.test(protocolo)) {
          return json({ erro: "Protocolo inválido." }, 400);
        }

        const cliente = await admin();
        const { data: documento } = await cliente
          .from("assinatura_documentos")
          .select("id,titulo,status,protocolo,hash_sha256,concluido_em,created_at")
          .eq("protocolo", protocolo)
          .maybeSingle();
        if (!documento) return json({ erro: "Nenhum documento encontrado." }, 404);

        const { data: signatarios } = await cliente
          .from("assinatura_signatarios")
          .select("nome,status,assinado_em,ordem")
          .eq("documento_id", documento.id)
          .order("ordem");

        return json({
          protocolo: documento.protocolo,
          titulo: documento.titulo,
          status: documento.status,
          hash: documento.hash_sha256,
          emitidoEm: documento.created_at,
          concluidoEm: documento.concluido_em,
          autentico: documento.status === "concluido",
          signatarios: (signatarios ?? []).map((s) => ({
            nome: nomeParcial(s.nome),
            status: s.status,
            assinadoEm: s.assinado_em,
          })),
          observacao:
            "Assinatura eletrônica com trilha de auditoria (MP 2.200-2/2001, art. 10, §2º). Não constitui certificado digital ICP-Brasil.",
        });
      },
    },
  },
});
