import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WhatsAppStatus = {
  ok: boolean;
  conectado: boolean;
  estado?: string;
  qrCode?: string | null;
  numero?: string | null;
  erro?: string;
};

export type WhatsAppSyncResultado = {
  ok: boolean;
  conversas: number;
  erro?: string;
};

function bridgeConfig(): { baseUrl: string; token: string } {
  const baseUrl = (process.env["WWEBJS_BASE_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["WWEBJS_TOKEN"] ?? "";
  if (!baseUrl) throw new Error("Servidor do WhatsApp não configurado.");
  return { baseUrl, token };
}

async function bridgeFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { baseUrl, token } = bridgeConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  if (!res.ok) {
    const msg =
      typeof corpo === "object" && corpo && "error" in corpo
        ? String((corpo as { error: unknown }).error)
        : `Erro ${res.status} no servidor do WhatsApp`;
    throw new Error(msg);
  }
  return corpo;
}

/** Servidor Evolution Go configurado no Painel Administrativo (quando houver). */
async function evolutionConfigurado() {
  try {
    const { lerConfigResolvida } = await import("@/lib/evolution-go.functions");
    const cfg = await lerConfigResolvida();
    return cfg.baseUrl ? cfg : null;
  } catch {
    return null;
  }
}

/** Estado da conexão do WhatsApp (Evolution Go quando configurado; inclui QR Code). */
export const whatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<WhatsAppStatus> => {
    const evo = await evolutionConfigurado();
    if (evo) {
      try {
        const { evolutionFetch } = await import("@/lib/evolution-go.functions");
        const { status, corpo } = await evolutionFetch(evo, "/instance/status");
        if (status >= 400)
          return { ok: false, conectado: false, erro: "Evolution Go indisponível." };
        const raw = (corpo ?? {}) as Record<string, unknown>;
        const d = ((raw["data"] ?? raw) as Record<string, unknown>) ?? {};
        const logado = d["LoggedIn"] === true || d["loggedIn"] === true;
        let qrCode: string | null = null;
        if (!logado) {
          const qr = await evolutionFetch(evo, "/instance/qr");
          const qraw = (qr.corpo ?? {}) as Record<string, unknown>;
          const q = ((qraw["data"] ?? qraw) as Record<string, unknown>) ?? {};
          const img = q["Qrcode"] ?? q["qrcode"];
          if (typeof img === "string" && img) qrCode = img;
        }
        return {
          ok: true,
          conectado: d["Connected"] === true || logado,
          estado: logado ? "CONNECTED" : "PENDING",
          qrCode,
          numero: typeof d["Name"] === "string" ? (d["Name"] as string) : null,
        };
      } catch (e) {
        return { ok: false, conectado: false, erro: e instanceof Error ? e.message : String(e) };
      }
    }
    try {
      const r = (await bridgeFetch("/status")) as Record<string, unknown>;
      const estado = typeof r?.["state"] === "string" ? (r["state"] as string) : undefined;
      return {
        ok: true,
        conectado: r?.["connected"] === true || estado === "CONNECTED",
        ...(estado ? { estado } : {}),
        qrCode: typeof r?.["qr"] === "string" ? (r["qr"] as string) : null,
        numero: typeof r?.["number"] === "string" ? (r["number"] as string) : null,
      };
    } catch (e) {
      return { ok: false, conectado: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

export type AssinaturaWhatsApp = { ativa: boolean; texto: string };

const CHAVE_ASSINATURA_ATIVA = "whatsapp_assinatura_ativa";
const CHAVE_ASSINATURA_TEXTO = "whatsapp_assinatura_texto";

async function lerAssinatura(): Promise<AssinaturaWhatsApp & { definida: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config" as never)
    .select("chave, valor")
    .in("chave", [CHAVE_ASSINATURA_ATIVA, CHAVE_ASSINATURA_TEXTO]);
  const mapa = new Map<string, string>();
  for (const l of (data ?? []) as Array<{ chave: string; valor: string | null }>) {
    mapa.set(l.chave, l.valor ?? "");
  }
  return {
    definida: mapa.has(CHAVE_ASSINATURA_ATIVA),
    ativa: mapa.get(CHAVE_ASSINATURA_ATIVA) === "true",
    texto: (mapa.get(CHAVE_ASSINATURA_TEXTO) ?? "").trim(),
  };
}

/** Nome de exibição do usuário logado (usado como assinatura padrão). */
async function nomeDoUsuario(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_profiles" as never)
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return String((data as { display_name?: string } | null)?.display_name ?? "").trim();
}

async function gravarAssinaturaConfig(ativa: boolean, texto: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = new Date().toISOString();
  await supabaseAdmin.from("app_config" as never).upsert(
    [
      { chave: CHAVE_ASSINATURA_ATIVA, valor: ativa ? "true" : "false", updated_at: agora },
      { chave: CHAVE_ASSINATURA_TEXTO, valor: texto, updated_at: agora },
    ] as never,
    { onConflict: "chave" } as never,
  );
}

/**
 * Acrescenta a assinatura no começo da mensagem quando a opção está ligada.
 * Sem texto fixo configurado, assina com o nome de quem está atendendo.
 */
async function aplicarAssinatura(texto: string, userId: string): Promise<string> {
  const assinatura = await lerAssinatura();
  if (!assinatura.ativa) return texto;
  const nome = assinatura.texto || (await nomeDoUsuario(userId));
  if (!nome) return texto;
  if (texto.startsWith(`*${nome}*`)) return texto;
  return `*${nome}*\n${texto}`;
}

/**
 * Configuração atual da assinatura. Na primeira vez, liga automaticamente
 * usando o nome de exibição do usuário quando ele existir.
 */
export const whatsappObterAssinatura = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssinaturaWhatsApp> => {
    const { userId } = context as { userId: string };
    const atual = await lerAssinatura();
    if (!atual.definida) {
      const nome = await nomeDoUsuario(userId);
      if (nome) {
        await gravarAssinaturaConfig(true, nome);
        return { ativa: true, texto: nome };
      }
    }
    if (atual.ativa && !atual.texto) {
      const nome = await nomeDoUsuario(userId);
      if (nome) return { ativa: true, texto: nome };
    }
    return { ativa: atual.ativa, texto: atual.texto };
  });

/** Liga/desliga a assinatura e define o texto usado. */
export const whatsappSalvarAssinatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ativa: boolean; texto?: string }) => ({
    ativa: Boolean(input?.ativa),
    texto: String(input?.texto ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; erro?: string }> => {
    try {
      await gravarAssinaturaConfig(data.ativa, data.texto);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Busca no WhatsApp a foto de perfil dos contatos e guarda no banco.
 * Só reconsulta fotos com mais de 12 horas.
 */
export const whatsappAtualizarFotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: boolean; atualizadas: number; erro?: string }> => {
    try {
      const evo = await evolutionConfigurado();
      if (!evo) return { ok: false, atualizadas: 0, erro: "WhatsApp não configurado." };
      const { evolutionFetch } = await import("@/lib/evolution-go.functions");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const limite = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data } = await supabaseAdmin
        .from("whatsapp_conversations" as never)
        .select("id, wa_chat_id, foto_atualizada_em")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(60);
      const linhas = (data ?? []) as Array<{
        id: string;
        wa_chat_id: string;
        foto_atualizada_em: string | null;
      }>;
      let atualizadas = 0;
      for (const linha of linhas) {
        if (linha.foto_atualizada_em && linha.foto_atualizada_em > limite) continue;
        if (/@g\.us$/i.test(linha.wa_chat_id)) continue;
        let url: string | null = null;
        try {
          const resp = await evolutionFetch(evo, "/user/avatar", {
            method: "POST",
            body: JSON.stringify({ number: linha.wa_chat_id, preview: true }),
          });
          const raw = (resp.corpo ?? {}) as Record<string, unknown>;
          const d = ((raw["data"] ?? raw) as Record<string, unknown>) ?? {};
          const u = d["url"] ?? d["URL"] ?? d["profilePictureUrl"];
          if (typeof u === "string" && u.startsWith("http")) url = u;
        } catch {
          /* contato sem foto ou indisponível */
        }
        await supabaseAdmin
          .from("whatsapp_conversations" as never)
          .update({
            foto_url: url,
            foto_atualizada_em: new Date().toISOString(),
          } as never)
          .eq("id", linha.id);
        if (url) atualizadas += 1;
      }
      return { ok: true, atualizadas };
    } catch (e) {
      return { ok: false, atualizadas: 0, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/** Envia uma mensagem pelo WhatsApp e registra no histórico da conversa. */
export const whatsappEnviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; chatId: string; texto: string }) => {
    if (!input?.conversationId || !input?.chatId) throw new Error("Conversa inválida.");
    const texto = String(input.texto ?? "").trim();
    if (!texto) throw new Error("Mensagem vazia.");
    if (texto.length > 4000) throw new Error("Mensagem muito longa.");
    return { conversationId: input.conversationId, chatId: input.chatId, texto };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { userId } = context as { userId: string };
    try {
      const texto = await aplicarAssinatura(data.texto, userId);
      const evo = await evolutionConfigurado();
      let r: Record<string, unknown>;
      if (evo) {
        const { evolutionFetch } = await import("@/lib/evolution-go.functions");
        // Só chats comuns (@s.whatsapp.net) viram número puro. Grupos (@g.us)
        // e contatos anônimos (@lid) precisam do identificador completo.
        const destino = /@s\.whatsapp\.net$/i.test(data.chatId)
          ? data.chatId.replace(/\D/g, "")
          : data.chatId;
        const resp = await evolutionFetch(evo, "/send/text", {
          method: "POST",
          body: JSON.stringify({ number: destino, text: texto }),
        });
        if (resp.status >= 400) {
          const c = (resp.corpo ?? {}) as Record<string, unknown>;
          const erro = (c["error"] ?? {}) as Record<string, unknown>;
          const msg = erro["message"] ?? c["message"] ?? c["error"];
          throw new Error(
            typeof msg === "string" && msg.trim()
              ? msg
              : `Falha ao enviar (erro ${resp.status}).`,
          );
        }
        const raw = (resp.corpo ?? {}) as Record<string, unknown>;
        const d = ((raw["data"] ?? raw) as Record<string, unknown>) ?? {};
        const info = (d["Info"] ?? {}) as Record<string, unknown>;
        r = { id: info["ID"] ?? d["messageId"] ?? d["id"] };
      } else {
        r = (await bridgeFetch("/send", {
          method: "POST",
          body: JSON.stringify({ chatId: data.chatId, message: texto }),
        })) as Record<string, unknown>;
      }


      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("whatsapp_messages" as never).insert({
        conversation_id: data.conversationId,
        wa_message_id: typeof r?.["id"] === "string" ? r["id"] : null,
        direcao: "enviada",
        user_id: userId,
        content: texto,
      } as never);
      await supabaseAdmin
        .from("whatsapp_conversations" as never)
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: texto.slice(0, 120),
        } as never)
        .eq("id", data.conversationId);

      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

export const BUCKET_AUDIOS = "whatsapp-audios";

/** Envia um áudio gravado no navegador pelo WhatsApp e guarda a cópia. */
export const whatsappEnviarAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { conversationId: string; chatId: string; base64: string; mime?: string }) => {
      if (!input?.conversationId || !input?.chatId) throw new Error("Conversa inválida.");
      const base64 = String(input.base64 ?? "").replace(/^data:[^,]+,/, "").trim();
      if (!base64) throw new Error("Áudio vazio.");
      if (base64.length > 14_000_000) throw new Error("Áudio muito longo (máximo ~10 MB).");
      return {
        conversationId: input.conversationId,
        chatId: input.chatId,
        base64,
        mime: String(input.mime ?? "audio/ogg"),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { userId } = context as { userId: string };
    try {
      const evo = await evolutionConfigurado();
      if (!evo) return { ok: false, erro: "WhatsApp não configurado." };
      const { evolutionFetch } = await import("@/lib/evolution-go.functions");
      const destino = /@s\.whatsapp\.net$/i.test(data.chatId)
        ? data.chatId.replace(/\D/g, "")
        : data.chatId;
      const resp = await evolutionFetch(evo, "/send/media", {
        method: "POST",
        body: JSON.stringify({
          number: destino,
          ...(destino === data.chatId ? { formatJid: false } : {}),
          type: "audio",
          url: data.base64,
        }),
      });
      if (resp.status >= 400) {
        const c = (resp.corpo ?? {}) as Record<string, unknown>;
        const erro = (c["error"] ?? {}) as Record<string, unknown>;
        const msg = erro["message"] ?? c["message"] ?? c["error"];
        throw new Error(
          typeof msg === "string" && msg.trim() ? msg : `Falha ao enviar o áudio (${resp.status}).`,
        );
      }
      const raw = (resp.corpo ?? {}) as Record<string, unknown>;
      const d = ((raw["data"] ?? raw) as Record<string, unknown>) ?? {};
      const info = (d["Info"] ?? {}) as Record<string, unknown>;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const caminho = `${data.conversationId}/${Date.now()}-enviado.ogg`;
      await supabaseAdmin.storage
        .from(BUCKET_AUDIOS)
        .upload(caminho, Buffer.from(data.base64, "base64"), {
          contentType: data.mime,
          upsert: true,
        });

      await supabaseAdmin.from("whatsapp_messages" as never).insert({
        conversation_id: data.conversationId,
        wa_message_id: typeof info["ID"] === "string" ? info["ID"] : null,
        direcao: "enviada",
        user_id: userId,
        content: "",
        media_type: "audio",
        media_url: caminho,
      } as never);
      await supabaseAdmin
        .from("whatsapp_conversations" as never)
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: "[áudio]",
        } as never)
        .eq("id", data.conversationId);

      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

/** Link temporário para ouvir um áudio guardado. */
export const whatsappAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caminho: string }) => ({
    caminho: String(input?.caminho ?? "").trim(),
  }))
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    if (!data.caminho) return { url: null };
    if (/^https?:\/\//i.test(data.caminho)) return { url: data.caminho };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assinado } = await supabaseAdmin.storage
      .from(BUCKET_AUDIOS)
      .createSignedUrl(data.caminho, 3600);
    return { url: assinado?.signedUrl ?? null };
  });

/** Importa a lista de conversas do WhatsApp do servidor externo. */
export const whatsappSincronizarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<WhatsAppSyncResultado> => {
    // No Evolution Go as conversas chegam pelo recebedor de mensagens
    // (/api/public/evolution-webhook) — não há lista de chats para importar.
    if (await evolutionConfigurado()) {
      return {
        ok: true,
        conversas: 0,
        erro: "As conversas aparecem automaticamente conforme as mensagens chegam.",
      };
    }
    try {
      const r = await bridgeFetch("/chats");
      const lista = Array.isArray(r)
        ? r
        : Array.isArray((r as Record<string, unknown>)?.["chats"])
          ? ((r as Record<string, unknown>)["chats"] as unknown[])
          : [];

      const linhas = lista
        .map((item) => {
          const c = item as Record<string, unknown>;
          const chatId = String(c["id"] ?? c["chatId"] ?? "").trim();
          if (!chatId) return null;
          const nome = String(c["name"] ?? c["contactName"] ?? "").trim();
          const timestamp = Number(c["timestamp"] ?? 0);
          return {
            wa_chat_id: chatId,
            telefone: chatId.replace(/@.*$/, ""),
            contato_nome: nome || chatId.replace(/@.*$/, ""),
            is_group: c["isGroup"] === true || chatId.endsWith("@g.us"),
            last_message_preview:
              typeof c["lastMessage"] === "string"
                ? (c["lastMessage"] as string).slice(0, 120)
                : null,
            last_message_at:
              Number.isFinite(timestamp) && timestamp > 0
                ? new Date(timestamp * 1000).toISOString()
                : null,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      if (linhas.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (let i = 0; i < linhas.length; i += 300) {
          const { error } = await supabaseAdmin
            .from("whatsapp_conversations" as never)
            .upsert(linhas.slice(i, i + 300) as never, { onConflict: "wa_chat_id" });
          if (error) throw error;
        }
      }

      return { ok: true, conversas: linhas.length };
    } catch (e) {
      return { ok: false, conversas: 0, erro: e instanceof Error ? e.message : String(e) };
    }
  });
