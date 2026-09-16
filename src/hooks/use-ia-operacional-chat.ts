/**
 * Hook para o chat da IA Operacional.
 *
 * Não depende de Edge Function nem de chave Gemini do usuário: a resposta vem
 * da IA nativa do projeto (server function `iaChatResponder`), que responde
 * qualquer pergunta. O contexto do banco é opcional e apenas enriquece a resposta.
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { iaChatResponder } from "@/lib/ia-chat.functions";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  status: "sent" | "done" | "error" | "streaming";
}

type TrainingRow = {
  category: string | null;
  title: string | null;
  content: string | null;
};

/** Contexto opcional — qualquer falha aqui é ignorada. */
async function buildContext(): Promise<string> {
  const blocks: string[] = [];

  try {
    const { data } = await supabase
      .from("ia_training_data")
      .select("category, title, content")
      .limit(20);

    const rows = (data ?? []) as TrainingRow[];
    if (rows.length > 0) {
      blocks.push(
        `DADOS DO SISTEMA:\n${rows
          .map(
            (r) =>
              `[${r.category ?? "geral"}] ${r.title ?? ""}\n${(r.content ?? "").slice(0, 1000)}`,
          )
          .join("\n\n")}`,
      );
    }
  } catch {
    /* opcional */
  }

  try {
    const stats: string[] = [];

    const pending = await supabase
      .from("operational_errors")
      .select("id", { count: "exact", head: true })
      .in("status", ["detected", "pending_review"]);
    if (typeof pending.count === "number") {
      stats.push(`Erros pendentes de resolução: ${pending.count}`);
    }

    const resolved = await supabase
      .from("operational_errors")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved");
    if (typeof resolved.count === "number") {
      stats.push(`Erros resolvidos: ${resolved.count}`);
    }

    if (stats.length > 0) {
      blocks.push(`ESTATÍSTICAS:\n${stats.join("\n")}`);
    }
  } catch {
    /* opcional */
  }

  return blocks.join("\n\n").slice(0, 18000);
}

export function useIaOperacionalChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSendingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const clearChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setError(null);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      timestamp: new Date().toISOString(),
      status: "sent",
    };

    const history = [...messagesRef.current, userMsg];
    messagesRef.current = history;
    setMessages(history);

    try {
      const contexto = await buildContext();

      const payload = history
        .filter((m) => m.status !== "error")
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await iaChatResponder({
        data: { messages: payload, ...(contexto ? { contexto } : {}) },
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.content || "Sem resposta.",
        timestamp: new Date().toISOString(),
        status: "done",
      };

      messagesRef.current = [...messagesRef.current, assistantMsg];
      setMessages(messagesRef.current);
    } catch (err) {
      const errMsg =
        (err as { message?: string })?.message ?? "Erro ao gerar resposta. Tente novamente.";
      setError(errMsg);

      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: errMsg,
        timestamp: new Date().toISOString(),
        status: "error",
      };
      messagesRef.current = [...messagesRef.current, errorMsg];
      setMessages(messagesRef.current);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }, []);

  const cancelRequest = useCallback(() => {
    isSendingRef.current = false;
    setIsSending(false);
  }, []);

  return {
    messages,
    isSending,
    error,
    sendMessage,
    cancelRequest,
    clearChat,
  };
}
