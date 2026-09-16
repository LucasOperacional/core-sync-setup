/**
 * Escudo de Segurança — funções de servidor da IA de Segurança.
 *
 * Responsabilidades:
 *  - Limitar rajadas de chamadas por usuário/recurso (anti-abuso / anti-DDoS)
 *  - Bloquear temporariamente identidades abusivas
 *  - Registrar cada chamada de API protegida (sucesso, falha, bloqueio)
 *  - Fornecer o panorama consolidado para o painel
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeForLog, sanitizeText } from "./privacy/redaction";

export type GuardDecision = {
  allowed: boolean;
  blocked: boolean;
  reason: string | null;
  retryAfterSeconds: number;
  count: number;
  limit: number;
};

export type ApiEventInput = {
  cardKey: string;
  resource: string;
  outcome: "success" | "error" | "blocked" | "timeout" | "retry";
  httpStatus?: number | null;
  latencyMs?: number | null;
  message?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
};

export type ApiEvent = {
  id: string;
  cardKey: string;
  resource: string;
  outcome: string;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string | null;
  severity: string;
  createdAt: string;
};

export type BlockedIdentity = {
  id: string;
  identity: string;
  reason: string;
  severity: string;
  blockedUntil: string;
};

export type RateWindow = {
  identity: string;
  resource: string;
  requestCount: number;
  windowStart: string;
};

export type ShieldOverview = {
  isAdmin: boolean;
  totals: {
    events24h: number;
    errors24h: number;
    blocked24h: number;
    success24h: number;
    avgLatencyMs: number;
    activeBlocks: number;
  };
  perCard: Array<{
    cardKey: string;
    total: number;
    errors: number;
    blocked: number;
    avgLatencyMs: number;
  }>;
  recentEvents: ApiEvent[];
  blocklist: BlockedIdentity[];
  rateWindows: RateWindow[];
};

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_SECONDS = 60;

function sanitize(value: string, max = 80): string {
  return value.replace(/[^\w.:/-]+/g, "_").slice(0, max);
}

/** Verifica limite de chamadas antes de executar uma operação sensível. */
export const guardApiCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { resource: string; limit?: number; windowSeconds?: number }) => {
    if (!input?.resource) throw new Error("Recurso inválido.");
    return {
      resource: sanitize(input.resource),
      limit: Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 600),
      windowSeconds: Math.min(Math.max(input.windowSeconds ?? DEFAULT_WINDOW_SECONDS, 5), 3600),
    };
  })
  .handler(async ({ data, context }): Promise<GuardDecision> => {
    const { userId } = context;
    // Verificação de limite executada apenas pelo servidor.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc(
      "security_check_rate_limit" as never,
      {
        _identity: `user:${userId}`,
        _resource: data.resource,
        _limit: data.limit,
        _window_seconds: data.windowSeconds,
      } as never,
    );

    if (error) {
      // Falha do escudo nunca deve derrubar a operação do usuário — segue liberado e registrado.
      return {
        allowed: true,
        blocked: false,
        reason: `Escudo indisponível: ${error.message}`,
        retryAfterSeconds: 0,
        count: 0,
        limit: data.limit,
      };
    }

    const r = (result ?? {}) as Record<string, unknown>;
    return {
      allowed: r["allowed"] !== false,
      blocked: r["blocked"] === true,
      reason: (r["reason"] as string) ?? null,
      retryAfterSeconds: Number(r["retry_after_seconds"] ?? 0),
      count: Number(r["count"] ?? 0),
      limit: Number(r["limit"] ?? data.limit),
    };
  });

/** Registra o resultado de uma chamada de API protegida. */
export const registrarEventoApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApiEventInput) => {
    if (!input?.cardKey || !input?.resource || !input?.outcome) {
      throw new Error("Evento inválido.");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("security_api_events" as never).insert({
      user_id: userId,
      card_key: sanitize(data.cardKey),
      resource: sanitize(data.resource, 120),
      outcome: data.outcome,
      http_status: data.httpStatus ?? null,
      latency_ms: data.latencyMs ?? null,
      message: data.message ? sanitizeText(data.message, 500) : null,
      severity: data.severity ?? (data.outcome === "success" ? "low" : "medium"),
      metadata: sanitizeForLog(data.metadata ?? {}) as Record<string, unknown>,
    } as never);
    return { ok: !error };
  });

/** Panorama consolidado do escudo (admins veem tudo; demais veem os próprios eventos). */
export const getShieldOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShieldOverview> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: isAdminRaw } = await supabase.rpc(
      "has_role" as never,
      {
        _user_id: userId,
        _role: "admin",
      } as never,
    );
    const isAdmin = isAdminRaw === true;

    const { data: eventsRaw } = await supabase
      .from("security_api_events" as never)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const events = ((eventsRaw ?? []) as Array<Record<string, any>>).map((e) => ({
      id: String(e["id"]),
      cardKey: String(e["card_key"]),
      resource: String(e["resource"]),
      outcome: String(e["outcome"]),
      httpStatus: e["http_status"] ?? null,
      latencyMs: e["latency_ms"] ?? null,
      message: e["message"] ?? null,
      severity: String(e["severity"] ?? "low"),
      createdAt: String(e["created_at"]),
    })) as ApiEvent[];

    let blocklist: BlockedIdentity[] = [];
    let rateWindows: RateWindow[] = [];

    if (isAdmin) {
      const [{ data: blocks }, { data: windows }] = await Promise.all([
        supabase
          .from("security_blocklist" as never)
          .select("*")
          .gte("blocked_until", new Date().toISOString())
          .order("blocked_until", { ascending: false })
          .limit(100),
        supabase
          .from("security_rate_limits" as never)
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);

      blocklist = ((blocks ?? []) as Array<Record<string, any>>).map((b) => ({
        id: String(b["id"]),
        identity: String(b["identity"]),
        reason: String(b["reason"]),
        severity: String(b["severity"] ?? "high"),
        blockedUntil: String(b["blocked_until"]),
      }));

      rateWindows = ((windows ?? []) as Array<Record<string, any>>).map((w) => ({
        identity: String(w["identity"]),
        resource: String(w["resource"]),
        requestCount: Number(w["request_count"] ?? 0),
        windowStart: String(w["window_start"]),
      }));
    }

    const latencies = events
      .map((e) => e.latencyMs)
      .filter((l): l is number => typeof l === "number");
    const perCardMap = new Map<
      string,
      { total: number; errors: number; blocked: number; latSum: number; latN: number }
    >();
    for (const e of events) {
      const entry = perCardMap.get(e.cardKey) ?? {
        total: 0,
        errors: 0,
        blocked: 0,
        latSum: 0,
        latN: 0,
      };
      entry.total += 1;
      if (e.outcome === "error" || e.outcome === "timeout") entry.errors += 1;
      if (e.outcome === "blocked") entry.blocked += 1;
      if (typeof e.latencyMs === "number") {
        entry.latSum += e.latencyMs;
        entry.latN += 1;
      }
      perCardMap.set(e.cardKey, entry);
    }

    return {
      isAdmin,
      totals: {
        events24h: events.length,
        errors24h: events.filter((e) => e.outcome === "error" || e.outcome === "timeout").length,
        blocked24h: events.filter((e) => e.outcome === "blocked").length,
        success24h: events.filter((e) => e.outcome === "success").length,
        avgLatencyMs: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
        activeBlocks: blocklist.length,
      },
      perCard: [...perCardMap.entries()]
        .map(([cardKey, v]) => ({
          cardKey,
          total: v.total,
          errors: v.errors,
          blocked: v.blocked,
          avgLatencyMs: v.latN ? Math.round(v.latSum / v.latN) : 0,
        }))
        .sort((a, b) => b.total - a.total),
      recentEvents: events.slice(0, 100),
      blocklist,
      rateWindows,
    };
  });

/** Remove um bloqueio ativo (somente admin). */
export const desbloquearIdentidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { identity: string }) => {
    if (!input?.identity) throw new Error("Identidade inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc(
      "has_role" as never,
      {
        _user_id: userId,
        _role: "admin",
      } as never,
    );
    if (isAdmin !== true) throw new Error("Apenas administradores podem remover bloqueios.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("security_blocklist" as never) as any)
      .delete()
      .eq("identity", data.identity);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
