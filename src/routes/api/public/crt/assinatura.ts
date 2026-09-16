/**
 * Assinatura digital do colaborador num CRT, por link único.
 *
 * GET  ?t=<token> → devolve os dados do CRT para conferência.
 * POST { token, nome, assinatura } → registra a assinatura.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const CAMPOS =
  "id, colaborador, posto_nome, motivo, inicio, fim, supervisor, substituto, recebeu_vt, recebeu_refeicao, valor_receber, recebido_em, status, enviado_por_nome, created_at, assinatura_colaborador, assinatura_em, assinatura_token_expira_em";

function tokenValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[0-9a-f]{32,64}$/.test(valor);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carregar(
  token: string,
): Promise<{ admin: any; registro: any } | { erro: string; status: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = supabaseAdmin;
  if (!admin) return { erro: "Assinatura indisponível no momento.", status: 503 };

  const { data: registro } = await admin
    .from("crt_lancamentos")
    .select(CAMPOS)
    .eq("assinatura_token", token)
    .maybeSingle();
  if (!registro) return { erro: "Link de assinatura inválido ou já encerrado.", status: 404 };

  const expira = registro.assinatura_token_expira_em
    ? new Date(registro.assinatura_token_expira_em).getTime()
    : 0;
  if (expira && expira < Date.now()) {
    return { erro: "Este link de assinatura expirou. Peça um novo ao supervisor.", status: 410 };
  }

  return { admin, registro };
}

function ipDaRequisicao(request: Request): string | null {
  const cabecalho =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  return cabecalho ? cabecalho.split(",")[0]!.trim().slice(0, 60) : null;
}

export const Route = createFileRoute("/api/public/crt/assinatura")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (new URL(request.url).searchParams.get("t") ?? "").trim().toLowerCase();
        if (!tokenValido(token)) return json({ erro: "Link de assinatura inválido." }, 400);

        const resultado = await carregar(token);
        if ("erro" in resultado) return json({ erro: resultado.erro }, resultado.status);
        const { registro } = resultado;

        return json({
          colaborador: registro.colaborador,
          postoNome: registro.posto_nome,
          motivo: registro.motivo,
          inicio: registro.inicio,
          fim: registro.fim,
          supervisor: registro.supervisor || registro.enviado_por_nome,
          substituto: registro.substituto,
          recebeuVt: registro.recebeu_vt,
          recebeuRefeicao: registro.recebeu_refeicao,
          valorReceber: registro.valor_receber,
          recebidoEm: registro.recebido_em,
          solicitadoEm: registro.created_at,
          assinado: Boolean(registro.assinatura_colaborador),
          assinadoEm: registro.assinatura_em,
        });
      },

      POST: async ({ request }) => {
        let corpo: { token?: unknown; nome?: unknown; assinatura?: unknown };
        try {
          corpo = (await request.json()) as typeof corpo;
        } catch {
          return json({ erro: "Requisição inválida." }, 400);
        }

        const token = typeof corpo.token === "string" ? corpo.token.trim().toLowerCase() : "";
        const nome = typeof corpo.nome === "string" ? corpo.nome.trim().slice(0, 160) : "";
        const assinatura = typeof corpo.assinatura === "string" ? corpo.assinatura : "";

        if (!tokenValido(token)) return json({ erro: "Link de assinatura inválido." }, 400);
        if (nome.length < 3) return json({ erro: "Digite seu nome completo para confirmar." }, 400);
        if (!assinatura.startsWith("data:image/png;base64,") || assinatura.length > 1_500_000) {
          return json({ erro: "Desenhe sua assinatura no quadro antes de confirmar." }, 400);
        }

        const resultado = await carregar(token);
        if ("erro" in resultado) return json({ erro: resultado.erro }, resultado.status);
        const { admin, registro } = resultado;

        if (registro.assinatura_colaborador)
          return json({ erro: "Este CRT já foi assinado." }, 409);

        const { error } = await admin
          .from("crt_lancamentos")
          .update({
            assinatura_colaborador: assinatura,
            assinatura_nome: nome,
            assinatura_em: new Date().toISOString(),
            assinatura_ip: ipDaRequisicao(request),
            assinatura_token: null,
            assinatura_token_expira_em: null,
          })
          .eq("id", registro.id);
        if (error)
          return json({ erro: "Não foi possível registrar a assinatura. Tente novamente." }, 500);

        return json({ ok: true });
      },
    },
  },
});
