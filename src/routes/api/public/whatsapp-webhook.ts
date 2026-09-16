import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  chatId: z.string().min(3).max(120),
  telefone: z.string().max(40).optional(),
  nome: z.string().max(160).optional(),
  isGroup: z.boolean().optional(),
  messageId: z.string().max(160).optional(),
  fromMe: z.boolean().optional(),
  body: z.string().max(8000).optional(),
  mediaUrl: z.string().url().max(2000).optional(),
  mediaType: z.string().max(80).optional(),
  timestamp: z.number().optional(),
});

function seguroIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async () => {
        const configurado = Boolean(process.env["WWEBJS_WEBHOOK_SECRET"]);
        return Response.json({ ok: true, configurado });
      },
      POST: async ({ request }) => {
        const segredo = process.env["WWEBJS_WEBHOOK_SECRET"] ?? "";
        const enviado =
          request.headers.get("x-webhook-token") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!segredo || !enviado || !seguroIgual(enviado, segredo)) {
          return Response.json(
            { ok: false, erro: segredo ? "nao_autorizado" : "webhook_nao_configurado" },
            { status: 401 },
          );
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response("Corpo inválido", { status: 400 });
        }
        const parsed = payloadSchema.safeParse(json);
        if (!parsed.success) return new Response("Dados inválidos", { status: 400 });
        const p = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const agora =
          p.timestamp && Number.isFinite(p.timestamp)
            ? new Date(p.timestamp * 1000).toISOString()
            : new Date().toISOString();
        const telefone = p.telefone ?? p.chatId.replace(/@.*$/, "");

        const { data: conv, error: convErro } = await supabaseAdmin
          .from("whatsapp_conversations" as never)
          .upsert(
            {
              wa_chat_id: p.chatId,
              telefone,
              contato_nome: p.nome ?? telefone,
              is_group: p.isGroup ?? p.chatId.endsWith("@g.us"),
              last_message_at: agora,
              last_message_preview: (p.body ?? (p.mediaUrl ? "[anexo]" : "")).slice(0, 120),
            } as never,
            { onConflict: "wa_chat_id" },
          )
          .select("id, nao_lidas")
          .single();
        if (convErro || !conv) return new Response("Falha ao registrar conversa", { status: 500 });

        const conversa = conv as unknown as { id: string; nao_lidas: number };

        const { error: msgErro } = await supabaseAdmin.from("whatsapp_messages" as never).insert({
          conversation_id: conversa.id,
          wa_message_id: p.messageId ?? null,
          direcao: p.fromMe ? "enviada" : "recebida",
          autor_nome: p.fromMe ? null : (p.nome ?? telefone),
          content: p.body ?? "",
          media_url: p.mediaUrl ?? null,
          media_type: p.mediaType ?? null,
          created_at: agora,
        } as never);
        if (msgErro && !String(msgErro.message).includes("duplicate")) {
          return new Response("Falha ao registrar mensagem", { status: 500 });
        }

        if (!p.fromMe) {
          await supabaseAdmin
            .from("whatsapp_conversations" as never)
            .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 } as never)
            .eq("id", conversa.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
