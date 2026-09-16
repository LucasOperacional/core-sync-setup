import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit: 50 messages per hour per user
const RATE_LIMIT = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function sanitizeInput(text: string): string {
  if (typeof text !== "string") return "";
  return text.trim().slice(0, 10000);
}

// Errors that should NOT trigger provider fallback
function isNonRetryableError(status: number, body: string): boolean {
  const lower = body.toLowerCase();
  // Content policy / safety
  if (
    lower.includes("safety") ||
    lower.includes("blocked") ||
    lower.includes("content_filter") ||
    lower.includes("harm")
  )
    return true;
  // Auth errors
  if (status === 401 || status === 403) {
    if (!lower.includes("quota") && !lower.includes("rate") && !lower.includes("limit"))
      return true;
  }
  // Bad request (invalid content)
  if (status === 400 && (lower.includes("invalid") || lower.includes("malformed"))) return true;
  return false;
}

// Errors that SHOULD trigger fallback
function isRetryableError(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status === 0) return true;
  if (status === 404) {
    const lower = body.toLowerCase();
    if (
      lower.includes("model") ||
      lower.includes("not found") ||
      lower.includes("no longer available")
    )
      return true;
  }
  return false;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ProviderResult {
  content: string;
  provider: string;
  model: string;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const err = new Error(`OpenAI HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      (err as any).status = response.status;
      (err as any).errorBody = errorBody;
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const usedModel = data.model ?? model;
    return { content, provider: "openai", model: usedModel };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // Convert messages to Gemini format
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, any> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const err = new Error(`Gemini HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      (err as any).status = response.status;
      (err as any).errorBody = errorBody;
      throw err;
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usedModel = data.modelVersion ?? model;
    return { content, provider: "gemini", model: usedModel };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({
          error: "Limite de uso atingido. Aguarde antes de enviar mais mensagens (50/hora).",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse body
    const body = await req.json();
    const rawMessages = body.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return new Response(JSON.stringify({ error: "Mensagens inválidas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages: ChatMessage[] = rawMessages
      .map((m: any) => ({
        role: sanitizeInput(String(m.role || "user")),
        content: sanitizeInput(String(m.content || "")),
      }))
      .filter((m: ChatMessage) => m.content.length > 0);

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "Mensagem vazia" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read secrets
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const openaiModel = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const primaryProvider = (Deno.env.get("AI_PRIMARY_PROVIDER") ?? "auto").toLowerCase();

    const hasOpenAI = openaiKey.length > 0;
    const hasGemini = geminiKey.length > 0;

    if (!hasOpenAI && !hasGemini) {
      return new Response(
        JSON.stringify({
          error:
            "Nenhuma API de IA configurada. Configure OPENAI_API_KEY ou GEMINI_API_KEY nos Secrets do Supabase.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine provider order
    type ProviderFn = () => Promise<ProviderResult>;
    const providers: ProviderFn[] = [];

    const openaiCall = () => callOpenAI(openaiKey, openaiModel, messages);
    const geminiCall = () => callGemini(geminiKey, geminiModel, messages);

    if (primaryProvider === "openai") {
      if (hasOpenAI) providers.push(openaiCall);
      if (hasGemini) providers.push(geminiCall);
    } else if (primaryProvider === "gemini") {
      if (hasGemini) providers.push(geminiCall);
      if (hasOpenAI) providers.push(openaiCall);
    } else {
      // auto: prefer gemini (usually free tier), fallback to openai
      if (hasGemini) providers.push(geminiCall);
      if (hasOpenAI) providers.push(openaiCall);
    }

    let lastError: any = null;

    for (let i = 0; i < providers.length; i++) {
      try {
        const result = await providers[i]();
        return new Response(
          JSON.stringify({
            content: result.content,
            provider: result.provider,
            model: result.model,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err: any) {
        lastError = err;
        const status = err.status ?? 0;
        const errorBody = err.errorBody ?? err.message ?? "";

        console.error(
          `[ai-chat] Provider ${i} failed: HTTP ${status} - ${String(errorBody).slice(0, 200)}`,
        );

        // Non-retryable: don't try fallback
        if (isNonRetryableError(status, String(errorBody))) {
          return new Response(
            JSON.stringify({
              error:
                "A requisição foi bloqueada por políticas de segurança ou erro de autenticação.",
              provider_error: true,
            }),
            {
              status: status === 401 || status === 403 ? status : 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Retryable: try next provider
        if (isRetryableError(status, String(errorBody)) && i < providers.length - 1) {
          console.warn(`[ai-chat] Retryable error, trying fallback provider...`);
          continue;
        }

        // Not retryable and no more providers
        break;
      }
    }

    // All providers failed
    const errMsg = lastError?.message ?? "Erro desconhecido";
    return new Response(
      JSON.stringify({
        error: "Nenhum provedor de IA conseguiu responder. Tente novamente em instantes.",
        retryable: true,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-chat] Unhandled error:", err.message);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
