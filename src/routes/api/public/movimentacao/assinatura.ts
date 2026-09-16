/**
 * Assinatura digital do colaborador numa movimentação de posto, por link único.
 *
 * GET  ?t=<token> → devolve os dados da movimentação para conferência.
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
  "id, protocolo, status, colaborador, cargo, posto_atual, novo_posto, data_movimentacao, motivo, criado_por_nome, created_at, assinatura_colaborador, assinatura_em, assinatura_token_expira_em";

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
    .from("movimentacoes_posto")
    .select(CAMPOS)
    .eq("assinatura_token", token)
    .maybeSingle();
  if (!registro) return { erro: "Link de assinatura inválido ou já encerrado.", status: 404 };

  const expira = registro.assinatura_token_expira_em
    ? new Date(registro.assinatura_token_expira_em).getTime()
    : 0;
  if (expira && expira < Date.now())
    return { erro: "Este link de assinatura expirou. Peça um novo ao supervisor.", status: 410 };

  return { admin, registro };
}

function ipDaRequisicao(request: Request): string | null {
  const cabecalho =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  return cabecalho ? cabecalho.split(",")[0]!.trim().slice(0, 60) : null;
}

export const Route = createFileRoute("/api/public/movimentacao/assinatura")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (new URL(request.url).searchParams.get("t") ?? "").trim().toLowerCase();
        if (!tokenValido(token)) return json({ erro: "Link de assinatura inválido." }, 400);

        const resultado = await carregar(token);
        if ("erro" in resultado) return json({ erro: resultado.erro }, resultado.status);
        const { registro } = resultado;

        return json({
          protocolo: registro.protocolo,
          status: registro.status,
          colaborador: registro.colaborador,
          cargo: registro.cargo,
          postoAtual: registro.posto_atual,
          novoPosto: registro.novo_posto,
          dataMovimentacao: registro.data_movimentacao,
          motivo: registro.motivo,
          supervisor: registro.criado_por_nome,
          solicitadoEm: registro.created_at,
          assinado: Boolean(registro.assinatura_colaborador),
          assinadoEm: registro.assinatura_em,
        });
      },

      POST: async ({ request }) => {
        let corpo: {
          token?: unknown;
          nome?: unknown;
          assinatura?: unknown;
          declaracao?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          precisaoMetros?: unknown;
          geoStatus?: unknown;
        };
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
        if (corpo.declaracao !== true) {
          return json({ erro: "Marque a declaração de concordância antes de assinar." }, 400);
        }

        const numero = (valor: unknown): number | null =>
          typeof valor === "number" && Number.isFinite(valor) ? valor : null;
        const latitude = numero(corpo.latitude);
        const longitude = numero(corpo.longitude);
        const geoStatus =
          typeof corpo.geoStatus === "string"
            ? corpo.geoStatus.slice(0, 80)
            : latitude !== null
              ? "capturada"
              : "indisponivel";

        const resultado = await carregar(token);
        if ("erro" in resultado) return json({ erro: resultado.erro }, resultado.status);
        const { admin, registro } = resultado;

        if (registro.assinatura_colaborador)
          return json({ erro: "Esta movimentação já foi assinada." }, 409);
        if (registro.status !== "pendente")
          return json({ erro: "Esta movimentação já foi analisada pela coordenação." }, 409);

        const { error } = await admin
          .from("movimentacoes_posto")
          .update({
            assinatura_colaborador: assinatura,
            assinatura_nome: nome,
            assinatura_em: new Date().toISOString(),
            assinatura_ip: ipDaRequisicao(request),
            assinatura_dispositivo: request.headers.get("user-agent")?.slice(0, 240) ?? null,
            assinatura_latitude: latitude,
            assinatura_longitude: longitude,
            assinatura_precisao_metros: numero(corpo.precisaoMetros),
            assinatura_geo_status: geoStatus,
            assinatura_declaracao: true,
            assinatura_token: null,
            assinatura_token_expira_em: null,
          })
          .eq("id", registro.id);
        if (error)
          return json({ erro: "Não foi possível registrar a assinatura. Tente novamente." }, 500);

        return json({
          ok: true,
          protocolo: registro.protocolo,
          comprovante: {
            nome,
            assinadoEm: new Date().toISOString(),
            ip: ipDaRequisicao(request),
            latitude,
            longitude,
            geoStatus,
          },
        });
      },
    },
  },
});
