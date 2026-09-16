import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations,
  createConversation,
  renameConversation as dbRename,
  deleteConversation as dbDelete,
  listMessages,
  saveMessage,
  updateMessageStatus,
  updateConversationProvider,
  type AiConversation,
  type AiMessage,
} from "@/lib/ai-chat-db";
import { iaChatResponder } from "@/lib/ia-chat.functions";
import { manusExecutarTarefa } from "@/lib/manus.functions";
import { loadManusConfig } from "@/lib/manus-ai";

/** Provedores de IA que o usuário pode escolher no Chat IA. */
export type AiProviderChoice = "painel" | "gemini" | "openai" | "manus";

export const AI_PROVIDERS: Array<{ value: AiProviderChoice; label: string; hint: string }> = [
  { value: "painel", label: "IA do Painel", hint: "IA nativa do sistema — sempre disponível" },
  { value: "manus", label: "Manus AI", hint: "Agente autônomo para tarefas de várias etapas" },
  { value: "gemini", label: "Google Gemini", hint: "Requer chave configurada no servidor" },
  { value: "openai", label: "OpenAI", hint: "Requer chave configurada no servidor" },
];

const MANUS_TASKS_KEY = "manus-chat-tasks-v1";

function readManusTasks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MANUS_TASKS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function getManusTaskId(conversationId: string): string | undefined {
  return readManusTasks()[conversationId];
}

function setManusTaskId(conversationId: string, taskId: string): void {
  try {
    const all = readManusTasks();
    all[conversationId] = taskId;
    localStorage.setItem(MANUS_TASKS_KEY, JSON.stringify(all));
  } catch {
    /* storage indisponível */
  }
}

const SYSTEM_PROMPT = `Você é o assistente do Painel Central Operacional. Ajude com:
- Perguntas sobre módulos (Control, Faltas, Atestados, Folhas de Ponto, Protocolo, IA Operacional, Admin)
- Análise de dados e dashboards
- Explicação de KPIs e gráficos
- Localização de erros e sugestão de correções
- Orientação sobre funcionalidades
Seja direto e responda em português. Use markdown para formatar listas, tabelas, códigos e links quando apropriado.`;

export interface ChatState {
  conversations: AiConversation[];
  activeConversationId: string | null;
  messages: AiMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
}

export function useAiChat() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Use a ref for the sending guard so it's never stale across closures
  const isSendingRef = useRef(false);

  // Keep a ref to the current active conversation id for use in callbacks
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;

  // Track the conversation that sendMessage is currently working on.
  // When set, the useEffect should NOT reload messages for that conversation
  // because sendMessage is managing them directly.
  const sendingConversationRef = useRef<string | null>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      // Don't reload if sendMessage is actively managing this conversation
      if (sendingConversationRef.current === activeConversationId) {
        return;
      }
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  async function loadConversations() {
    try {
      const convs = await listConversations();
      setConversations(convs);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[useAiChat] Failed to load conversations:", err);
      }
    }
  }

  async function loadMessages(conversationId: string) {
    setIsLoading(true);
    try {
      const msgs = await listMessages(conversationId);
      setMessages(msgs);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[useAiChat] Failed to load messages:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const newConversation = useCallback(async () => {
    try {
      const conv = await createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setError(null);
      return conv;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[useAiChat] Failed to create conversation:", err);
      }
      throw err;
    }
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setError(null);
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await dbRename(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title, updated_at: new Date().toISOString() } : c)),
      );
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[useAiChat] Failed to rename:", err);
      }
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationIdRef.current === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[useAiChat] Failed to delete:", err);
      }
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, provider: AiProviderChoice = "painel") => {
      if (!content.trim()) return;

      // Use ref for the guard — never stale
      if (isSendingRef.current) {
        if (import.meta.env.DEV) {
          console.warn("[useAiChat] sendMessage called while already sending, ignoring.");
        }
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      setError(null);

      let conversationId = activeConversationIdRef.current;
      let isNewConversation = false;
      let currentMessages: AiMessage[] = [];

      // Create conversation if none active
      if (!conversationId) {
        try {
          const title = content.trim().slice(0, 60) + (content.trim().length > 60 ? "..." : "");
          const conv = await createConversation(title);
          setConversations((prev) => [conv, ...prev]);
          conversationId = conv.id;
          isNewConversation = true;

          // Mark this conversation as being managed by sendMessage
          // so the useEffect doesn't reload messages and cause a race condition
          sendingConversationRef.current = conv.id;

          // Clear messages first, then set the active conversation
          setMessages([]);
          setActiveConversationId(conv.id);
          currentMessages = [];
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error("[useAiChat] Failed to create conversation:", err);
          }
          setError("Erro ao criar conversa. Tente novamente.");
          isSendingRef.current = false;
          setIsSending(false);
          return;
        }
      } else {
        // Mark this conversation as being managed by sendMessage
        sendingConversationRef.current = conversationId;

        // Snapshot current messages for building API context
        currentMessages = await listMessages(conversationId).catch(() => []);
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Save user message to DB
        const userMsg = await saveMessage({
          conversation_id: conversationId,
          role: "user",
          content: content.trim(),
          status: "sent",
        });
        setMessages((prev) => [...prev, userMsg]);

        // Auto-rename if first message in existing conversation with no user messages yet
        if (!isNewConversation) {
          const userMsgCount = currentMessages.filter((m) => m.role === "user").length;
          if (userMsgCount === 0) {
            const title = content.trim().slice(0, 60) + (content.trim().length > 60 ? "..." : "");
            await dbRename(conversationId, title).catch(() => {});
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
            );
          }
        }

        // Build messages for API using the snapshot + the new user message
        const historyForApi = currentMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .filter((m) => m.status !== "error")
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        const apiMessages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...historyForApi,
          { role: "user", content: content.trim() },
        ];

        let data: { content?: string; provider: string | null; model: string | null };

        if (provider === "manus") {
          /* ── Manus AI: cria/continua uma tarefa do agente ── */
          const manusConfig = loadManusConfig();
          if (!manusConfig.apiKey.trim()) {
            throw new Error(
              "Configure a chave da Manus AI no card 'Manus AI' da página IA Operacional.",
            );
          }

          const historico = historyForApi
            .slice(-6)
            .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
            .join("\n");

          const taskId = getManusTaskId(conversationId);

          const res = await manusExecutarTarefa({
            data: {
              apiKey: manusConfig.apiKey.trim(),
              agentProfile: manusConfig.agentProfile,
              locale: manusConfig.locale,
              hideInTaskList: manusConfig.hideInTaskList,
              prompt: taskId
                ? content.trim()
                : `${SYSTEM_PROMPT}\n\n${historico ? `Histórico:\n${historico}\n\n` : ""}Pergunta: ${content.trim()}`,
              ...(taskId ? { taskId } : {}),
            },
          });

          setManusTaskId(conversationId, res.taskId);
          data = { content: res.content, provider: "manus", model: res.model };
        } else if (provider === "gemini" || provider === "openai") {
          /* ── Gemini / OpenAI via função de borda ── */
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (!accessToken) {
            throw new Error("Sessão expirada. Faça login novamente.");
          }

          const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "";
          if (!supabaseUrl) {
            throw new Error("Backend não configurado. Contate o administrador do sistema.");
          }

          const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ messages: apiMessages, provider }),
            signal: controller.signal,
          });

          if (!response.ok) {
            let errMsg = `Erro HTTP ${response.status}`;
            try {
              const errData = await response.json();
              if (errData.error) errMsg = errData.error;
            } catch {
              // resposta não-JSON
            }
            setError(errMsg);

            const errorAssistantMsg = await saveMessage({
              conversation_id: conversationId,
              role: "assistant",
              content: errMsg,
              status: "error",
            });
            setMessages((prev) => [...prev, errorAssistantMsg]);
            return;
          }

          data = await response.json();
        } else {
          /* ── IA do painel (padrão) ── */
          const res = await iaChatResponder({
            data: {
              messages: [...historyForApi, { role: "user", content: content.trim() }].map((m) => ({
                role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                content: m.content,
              })),
            },
          });
          data = { content: res.content, provider: "painel", model: res.model };
        }

        if (!data.content) {
          if (import.meta.env.DEV) {
            console.warn("[useAiChat] Empty response from edge function:", data);
          }
          throw new Error("A IA retornou uma resposta vazia. Tente novamente.");
        }

        if (import.meta.env.DEV) {
          console.info("[useAiChat] Response received:", {
            provider: data.provider,
            model: data.model,
            contentLength: data.content?.length,
          });
        }

        // Save assistant message
        const assistantMsg = await saveMessage({
          conversation_id: conversationId,
          role: "assistant",
          content: data.content,
          provider: data.provider,
          model: data.model,
          status: "done",
        });
        setMessages((prev) => [...prev, assistantMsg]);

        // Update conversation provider
        if (data.provider) {
          await updateConversationProvider(conversationId, data.provider).catch(() => {});
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? { ...c, provider: data.provider, updated_at: new Date().toISOString() }
                : c,
            ),
          );
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          setError(null);
          return;
        }
        const errMsg = err.message ?? "Erro de conexão. Tente novamente.";
        if (import.meta.env.DEV) {
          console.error("[useAiChat] Send error:", errMsg);
        }
        setError(errMsg);

        if (conversationId) {
          try {
            const errorAssistantMsg = await saveMessage({
              conversation_id: conversationId,
              role: "assistant",
              content: errMsg,
              status: "error",
            });
            setMessages((prev) => [...prev, errorAssistantMsg]);
          } catch {
            // Ignore save error
          }
        }
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
        abortRef.current = null;
        // Release the conversation lock so useEffect can load messages normally again
        sendingConversationRef.current = null;
      }
    },
    [], // No dependencies needed — all state access is via refs or state setters
  );

  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      isSendingRef.current = false;
      setIsSending(false);
      sendingConversationRef.current = null;
    }
  }, []);

  const regenerateLastMessage = useCallback(
    async (provider: AiProviderChoice = "painel") => {
      if (isSendingRef.current) return;

      // Get fresh messages from state
      const currentMessages = await new Promise<AiMessage[]>((resolve) => {
        setMessages((prev) => {
          resolve(prev);
          return prev;
        });
      });

      if (currentMessages.length < 1) return;

      // Find last user message
      const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      // Remove everything after last user message from view
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === lastUserMsg.id);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });

      // Re-send with the content of the last user message
      await sendMessage(lastUserMsg.content, provider);
    },
    [sendMessage],
  );

  return {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isSending,
    error,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    sendMessage,
    cancelRequest,
    regenerateLastMessage,
    refreshConversations: loadConversations,
  };
}
