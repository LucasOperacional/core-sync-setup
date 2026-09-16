/**
 * IA Operacional — Persistência no Supabase.
 *
 * Salva erros e ações de recuperação no banco para auditoria.
 * Falha silenciosamente se as tabelas ainda não existirem.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  ErrorSeverity,
  ErrorStatus,
  OperationalError,
  RecoveryAction,
} from "./operational-ai";

// ── Save error to DB ──
export async function saveOperationalError(error: OperationalError): Promise<void> {
  try {
    await supabase.from("operational_errors" as never).insert({
      id: error.id,
      timestamp: error.timestamp,
      user_id: error.userId ?? null,
      page: error.page,
      component: error.component ?? null,
      error_type: error.errorType,
      message: error.message,
      technical_details: error.technicalDetails ?? null,
      severity: error.severity,
      status: error.status,
      retry_count: error.retryCount,
    } as never);
  } catch {
    // Table may not exist yet — silently ignore
  }
}

// ── Save recovery action to DB ──
export async function saveRecoveryAction(action: RecoveryAction): Promise<void> {
  try {
    await supabase.from("recovery_actions" as never).insert({
      id: action.id,
      error_id: action.errorId,
      action: action.action,
      result: action.result,
      timestamp: action.timestamp,
      duration_ms: action.durationMs,
      automatic: action.automatic,
    } as never);
  } catch {
    // silently ignore
  }
}

// ── Fetch errors from DB ──
export async function fetchOperationalErrors(limit = 100): Promise<OperationalError[]> {
  try {
    const { data, error } = await (supabase.from("operational_errors" as never) as any)
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as any[]).map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      page: row.page,
      component: row.component,
      errorType: row.error_type,
      message: row.message,
      technicalDetails: row.technical_details,
      severity: row.severity as ErrorSeverity,
      status: row.status as ErrorStatus,
      retryCount: row.retry_count,
    }));
  } catch {
    return [];
  }
}

// ── Fetch recovery actions from DB ──
export async function fetchRecoveryActions(limit = 100): Promise<RecoveryAction[]> {
  try {
    const { data, error } = await (supabase.from("recovery_actions" as never) as any)
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as any[]).map((row: any) => ({
      id: row.id,
      errorId: row.error_id,
      action: row.action,
      result: row.result,
      timestamp: row.timestamp,
      durationMs: row.duration_ms,
      automatic: row.automatic,
    }));
  } catch {
    return [];
  }
}

// ── Stats for dashboard ──
export async function fetchDashboardStats(): Promise<{
  total24h: number;
  resolved24h: number;
  pending: number;
}> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const [totalRes, resolvedRes, pendingRes] = await Promise.all([
      (supabase.from("operational_errors" as never) as any)
        .select("id", { count: "exact", head: true })
        .gte("timestamp", cutoff),
      (supabase.from("operational_errors" as never) as any)
        .select("id", { count: "exact", head: true })
        .gte("timestamp", cutoff)
        .eq("status", "resolved"),
      (supabase.from("operational_errors" as never) as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["detected", "pending_review"]),
    ]);
    return {
      total24h: totalRes.count ?? 0,
      resolved24h: resolvedRes.count ?? 0,
      pending: pendingRes.count ?? 0,
    };
  } catch {
    return { total24h: 0, resolved24h: 0, pending: 0 };
  }
}

// ── Update error status in DB ──
export async function updateErrorStatus(id: string, status: ErrorStatus): Promise<void> {
  try {
    await (supabase.from("operational_errors" as never) as any)
      .update({ status } as never)
      .eq("id", id);
  } catch {
    // silently ignore
  }
}
