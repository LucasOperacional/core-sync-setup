import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";

export type TokenMonitoramento = {
  id: string;
  nome: string;
  prefixo: string;
  createdAt: string;
  lastUsedAt: string | null;
  totalRequisicoes: number;
  revogadoEm: string | null;
};

export type PingMonitoramento = {
  id: string;
  endpoint: string;
  status: number;
  duracaoMs: number | null;
  createdAt: string;
  tokenId: string | null;
};

/** SHA-256 em hexadecimal (Web Crypto, disponível no runtime do servidor). */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function gerarTokenBruto(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const corpo = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ciop_mon_${corpo}`;
}

export const listarTokensMonitoramento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TokenMonitoramento[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("monitoring_tokens")
      .select("id, nome, prefixo, created_at, last_used_at, total_requisicoes, revogado_em")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => ({
      id: t.id,
      nome: t.nome,
      prefixo: t.prefixo,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
      totalRequisicoes: t.total_requisicoes,
      revogadoEm: t.revogado_em,
    }));
  });

export const criarTokenMonitoramento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nome: string }) => {
    const nome = String(input?.nome ?? "").trim();
    if (nome.length < 2 || nome.length > 60) {
      throw new Error("Informe um nome entre 2 e 60 caracteres.");
    }
    return { nome };
  })
  .handler(async ({ data, context }): Promise<{ token: string; id: string }> => {
    await assertAdmin(context);
    const token = gerarTokenBruto();
    const tokenHash = await hashToken(token);
    const prefixo = token.slice(0, 17);

    const { data: row, error } = await context.supabase
      .from("monitoring_tokens")
      .insert({
        nome: data.nome,
        prefixo,
        token_hash: tokenHash,
        criado_por: context.userId,
      })
      .select("id")
      .single();

    if (error || !row) throw new Error(error?.message ?? "Falha ao criar o token.");
    // O token bruto só é exibido uma vez; o banco guarda apenas o hash.
    return { token, id: row.id };
  });

export const revogarTokenMonitoramento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = String(input?.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Token inválido.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("monitoring_tokens")
      .update({ revogado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirTokenMonitoramento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = String(input?.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Token inválido.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("monitoring_tokens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ResumoMonitoramento = {
  pings24h: number;
  erros24h: number;
  duracaoMediaMs: number | null;
  ultimoPing: string | null;
  tokensAtivos: number;
  recentes: PingMonitoramento[];
};

export const resumoMonitoramento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoMonitoramento> => {
    await assertAdmin(context);
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: pings }, { count: tokensAtivos }] = await Promise.all([
      context.supabase
        .from("monitoring_pings")
        .select("id, endpoint, status, duracao_ms, created_at, token_id")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(500),
      context.supabase
        .from("monitoring_tokens")
        .select("id", { count: "exact", head: true })
        .is("revogado_em", null),
    ]);

    const linhas = pings ?? [];
    const duracoes = linhas
      .map((p) => p.duracao_ms)
      .filter((d): d is number => typeof d === "number");

    return {
      pings24h: linhas.length,
      erros24h: linhas.filter((p) => p.status >= 400).length,
      duracaoMediaMs: duracoes.length
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
        : null,
      ultimoPing: linhas[0]?.created_at ?? null,
      tokensAtivos: tokensAtivos ?? 0,
      recentes: linhas.slice(0, 10).map((p) => ({
        id: p.id,
        endpoint: p.endpoint,
        status: p.status,
        duracaoMs: p.duracao_ms,
        createdAt: p.created_at,
        tokenId: p.token_id,
      })),
    };
  });
