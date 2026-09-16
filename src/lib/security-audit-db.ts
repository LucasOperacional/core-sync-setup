/**
 * Security Audit Log — Persistência no Supabase.
 */

import { supabase } from "@/integrations/supabase/client";
import { sanitizeForLog, sanitizeText } from "./privacy/redaction";

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  event_type: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  requires_admin_approval: boolean;
  admin_approved: boolean | null;
  allows_rollback: boolean;
  rolled_back: boolean;
  created_at: string;
}

export async function insertAuditLog(params: {
  event_type: string;
  severity: string;
  description: string;
  metadata?: Record<string, unknown>;
  requires_admin_approval?: boolean;
  allows_rollback?: boolean;
}): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    await (supabase.from("security_audit_log" as never) as any).insert({
      user_id: userId,
      event_type: params.event_type,
      severity: params.severity,
      description: sanitizeText(params.description, 500),
      metadata: sanitizeForLog(params.metadata ?? {}) as Record<string, unknown>,
      requires_admin_approval: params.requires_admin_approval ?? false,
      allows_rollback: params.allows_rollback ?? false,
    } as never);
  } catch {
    // Table may not exist yet — silently ignore
  }
}

export async function fetchAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await (supabase.from("security_audit_log" as never) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as AuditLogEntry[];
  } catch {
    return [];
  }
}

export async function approveAuditEntry(id: string): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;
    await (supabase.from("security_audit_log" as never) as any)
      .update({
        admin_approved: true,
        admin_approved_by: userId,
        admin_approved_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
  } catch {
    // silently ignore
  }
}

export async function rollbackAuditEntry(id: string): Promise<void> {
  try {
    await (supabase.from("security_audit_log" as never) as any)
      .update({
        rolled_back: true,
        rolled_back_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
  } catch {
    // silently ignore
  }
}
