import { useState, useCallback, useRef } from "react";
import { loadOpenAIConfig, isOpenAIConfigured, addTokenUsage } from "@/lib/openai-enhancer";
import { enqueueOpenAIRequest, OpenAIRequestError } from "@/lib/openai-queue";
import { isGeminiConfigured, chatWithGemini, GeminiRequestError } from "@/lib/gemini-enhancer";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const SYSTEM_PROMPT = `Você é o assistente do Painel Central Operacional. Ajude com:
- Perguntas sobre módulos (Control, Faltas, Atestados, Folhas de Ponto, Protocolo, IA Operacional, Admin)
- Análise de dados e dashboards
- Explicação de KPIs e gráficos
- Localização de erros e sugestão de correções
- Orientação sobre funcionalidades
Seja direto e responda em português.`;

const DEFAULT_MODEL = "gpt-4o-mini";
const OPERATION_TIMEOUT_MS = 30_000;

type AIProvider = "gemini" | "openai" | null;

function detectProvider(): AIProvider {
  if (isGeminiConfigured()) return "gemini";
  if (isOpenAIConfigured()) return "openai";
  return null;
}

export function useChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const configured = isGeminiConfigured() || isOpenAIConfigured();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const provider = detectProvider();
      if (!provider) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let assistantContent: string;

        if (provider === "gemini") {
          // Build Gemini messages — map conversation history
          const geminiMessages = [
            ...messages.slice(-10).map((m) => ({
              role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
              text: m.content,
            })),
            { role: "user" as const, text: content.trim() },
          ];

          const result = await chatWithGemini(geminiMessages, SYSTEM_PROMPT, {
            signal: controller.signal,
          });
          assistantContent = result.content;
        } else {
          // OpenAI path
          const config = loadOpenAIConfig();
          if (!config.apiKey) {
            throw new Error("Chave da API OpenAI não configurada.");
          }

          const apiMessages = [
            { role: "system" as const, content: SYSTEM_PROMPT },
            ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: content.trim() },
          ];

          const result = await enqueueOpenAIRequest({
            apiKey: config.apiKey,
            body: {
              model: DEFAULT_MODEL,
              messages: apiMessages,
              temperature: 0.7,
              max_tokens: 1500,
            },
            timeoutMs: OPERATION_TIMEOUT_MS,
            noCache: true,
            signal: controller.signal,
          });

          const usage = result.data["usage"] as
            { prompt_tokens?: number; completion_tokens?: number } | undefined;
          if (usage) {
            addTokenUsage(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
          }

          const choices = result.data["choices"] as
            Array<{ message?: { content?: string } }> | undefined;
          assistantContent =
            choices?.[0]?.message?.content ?? "Desculpe, não consegui gerar uma resposta.";
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        let errorMessage = "Erro de conexão. Verifique sua internet e tente novamente.";

        if (err instanceof GeminiRequestError) {
          if (err.isBillingError) {
            errorMessage =
              "Limite de cota da API Gemini atingido. Verifique no Google Cloud Console.";
          } else if (err.status === 401 || err.status === 403) {
            errorMessage =
              "Chave da API Gemini inválida ou sem permissão. Verifique no Painel Admin.";
          } else if (err.status === 429) {
            errorMessage = "Limite de requisições excedido. Aguarde um momento e tente novamente.";
          } else if (err.message.includes("cancelada")) {
            errorMessage = "Requisição cancelada.";
          } else {
            errorMessage = err.message;
          }
        } else if (err instanceof OpenAIRequestError) {
          if (err.isBillingError) {
            errorMessage =
              "Limite de créditos ou cota mensal da OpenAI atingido. Verifique seu plano em platform.openai.com/account/billing.";
          } else if (err.status === 401) {
            errorMessage = "Chave da API OpenAI inválida ou expirada. Verifique no Painel Admin.";
          } else if (err.status === 429) {
            errorMessage =
              "Limite de requisições excedido mesmo após retentativas. Aguarde um momento e tente novamente.";
          } else if (err.status >= 500) {
            errorMessage = "Servidor da OpenAI indisponível. Tente novamente em instantes.";
          } else if (err.message.includes("cancelada")) {
            errorMessage = "Requisição cancelada.";
          } else {
            errorMessage = err.message;
          }
        } else if (err instanceof DOMException && err.name === "AbortError") {
          errorMessage = "A requisição foi cancelada.";
        }

        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages, isLoading],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isLoading,
    configured,
    sendMessage,
    clearMessages,
    cancelRequest,
  };
}
