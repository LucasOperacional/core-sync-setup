/**
 * OpenAI Enhancer — Usa a API da OpenAI para melhorar a extração de dados
 * de PDFs e planilhas.
 *
 * Todas as chamadas passam pela fila sequencial (openai-queue.ts) que garante:
 * - Uma requisição por vez (mutex)
 * - Retry com backoff exponencial respeitando Retry-After
 * - Detecção de erros de billing/quota (sem retry)
 * - Cache de resultados já processados
 * - Log seguro (sem dados sensíveis)
 */

import { enqueueOpenAIRequest, OpenAIRequestError, type QueuedResponse } from "@/lib/openai-queue";

const STORAGE_KEY = "openai-api-config-v1";
const TOKEN_USAGE_KEY = "openai-token-usage-v1";

const DEFAULT_MODEL = "gpt-4o-mini";
const TEST_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 30_000;

export interface OpenAIConfig {
  apiKey: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastUsed: string | null;
}

export function loadOpenAIConfig(): OpenAIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OpenAIConfig>;
      return { apiKey: parsed.apiKey ?? "" };
    }
  } catch {
    /* cache inválido */
  }
  return { apiKey: "" };
}

export function saveOpenAIConfig(config: OpenAIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage cheio */
  }
}

export function isOpenAIConfigured(): boolean {
  const config = loadOpenAIConfig();
  return config.apiKey.trim().length > 0;
}

export function loadTokenUsage(): TokenUsage {
  try {
    const raw = localStorage.getItem(TOKEN_USAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as TokenUsage;
    }
  } catch {
    /* cache inválido */
  }
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    lastUsed: null,
  };
}

export function saveTokenUsage(usage: TokenUsage): void {
  try {
    localStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(usage));
  } catch {
    /* storage cheio */
  }
}

export function resetTokenUsage(): void {
  saveTokenUsage({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    lastUsed: null,
  });
}

export function addTokenUsage(prompt: number, completion: number): void {
  const current = loadTokenUsage();
  current.promptTokens += prompt;
  current.completionTokens += completion;
  current.totalTokens += prompt + completion;
  current.requestCount += 1;
  current.lastUsed = new Date().toISOString();
  saveTokenUsage(current);
}

function trackUsage(data: Record<string, unknown>): void {
  const usage = data["usage"] as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  if (usage) {
    addTokenUsage(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
  }
}

// Re-export for consumers that catch errors
export { OpenAIRequestError as OpenAIError } from "@/lib/openai-queue";

/**
 * Testa a conexão com a API da OpenAI fazendo uma chamada simples.
 * NÃO faz retry (teste é pontual). NÃO usa cache.
 */
export async function testOpenAIConnection(
  apiKey: string,
): Promise<{ ok: boolean; error?: string; model?: string; latencyMs?: number }> {
  const start = Date.now();

  try {
    const result: QueuedResponse = await enqueueOpenAIRequest({
      apiKey,
      body: {
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        max_tokens: 5,
      },
      timeoutMs: TEST_TIMEOUT_MS,
      noRetry: true,
      noCache: true,
    });

    const latencyMs = Date.now() - start;
    trackUsage(result.data);
    const model = (result.data["model"] as string) ?? DEFAULT_MODEL;
    return { ok: true, model, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;

    if (err instanceof OpenAIRequestError) {
      if (err.isBillingError) {
        return { ok: false, error: err.message, latencyMs };
      }
      return { ok: false, error: err.message, latencyMs };
    }

    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido",
      latencyMs,
    };
  }
}

export interface EnhancedRecord {
  nome: string;
  empresa: string;
  matricula: string;
  cargo: string;
}

/**
 * Envia um lote de registros mal extraídos para a OpenAI refinar.
 * Passa pela fila sequencial com retry automático.
 */
export async function enhanceRecordsWithAI(
  records: Array<{ nome: string; empresa: string; matricula: string; cargo: string }>,
): Promise<EnhancedRecord[]> {
  const config = loadOpenAIConfig();
  if (!config.apiKey) {
    throw new OpenAIRequestError("Chave da API OpenAI não configurada.", 0, false);
  }

  // Limita o lote para não exceder o contexto
  const batch = records.slice(0, 50);

  const systemPrompt =
    "Corrija dados de funcionários extraídos de PDFs/planilhas. Receba um array JSON com campos: nome, empresa, matricula, cargo. Corrija nomes (capitalização, OCR), separe campos misturados, mantenha valores originais se não puder corrigir. Responda APENAS com um array JSON válido.";

  const result = await enqueueOpenAIRequest({
    apiKey: config.apiKey,
    body: {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(batch) },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    },
    timeoutMs: OPERATION_TIMEOUT_MS,
  });

  trackUsage(result.data);

  if (result.cached) {
    console.info("[OpenAI Enhancer] Resultado obtido do cache.");
  }

  const choices = (result.data as Record<string, unknown>)["choices"] as
    Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content ?? "[]";

  try {
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as EnhancedRecord[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    console.warn("[OpenAI Enhancer] Resposta não é JSON válido:", content.slice(0, 200));
  }

  return batch;
}

/**
 * Analisa texto bruto de um PDF usando a OpenAI para extrair dados estruturados.
 * Passa pela fila sequencial com retry automático.
 */
export async function analyzeTextWithAI(rawText: string, context: string): Promise<string> {
  const config = loadOpenAIConfig();
  if (!config.apiKey) {
    throw new OpenAIRequestError("Chave da API OpenAI não configurada.", 0, false);
  }

  // Trunca texto muito longo para reduzir tokens
  const truncatedText =
    rawText.length > 6000 ? rawText.slice(0, 6000) + "\n[...texto truncado...]" : rawText;

  const result = await enqueueOpenAIRequest({
    apiKey: config.apiKey,
    body: {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: `Analise documentos operacionais. ${context}`,
        },
        { role: "user", content: truncatedText },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    },
    timeoutMs: OPERATION_TIMEOUT_MS,
  });

  trackUsage(result.data);

  const choices = (result.data as Record<string, unknown>)["choices"] as
    Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}
