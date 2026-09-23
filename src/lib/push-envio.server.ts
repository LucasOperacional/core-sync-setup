/** Núcleo do envio das notificações: texto pela API Gemini + entrega por Web Push (VAPID).
 * Só roda no servidor. Nunca devolve endpoint, chaves ou segredos para o cliente.
 */

import {
  ehCategoriaPush,
  rotaInternaValida,
  TEXTO_PADRAO,
  type CategoriaPush,
  type StatusNotificacao,
} from "./push-tipos";

export type TextoNotificacao = { title: string; body: string; priority: "normal" | "high" };

export type PedidoNotificacao = {
  category: CategoriaPush;
  event: string;
  recipientUserIds: string[];
  context?: Record<string, unknown> | null;
  targetUrl?: string | null;
  deduplicationKey?: string | null;
  /** Permite ignorar o horário silencioso (apenas para eventos críticos autorizados). */
  ignorarHorarioSilencioso?: boolean;
  titleOverride?: string | null;
  bodyOverride?: string | null;
};

export type ResultadoDestinatario = {
  userId: string;
  status: StatusNotificacao | "ignorado" | "duplicado";
  enviados: number;
  falhas: number;
  motivo?: string;
};

export type ResultadoNotificacao = {
  ok: boolean;
  fonte: "gemini" | "padrao";
  titulo: string;
  corpo: string;
  prioridade: "normal" | "high";
  resultados: ResultadoDestinatario[];
};

const LIMITE_TITULO = 50;
const LIMITE_CORPO = 150;

function limitar(valor: unknown, max: number): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Confere os segredos e devolve um diagnóstico específico, sem expor valores. */
export function segredosPush() {
  const faltando: string[] = [];
  const vapidPublic = process.env["VAPID_PUBLIC_KEY"] ?? "";
  const vapidPrivate = process.env["VAPID_PRIVATE_KEY"] ?? "";
  const vapidSubject = process.env["VAPID_SUBJECT"] ?? "";
  const geminiKey = process.env["GEMINI_API_KEY"] ?? "";
  if (!vapidPublic) faltando.push("VAPID_PUBLIC_KEY");
  if (!vapidPrivate) faltando.push("VAPID_PRIVATE_KEY");
  if (!vapidSubject) faltando.push("VAPID_SUBJECT");
  // O nome pode vir com prefixo de provedor (ex.: "google/gemini-3.8-flash"): usar só o modelo.
  const modeloBruto = (process.env["GEMINI_MODEL"] || "").trim();
  const modelo = (modeloBruto.includes("/") ? modeloBruto.split("/").pop()! : modeloBruto) || "";
  return {
    faltando,
    geminiConfigurado: Boolean(geminiKey),
    vapid: { publicKey: vapidPublic, privateKey: vapidPrivate, subject: vapidSubject },
    geminiKey,
    geminiModel: modelo || "gemini-3.6-flash",
  };
}

/** Remove cercas de código quando o modelo devolve o JSON dentro de ```json. */
function limparJson(texto: string): string {
  const t = texto.trim();
  if (!t.startsWith("```")) return t;
  return t
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/** Pede o título e o corpo à API Gemini. Qualquer falha devolve null (usa o texto padrão). */
export async function gerarTextoComGemini(
  pedido: Pick<PedidoNotificacao, "category" | "event" | "context">,
): Promise<TextoNotificacao | null> {
  const { geminiKey, geminiModel } = segredosPush();
  if (!geminiKey) return null;

  const instrucao = [
    "Você escreve avisos curtos de um sistema operacional de facilities, em português do Brasil.",
    `Categoria: ${pedido.category}. Evento: ${pedido.event}.`,
    "Regras obrigatórias:",
    "- Título com no máximo 50 caracteres.",
    "- Corpo com no máximo 150 caracteres.",
    "- Linguagem profissional, clara e objetiva.",
    "- Não invente informações que não estejam no contexto.",
    "- Nunca cite CPF, documentos, diagnóstico médico, CID ou dados sensíveis.",
    "- Não crie links, não use Markdown e não explique nada.",
    '- priority deve ser "normal" ou "high".',
    `Contexto: ${JSON.stringify(pedido.context ?? {}).slice(0, 1500)}`,
  ].join("\n");

  // Se o modelo principal estiver sobrecarregado ou indisponível, tenta o reserva.
  const modelos = [...new Set([geminiModel, "gemini-3.6-flash"])];

  for (const modelo of modelos) {
    try {
      const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: instrucao }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  body: { type: "STRING" },
                  priority: { type: "STRING", enum: ["normal", "high"] },
                },
                required: ["title", "body", "priority"],
              },
            },
          }),
        },
      );

      if (!resposta.ok) continue;
      const json = (await resposta.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const partes = json.candidates?.[0]?.content?.parts ?? [];
      const bruto = partes.map((p) => p.text ?? "").join("");
      if (!bruto.trim()) continue;
      const dados = JSON.parse(limparJson(bruto)) as Partial<TextoNotificacao>;
      const title = limitar(dados.title, LIMITE_TITULO);
      const body = limitar(dados.body, LIMITE_CORPO);
      if (!title || !body) continue;
      return { title, body, priority: dados.priority === "high" ? "high" : "normal" };
    } catch {
      /* tenta o próximo modelo */
    }
  }
  return null;
}

function dentroDoHorarioSilencioso(prefs: {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}): boolean {
  if (!prefs.quiet_hours_enabled || !prefs.quiet_hours_start || !prefs.quiet_hours_end)
    return false;
  const agora = new Date();
  // Horário de Brasília (UTC-3), independente do fuso do servidor.
  const minutosAgora = ((agora.getUTCHours() + 21) % 24) * 60 + agora.getUTCMinutes();
  const [hi = "0", mi = "0"] = prefs.quiet_hours_start.split(":");
  const [hf = "0", mf = "0"] = prefs.quiet_hours_end.split(":");
  const inicio = Number(hi) * 60 + Number(mi);
  const fim = Number(hf) * 60 + Number(mf);
  return inicio <= fim
    ? minutosAgora >= inicio && minutosAgora < fim
    : minutosAgora >= inicio || minutosAgora < fim;
}

/** Envia a notificação para os destinatários informados (já autorizados pelo chamador). */
export async function dispararNotificacao(
  pedido: PedidoNotificacao,
): Promise<ResultadoNotificacao> {
  if (!ehCategoriaPush(pedido.category)) throw new Error("Categoria inválida.");
  if (!pedido.event || pedido.event.length > 80) throw new Error("Evento inválido.");

  const segredos = segredosPush();
  if (segredos.faltando.length > 0) {
    throw new Error(
      `Configuração necessária ainda pendente: ${segredos.faltando.join(", ")}. Cadastre esses valores para enviar notificações.`,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enviarWebPush } = await import("./push-crypto.server");

  const padrao = TEXTO_PADRAO[pedido.category];
  let fonte: "gemini" | "padrao" = "padrao";
  let texto: TextoNotificacao = { ...padrao, priority: "normal" };

  if (pedido.titleOverride && pedido.bodyOverride) {
    texto = {
      title: limitar(pedido.titleOverride, LIMITE_TITULO),
      body: limitar(pedido.bodyOverride, LIMITE_CORPO),
      priority: "normal",
    };
  } else {
    const daIa = await gerarTextoComGemini(pedido);
    if (daIa) {
      texto = daIa;
      fonte = "gemini";
    }
  }

  const targetUrl = rotaInternaValida(pedido.targetUrl);
  const resultados: ResultadoDestinatario[] = [];

  for (const userId of pedido.recipientUserIds) {
    // 1) preferências
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select(
        "protocolos, atestados, faltas, nexti, chat, documentos, sistema, quiet_hours_enabled, quiet_hours_start, quiet_hours_end",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (prefs) {
      const ligado = (prefs as Record<string, unknown>)[pedido.category];
      if (ligado === false) {
        resultados.push({
          userId,
          status: "ignorado",
          enviados: 0,
          falhas: 0,
          motivo: "Categoria desligada nas preferências",
        });
        continue;
      }
      const silencioso = dentroDoHorarioSilencioso(
        prefs as unknown as {
          quiet_hours_enabled: boolean;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
        },
      );
      const podeIgnorar = texto.priority === "high" && pedido.ignorarHorarioSilencioso === true;
      if (silencioso && !podeIgnorar) {
        resultados.push({
          userId,
          status: "ignorado",
          enviados: 0,
          falhas: 0,
          motivo: "Horário silencioso",
        });
        continue;
      }
    }

    // 2) histórico com status pendente (o índice único protege contra duplicidade)
    const { data: registro, error: erroRegistro } = await supabaseAdmin
      .from("notification_history")
      .insert({
        user_id: userId,
        category: pedido.category,
        event_type: pedido.event,
        title: texto.title,
        body: texto.body,
        target_url: targetUrl,
        status: "pending",
        metadata: { fonte, prioridade: texto.priority },
        deduplication_key: pedido.deduplicationKey ?? null,
      })
      .select("id")
      .single();

    if (erroRegistro || !registro) {
      const duplicado = (erroRegistro?.code ?? "") === "23505";
      resultados.push({
        userId,
        status: duplicado ? "duplicado" : "failed",
        enviados: 0,
        falhas: 0,
        motivo: duplicado ? "Evento já processado" : "Não foi possível registrar o aviso",
      });
      continue;
    }

    // 3) aparelhos ativos
    const { data: aparelhos } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (!aparelhos || aparelhos.length === 0) {
      await supabaseAdmin
        .from("notification_history")
        .update({ status: "failed", error_message: "Nenhum dispositivo ativo" })
        .eq("id", registro.id);
      resultados.push({
        userId,
        status: "failed",
        enviados: 0,
        falhas: 0,
        motivo: "Nenhum dispositivo ativo",
      });
      continue;
    }

    const conteudo = JSON.stringify({
      title: texto.title,
      body: texto.body,
      priority: texto.priority,
      category: pedido.category,
      event: pedido.event,
      target_url: targetUrl ?? "/notificacoes",
      notification_id: registro.id,
      tag: pedido.deduplicationKey ?? `${pedido.category}:${registro.id}`,
    });

    let enviados = 0;
    let falhas = 0;
    for (const aparelho of aparelhos) {
      const r = await enviarWebPush({
        endpoint: aparelho.endpoint,
        p256dh: aparelho.p256dh,
        auth: aparelho.auth,
        conteudo,
        ttlSegundos: texto.priority === "high" ? 3600 : 86400,
        urgencia: texto.priority === "high" ? "high" : "normal",
        vapid: segredos.vapid,
      });
      if (r.ok) enviados += 1;
      else {
        falhas += 1;
        if (r.expirado) {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ enabled: false })
            .eq("id", aparelho.id);
        }
      }
    }

    const status: StatusNotificacao = enviados > 0 ? (falhas > 0 ? "partial" : "sent") : "failed";

    await supabaseAdmin
      .from("notification_history")
      .update({
        status,
        sent_count: enviados,
        failed_count: falhas,
        error_message: enviados === 0 ? "Falha na entrega para os dispositivos" : null,
      })
      .eq("id", registro.id);

    resultados.push({ userId, status, enviados, falhas });
  }

  return {
    ok: resultados.some((r) => r.status === "sent" || r.status === "partial"),
    fonte,
    titulo: texto.title,
    corpo: texto.body,
    prioridade: texto.priority,
    resultados,
  };
}
