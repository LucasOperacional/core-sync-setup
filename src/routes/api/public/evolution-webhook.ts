import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebedor de eventos do Evolution Go (POST /instance/connect -> webhookUrl).
 * Documentação: docs/evolution-go/webhooks.md
 * Autenticação: o corpo traz `instanceToken` (token da instância) e o header
 * `apikey` pode trazer a chave global — qualquer um dos dois precisa bater
 * com o que está salvo em app_config.
 */

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function seguroIgual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Extrai o texto de qualquer formato de mensagem do WhatsApp. */
function extrairTexto(msg: Record<string, unknown>): string {
  const direto = msg["conversation"];
  if (typeof direto === "string" && direto) return direto;
  const candidatos = [
    rec(msg["extendedTextMessage"])["text"],
    rec(msg["imageMessage"])["caption"],
    rec(msg["videoMessage"])["caption"],
    rec(msg["documentMessage"])["caption"],
    rec(msg["documentMessage"])["fileName"],
    rec(msg["buttonsResponseMessage"])["selectedDisplayText"],
    rec(msg["listResponseMessage"])["title"],
    rec(msg["reactionMessage"])["text"],
  ];
  for (const c of candidatos) if (typeof c === "string" && c) return c;
  return "";
}

function tipoMidia(info: Record<string, unknown>, msg: Record<string, unknown>): string | null {
  const t = info["MediaType"];
  if (typeof t === "string" && t) return t;
  if (msg["imageMessage"]) return "image";
  if (msg["videoMessage"]) return "video";
  if (msg["audioMessage"]) return "audio";
  if (msg["documentMessage"]) return "document";
  if (msg["stickerMessage"]) return "sticker";
  return null;
}

/** Id do botão clicado pelo contato, em qualquer formato de resposta. */
function idBotaoSelecionado(msg: Record<string, unknown>): string | null {
  const candidatos = [
    rec(msg["buttonsResponseMessage"])["selectedButtonID"],
    rec(msg["buttonsResponseMessage"])["selectedButtonId"],
    rec(msg["templateButtonReplyMessage"])["selectedID"],
    rec(msg["templateButtonReplyMessage"])["selectedId"],
    rec(msg["listResponseMessage"])["singleSelectReply"] &&
      rec(rec(msg["listResponseMessage"])["singleSelectReply"])["selectedRowID"],
  ];
  for (const c of candidatos) if (typeof c === "string" && c.trim()) return c.trim();
  const interativa = rec(msg["interactiveResponseMessage"]);
  const params = rec(interativa["nativeFlowResponseMessage"])["paramsJson"];
  if (typeof params === "string" && params) {
    try {
      const p = rec(JSON.parse(params));
      const id = p["id"] ?? p["selectedId"];
      if (typeof id === "string" && id.trim()) return id.trim();
    } catch {
      /* ignora payload inválido */
    }
  }
  return null;
}

/**
 * Baixa o áudio recebido pelo WhatsApp e guarda no armazenamento interno.
 * Devolve o caminho do arquivo (ou null quando não foi possível baixar).
 */
async function baixarAudio(
  msg: Record<string, unknown>,
  conversaId: string,
  mensagemId: string,
): Promise<string | null> {
  const { lerConfigResolvida, evolutionFetch } = await import("@/lib/evolution-go.functions");
  const cfg = await lerConfigResolvida();
  if (!cfg.baseUrl) return null;
  const resp = await evolutionFetch(cfg, "/message/downloadmedia", {
    method: "POST",
    body: JSON.stringify({ message: msg }),
  });
  if (resp.status >= 400) return null;
  const raw = rec(resp.corpo);
  const d = rec(raw["data"] ?? raw);
  const bruto =
    d["base64"] ?? d["Base64"] ?? d["data"] ?? d["Data"] ?? d["file"] ?? d["media"] ?? raw["base64"];
  if (typeof bruto !== "string" || !bruto) return null;
  const base64 = bruto.replace(/^data:[^,]+,/, "");
  const mime =
    (typeof d["mimetype"] === "string" && d["mimetype"]) ||
    (typeof rec(msg["audioMessage"])["mimetype"] === "string"
      ? (rec(msg["audioMessage"])["mimetype"] as string)
      : "audio/ogg");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { BUCKET_AUDIOS } = await import("@/lib/whatsapp.functions");
  const caminho = `${conversaId}/${mensagemId}.ogg`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_AUDIOS)
    .upload(caminho, Buffer.from(base64, "base64"), {
      contentType: mime.split(";")[0] ?? "audio/ogg",
      upsert: true,
    });
  return error ? null : caminho;
}

/** Resposta automática de texto para o contato. */
async function responder(chatJid: string, texto: string): Promise<void> {
  try {
    const { lerConfigResolvida, evolutionFetch } = await import("@/lib/evolution-go.functions");
    const cfg = await lerConfigResolvida();
    if (!cfg.baseUrl) return;
    const especial = chatJid.endsWith("@g.us") || chatJid.endsWith("@lid");
    await evolutionFetch(cfg, "/send/text", {
      method: "POST",
      body: JSON.stringify({
        number: especial ? chatJid : chatJid.replace(/@.*$/, "").replace(/\D/g, ""),
        ...(especial ? { formatJid: false } : {}),
        text: texto,
      }),
    });
  } catch {
    /* falha no aviso não impede o registro da mensagem */
  }
}

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      GET: async () => {
        const { lerConfig } = await import("@/lib/evolution-go.functions");
        const cfg = await lerConfig();
        return Response.json({ ok: true, configurado: Boolean(cfg.baseUrl && cfg.apiKey) });
      },
      POST: async ({ request }) => {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response("Corpo inválido", { status: 400 });
        }
        const corpo = rec(json);

        const { lerConfig } = await import("@/lib/evolution-go.functions");
        const cfg = await lerConfig();
        const enviadoToken = String(corpo["instanceToken"] ?? corpo["token"] ?? "").trim();
        const enviadoId = String(corpo["instanceId"] ?? corpo["instance_id"] ?? "").trim();
        const enviadoKey = (request.headers.get("apikey") ?? "").trim();
        const autorizado =
          (cfg.token && seguroIgual(enviadoToken, cfg.token)) ||
          (cfg.instanceId && seguroIgual(enviadoId, cfg.instanceId)) ||
          (cfg.apiKey && seguroIgual(enviadoKey, cfg.apiKey));
        if (!autorizado) return new Response("Não autorizado", { status: 401 });

        const evento = String(corpo["event"] ?? "");

        // O Evolution Go só entrega o QR Code por aqui (o GET /instance/qr
        // responde "no QR code available"). Guardamos a imagem para o painel.
        if (/qr/i.test(evento)) {
          const d = rec(corpo["data"]);
          const img = d["qrcode"] ?? d["Qrcode"] ?? d["QRCode"] ?? corpo["qrcode"];
          if (typeof img === "string" && img) {
            const { guardarQrCode } = await import("@/lib/evolution-go.functions");
            await guardarQrCode(img);
          }
          return Response.json({ ok: true, evento });
        }
        if (/connected|loggedin/i.test(evento)) {
          const { guardarQrCode } = await import("@/lib/evolution-go.functions");
          await guardarQrCode("");
          return Response.json({ ok: true, evento });
        }

        if (evento !== "Message" && evento !== "SendMessage") {
          // Demais eventos (conexão, QR Code, presença) não geram histórico.
          return Response.json({ ok: true, ignorado: evento });
        }

        const data = rec(corpo["data"]);
        const info = rec(data["Info"]);
        const msg = rec(data["Message"]);
        const chatJid = String(info["Chat"] ?? "").trim();
        if (!chatJid) return Response.json({ ok: true, ignorado: "sem chat" });

        const fromMe = info["IsFromMe"] === true || evento === "SendMessage";
        const telefone = chatJid.replace(/@.*$/, "").replace(/:.*$/, "");
        const nome =
          (typeof info["PushName"] === "string" && info["PushName"]) || telefone;
        const texto = extrairTexto(msg);
        const midia = tipoMidia(info, msg);
        const quando = (() => {
          const t = info["Timestamp"];
          const d = typeof t === "string" || typeof t === "number" ? new Date(t) : new Date();
          return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        })();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conv, error: convErro } = await supabaseAdmin
          .from("whatsapp_conversations" as never)
          .upsert(
            {
              wa_chat_id: chatJid,
              telefone,
              contato_nome: fromMe ? telefone : nome,
              is_group: info["IsGroup"] === true || chatJid.endsWith("@g.us"),
              last_message_at: quando,
              last_message_preview: (texto || (midia ? `[${midia}]` : "")).slice(0, 120),
            } as never,
            { onConflict: "wa_chat_id" },
          )
          .select("id, nao_lidas")
          .single();
        if (convErro || !conv) return new Response("Falha ao registrar conversa", { status: 500 });
        const conversa = conv as unknown as { id: string; nao_lidas: number | null };

        const { data: msgLinha, error: msgErro } = await supabaseAdmin
          .from("whatsapp_messages" as never)
          .insert({
            conversation_id: conversa.id,
            wa_message_id: typeof info["ID"] === "string" ? info["ID"] : null,
            direcao: fromMe ? "enviada" : "recebida",
            autor_nome: fromMe ? null : nome,
            content: texto,
            media_type: midia,
            created_at: quando,
          } as never)
          .select("id")
          .maybeSingle();
        if (msgErro && !String(msgErro.message).toLowerCase().includes("duplicate")) {
          return new Response("Falha ao registrar mensagem", { status: 500 });
        }

        // Áudio recebido: baixa do WhatsApp e guarda para ouvir no chat interno.
        const idMensagem = (msgLinha as unknown as { id: string } | null)?.id ?? null;
        if (midia === "audio" && idMensagem) {
          try {
            const caminho = await baixarAudio(msg, conversa.id, idMensagem);
            if (caminho) {
              await supabaseAdmin
                .from("whatsapp_messages" as never)
                .update({ media_url: caminho } as never)
                .eq("id", idMensagem);
            }
          } catch {
            /* áudio indisponível não impede o registro da mensagem */
          }
        }

        if (!fromMe) {
          await supabaseAdmin
            .from("whatsapp_conversations" as never)
            .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 } as never)
            .eq("id", conversa.id);

          // Menu de botões -> fila de atendimento.
          const selecionado = idBotaoSelecionado(msg);
          const { lerMenu, enviarMenu, filaDoBotao } = await import(
            "@/lib/whatsapp-menu.functions"
          );
          const queueId = selecionado ? filaDoBotao(selecionado) : null;

          if (queueId) {
            const { data: fila } = await supabaseAdmin
              .from("chat_queues" as never)
              .select("id, name, active")
              .eq("id", queueId)
              .maybeSingle();
            const f = fila as unknown as { id: string; name: string; active: boolean } | null;
            if (f?.active) {
              await supabaseAdmin
                .from("whatsapp_conversations" as never)
                .update({ queue_id: f.id, queue_at: new Date().toISOString() } as never)
                .eq("id", conversa.id);
              await responder(chatJid, `Encaminhado para *${f.name}*. Em instantes um atendente responde por aqui.`);
              return Response.json({ ok: true, fila: f.id });
            }
          } else if (!chatJid.endsWith("@g.us")) {
            const menu = await lerMenu();
            if (menu.ativo && menu.botoes.length > 0) {
              const { data: conversaAtual } = await supabaseAdmin
                .from("whatsapp_conversations" as never)
                .select("queue_id")
                .eq("id", conversa.id)
                .maybeSingle();
              const semFila = !(conversaAtual as unknown as { queue_id: string | null } | null)
                ?.queue_id;
              if (semFila) {
                const { count } = await supabaseAdmin
                  .from("whatsapp_messages" as never)
                  .select("id", { count: "exact", head: true })
                  .eq("conversation_id", conversa.id)
                  .eq("direcao", "recebida");
                if ((count ?? 0) <= 1) await enviarMenu(chatJid, menu);
              }
            }
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
