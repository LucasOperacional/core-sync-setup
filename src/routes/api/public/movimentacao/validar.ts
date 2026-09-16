/**
 * Validação pública do comprovante de movimentação de posto pelo protocolo (QR Code).
 * Devolve apenas dados de conferência — nunca assinatura, IDs internos ou motivos.
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

export const Route = createFileRoute("/api/public/movimentacao/validar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const protocolo = (new URL(request.url).searchParams.get("p") ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 40);
        if (!/^MOV-\d{8}-[0-9A-F]{6}$/.test(protocolo))
          return json({ erro: "Protocolo inválido." }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;
        if (!admin) return json({ erro: "Validação indisponível no momento." }, 503);

        const { data: mov } = await admin
          .from("movimentacoes_posto")
          .select(
            "protocolo, status, colaborador, cargo, posto_atual, novo_posto, data_movimentacao, created_at, aprovado_em, nexti_transfer_id, assinatura_colaborador",
          )
          .eq("protocolo", protocolo)
          .maybeSingle();
        if (!mov)
          return json({ erro: "Nenhuma movimentação encontrada para este protocolo." }, 404);

        return json({
          protocolo: mov.protocolo,
          status: mov.status,
          colaborador: nomeParcial(mov.colaborador),
          cargo: mov.cargo,
          postoAtual: mov.posto_atual,
          novoPosto: mov.novo_posto,
          dataMovimentacao: mov.data_movimentacao,
          solicitadoEm: mov.created_at,
          decididoEm: mov.aprovado_em,
          enviadoNexti: Boolean(mov.nexti_transfer_id),
          assinado: Boolean(mov.assinatura_colaborador),
          autentico: mov.status === "aprovada",
        });
      },
    },
  },
});
