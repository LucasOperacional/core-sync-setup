/**
 * Chat da IA Oficial — responde qualquer pergunta usando a IA nativa do app
 * (Lovable AI Gateway). Não exige chave do usuário nem dados de treinamento.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
  contexto: z.string().max(20000).optional(),
});

const SYSTEM_PROMPT = `Você é o assistente de IA do Portal Operacional.

Regras:
- Responda SEMPRE em português brasileiro.
- Responda qualquer pergunta que o usuário fizer, de qualquer assunto, com o seu próprio conhecimento — você NÃO está limitado a dados de treinamento do sistema.
- Se houver um bloco de CONTEXTO DO SISTEMA, use-o quando for relevante, mas nunca se recuse a responder por falta dele.
- Seja claro, direto e útil. Use markdown (listas, negrito, tabelas) quando ajudar.
- Ao citar números do sistema, use apenas os que estiverem no contexto; para conhecimento geral, responda normalmente.`;

const MODELOS = ["google/gemini-3.7-flash", "google/gemini-3.5-flash", "openai/gpt-5.6-luna"];

export const iaChatResponder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("IA indisponível: a chave da IA do projeto não está configurada.");
    }

    const system = data.contexto?.trim()
      ? `${SYSTEM_PROMPT}\n\nCONTEXTO DO SISTEMA:\n${data.contexto.trim()}`
      : SYSTEM_PROMPT;

    const body = (model: string) => ({
      model,
      messages: [
        { role: "system", content: system },
        ...data.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    let ultimoErro = "";

    for (const model of MODELOS) {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify(body(model)),
        });

        if (res.ok) {
          const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const content = json.choices?.[0]?.message?.content?.trim() ?? "";
          return {
            content: content || "Não consegui gerar uma resposta agora.",
            model,
            promptTokens: json.usage?.prompt_tokens ?? 0,
            completionTokens: json.usage?.completion_tokens ?? 0,
          };
        }

        const texto = await res.text().catch(() => "");
        ultimoErro = `HTTP ${res.status} (${model}) ${texto.slice(0, 300)}`;

        if (res.status === 429 || res.status >= 500) {
          const espera = Number(res.headers.get("retry-after")) * 1000;
          await new Promise((r) =>
            setTimeout(r, Number.isFinite(espera) && espera > 0 ? espera : 800 * (tentativa + 1)),
          );
          continue;
        }

        if (res.status === 402) {
          throw new Error(
            "Os créditos de IA do projeto acabaram. Adicione créditos para continuar usando o chat.",
          );
        }
        if (res.status === 403) {
          throw new Error(
            "A IA está bloqueada pelas configurações do workspace. Fale com o administrador.",
          );
        }
        break; // erro terminal deste modelo: tenta o próximo
      }
    }

    throw new Error(`Falha ao consultar a IA. Detalhes: ${ultimoErro}`);
  });
