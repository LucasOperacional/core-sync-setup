import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Recebimento de posições do NXS CONTROL.
 *
 * POST /api/public/nxs/posicao
 * Cabeçalho: x-device-token: <chave de envio do dispositivo>
 * Corpo: { latitude, longitude, velocidade?, direcao?, precisao?, bateria?, registradoEm?, origem? }
 *
 * Também aceita um lote: { posicoes: [ ... ] } — usado pela sincronização offline.
 */
const posicaoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  velocidade: z.number().nullable().optional(),
  direcao: z.number().nullable().optional(),
  precisao: z.number().nullable().optional(),
  bateria: z.number().int().min(0).max(100).nullable().optional(),
  registradoEm: z.string().optional(),
  origem: z.string().max(40).optional(),
});

const corpoSchema = z.union([
  posicaoSchema,
  z.object({ posicoes: z.array(posicaoSchema).min(1).max(200) }),
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/nxs/posicao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-device-token")?.trim() ?? "";
        if (token.length < 20)
          return json({ ok: false, erro: "Chave do dispositivo ausente." }, 401);

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return json({ ok: false, erro: "Corpo inválido." }, 400);
        }

        const parse = corpoSchema.safeParse(corpo);
        if (!parse.success) return json({ ok: false, erro: "Dados de posição inválidos." }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: dispositivo } = await supabaseAdmin
          .from("nxs_devices")
          .select("id, company_id, employee_id, vehicle_id, status")
          .eq("ingest_token", token)
          .maybeSingle();

        if (!dispositivo) return json({ ok: false, erro: "Dispositivo não reconhecido." }, 401);
        if (dispositivo.status === "bloqueado")
          return json({ ok: false, erro: "Dispositivo bloqueado." }, 403);

        const lista = "posicoes" in parse.data ? parse.data.posicoes : [parse.data];
        const recebidoEm = new Date().toISOString();

        const linhas = lista.map((p) => ({
          company_id: dispositivo.company_id,
          device_id: dispositivo.id,
          employee_id: dispositivo.employee_id,
          vehicle_id: dispositivo.vehicle_id,
          latitude: p.latitude,
          longitude: p.longitude,
          velocidade: p.velocidade ?? null,
          direcao: p.direcao ?? null,
          precisao: p.precisao ?? null,
          bateria: p.bateria ?? null,
          origem: p.origem ?? "app",
          registrado_em: p.registradoEm ?? recebidoEm,
          recebido_em: recebidoEm,
        }));

        const { error } = await supabaseAdmin.from("nxs_location_events").insert(linhas);
        if (error) return json({ ok: false, erro: "Não foi possível gravar a posição." }, 500);

        const ultima = linhas[linhas.length - 1]!;
        await supabaseAdmin
          .from("nxs_devices")
          .update({
            ultima_comunicacao: recebidoEm,
            bateria: ultima.bateria,
            precisao_gps: ultima.precisao,
            status: "online",
          })
          .eq("id", dispositivo.id);

        return json({ ok: true, gravadas: linhas.length, recebidoEm });
      },
    },
  },
});
