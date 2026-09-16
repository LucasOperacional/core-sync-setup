/**
 * Personalização dos painéis por usuário (widgets).
 *
 * Cada painel (control, faltas, atestados) é montado por blocos ("widgets").
 * Cada usuário pode ocultar, reordenar e redimensionar seus blocos; a
 * preferência fica salva na conta (tabela `user_dashboard_layouts`) e também
 * em cache local para abrir instantaneamente.
 */

import { supabase } from "@/integrations/supabase/client";

export type WidgetTamanho = "pequeno" | "medio" | "grande";

export type WidgetEstado = {
  key: string;
  visivel: boolean;
  tamanho: WidgetTamanho;
};

export type DashboardKey = "control" | "faltas" | "atestados";

const TAMANHOS: WidgetTamanho[] = ["pequeno", "medio", "grande"];

export function proximoTamanho(t: WidgetTamanho): WidgetTamanho {
  const i = TAMANHOS.indexOf(t);
  return TAMANHOS[(i + 1) % TAMANHOS.length]!;
}

export function classeTamanho(t: WidgetTamanho): string {
  if (t === "pequeno") return "col-span-12 sm:col-span-6 xl:col-span-4";
  if (t === "medio") return "col-span-12 lg:col-span-6";
  return "col-span-12";
}

function chaveCache(dashboard: DashboardKey) {
  return `widgets-layout-${dashboard}-v1`;
}

function sanitizar(valor: unknown): WidgetEstado[] {
  if (!Array.isArray(valor)) return [];
  const out: WidgetEstado[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o["key"] !== "string" || !o["key"]) continue;
    const tamanho = TAMANHOS.includes(o["tamanho"] as WidgetTamanho)
      ? (o["tamanho"] as WidgetTamanho)
      : "medio";
    out.push({ key: o["key"], visivel: o["visivel"] !== false, tamanho });
  }
  return out;
}

export function lerCacheLayout(dashboard: DashboardKey): WidgetEstado[] {
  if (typeof window === "undefined") return [];
  try {
    return sanitizar(JSON.parse(localStorage.getItem(chaveCache(dashboard)) ?? "null"));
  } catch {
    return [];
  }
}

function gravarCacheLayout(dashboard: DashboardKey, estados: WidgetEstado[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(chaveCache(dashboard), JSON.stringify(estados));
  } catch {
    /* storage cheio */
  }
}

/** Lê o layout salvo na conta do usuário (com cache local como reserva). */
export async function carregarLayout(dashboard: DashboardKey): Promise<WidgetEstado[]> {
  try {
    const { data: sessao } = await supabase.auth.getUser();
    const userId = sessao.user?.id;
    if (!userId) return lerCacheLayout(dashboard);

    const { data, error } = await supabase
      .from("user_dashboard_layouts")
      .select("layout")
      .eq("user_id", userId)
      .eq("dashboard", dashboard)
      .maybeSingle();

    if (error || !data) return lerCacheLayout(dashboard);
    const estados = sanitizar(data.layout);
    gravarCacheLayout(dashboard, estados);
    return estados;
  } catch {
    return lerCacheLayout(dashboard);
  }
}

/** Salva o layout na conta do usuário. */
export async function salvarLayout(
  dashboard: DashboardKey,
  estados: WidgetEstado[],
): Promise<boolean> {
  gravarCacheLayout(dashboard, estados);
  try {
    const { data: sessao } = await supabase.auth.getUser();
    const userId = sessao.user?.id;
    if (!userId) return false;
    const { error } = await supabase
      .from("user_dashboard_layouts")
      .upsert(
        { user_id: userId, dashboard, layout: estados, updated_at: new Date().toISOString() },
        { onConflict: "user_id,dashboard" },
      );
    return !error;
  } catch {
    return false;
  }
}

/** Remove a personalização do usuário para o painel. */
export async function limparLayout(dashboard: DashboardKey): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(chaveCache(dashboard));
    } catch {
      /* ignore */
    }
  }
  try {
    const { data: sessao } = await supabase.auth.getUser();
    const userId = sessao.user?.id;
    if (!userId) return;
    await supabase
      .from("user_dashboard_layouts")
      .delete()
      .eq("user_id", userId)
      .eq("dashboard", dashboard);
  } catch {
    /* ignore */
  }
}

/** Combina os widgets disponíveis com a preferência salva. */
export function mesclarLayout(
  padrao: { key: string; tamanho: WidgetTamanho }[],
  salvo: WidgetEstado[],
): WidgetEstado[] {
  const disponiveis = new Map(padrao.map((p) => [p.key, p]));
  const resultado: WidgetEstado[] = [];
  const usados = new Set<string>();

  for (const estado of salvo) {
    const base = disponiveis.get(estado.key);
    if (!base || usados.has(estado.key)) continue;
    usados.add(estado.key);
    resultado.push({ key: estado.key, visivel: estado.visivel, tamanho: estado.tamanho });
  }
  for (const p of padrao) {
    if (usados.has(p.key)) continue;
    resultado.push({ key: p.key, visivel: true, tamanho: p.tamanho });
  }
  return resultado;
}
