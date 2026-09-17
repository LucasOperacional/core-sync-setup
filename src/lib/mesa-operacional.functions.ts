import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostoServicoMesa = {
  id: string;
  nome: string;
  gerenteNome: string;
  localidade: string | null;
  cliente: string | null;
  ativo: boolean;
  /** Check-in do dia consultado (quando existir). */
  checkFeito: boolean;
  checkObservacao: string | null;
  checkEm: string | null;
  /** Relatório do dia consultado (quando existir). */
  relatorio: string | null;
  relatorioEm: string | null;
};

export type ListarMesaResultado = {
  ok: boolean;
  data: string;
  postos: PostoServicoMesa[];
  erro?: string;
};

export type MesaResultado = { ok: boolean; id?: string; erro?: string };

const dataSchema = z.object({ data: z.string().optional() });

const criarSchema = z.object({
  nome: z.string().min(2),
  gerenteNome: z.string().min(2),
  localidade: z.string().optional(),
  cliente: z.string().optional(),
});

const removerSchema = z.object({ id: z.string().uuid() });

const checkSchema = z.object({
  postoId: z.string().uuid(),
  data: z.string(),
  feito: z.boolean(),
  observacao: z.string().optional(),
});

/** Data de hoje no fuso de Brasília, no formato AAAA-MM-DD. */
export function hojeBrasilia(): string {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(agora);
}

export const listarPostosMesa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => dataSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<ListarMesaResultado> => {
    const dia = data.data && /^\d{4}-\d{2}-\d{2}$/.test(data.data) ? data.data : hojeBrasilia();

    const { data: postos, error } = await context.supabase
      .from("mesa_postos_servico")
      .select("id, nome, gerente_nome, localidade, cliente, ativo")
      .order("gerente_nome", { ascending: true })
      .order("nome", { ascending: true });

    if (error) return { ok: false, data: dia, postos: [], erro: error.message };

    const { data: checks } = await context.supabase
      .from("mesa_checkins")
      .select("posto_id, feito, observacao, registrado_em")
      .eq("data", dia);

    const mapa = new Map((checks ?? []).map((c) => [c.posto_id, c]));

    const { data: relatorios } = await context.supabase
      .from("mesa_relatorios")
      .select("posto_id, relatorio, registrado_em")
      .eq("data", dia);

    const mapaRel = new Map((relatorios ?? []).map((r) => [r.posto_id, r]));

    return {
      ok: true,
      data: dia,
      postos: (postos ?? []).map((p) => {
        const c = mapa.get(p.id);
        const r = mapaRel.get(p.id);
        return {
          id: p.id,
          nome: p.nome,
          gerenteNome: p.gerente_nome,
          localidade: p.localidade,
          cliente: p.cliente,
          ativo: p.ativo ?? true,
          checkFeito: c?.feito ?? false,
          checkObservacao: c?.observacao ?? null,
          checkEm: c?.registrado_em ?? null,
          relatorio: r?.relatorio ?? null,
          relatorioEm: r?.registrado_em ?? null,
        };
      }),
    };
  });

const relatorioSchema = z.object({
  postoId: z.string().uuid(),
  data: z.string(),
  relatorio: z.string().min(1).max(5000),
});

/** Salva (ou atualiza) o relatório do posto na data, registrando data e hora. */
export const salvarRelatorioMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => relatorioSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase.from("mesa_relatorios").upsert(
      {
        posto_id: data.postoId,
        data: data.data,
        relatorio: data.relatorio.trim(),
        registrado_por: context.userId,
        registrado_em: new Date().toISOString(),
      },
      { onConflict: "posto_id,data" },
    );
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

export const cadastrarPostoMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => criarSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { data: criado, error } = await context.supabase
      .from("mesa_postos_servico")
      .insert({
        nome: data.nome.trim(),
        gerente_nome: data.gerenteNome.trim(),
        localidade: data.localidade?.trim() || null,
        cliente: data.cliente?.trim() || null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) {
      const duplicado = error.code === "23505";
      return {
        ok: false,
        erro: duplicado ? "Este posto já está cadastrado para esse gerente." : error.message,
      };
    }
    return { ok: true, id: criado?.id };
  });

export const removerPostoMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removerSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_postos_servico")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

const removerTodosSchema = z.object({ gerenteNome: z.string().min(2) });

export const removerTodosPostosMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removerTodosSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_postos_servico")
      .delete()
      .eq("gerente_nome", data.gerenteNome.trim());
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

export const registrarCheckinMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase.from("mesa_checkins").upsert(
      {
        posto_id: data.postoId,
        data: data.data,
        feito: data.feito,
        observacao: data.observacao?.trim() || null,
        registrado_por: context.userId,
        registrado_em: new Date().toISOString(),
      },
      { onConflict: "posto_id,data" },
    );
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Postos vindos direto da API da NEXTI (para o campo "Nome do posto")
// ---------------------------------------------------------------------------

export type PostoNexti = {
  nextiId: number | null;
  nome: string;
  cliente: string | null;
  localidade: string | null;
};

export type PostosNextiResultado = { ok: boolean; postos: PostoNexti[]; erro?: string };

type RecNexti = Record<string, unknown>;

function ehRec(v: unknown): v is RecNexti {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escolher(obj: RecNexti, chaves: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const k of chaves) {
    const real = lower.get(k.toLowerCase());
    if (!real) continue;
    const valor = obj[real];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

function texto(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (ehRec(v)) {
    const nome = escolher(v, ["name", "nome", "description", "fantasyName"]);
    if (typeof nome === "string") return nome.trim() || null;
  }
  return null;
}

function listaDoPayload(payload: unknown): RecNexti[] {
  if (Array.isArray(payload)) return payload.filter(ehRec);
  if (!ehRec(payload)) return [];
  for (const k of ["content", "data", "items", "list", "records", "result", "results", "rows"]) {
    const v = payload[k];
    if (Array.isArray(v)) return v.filter(ehRec);
    if (ehRec(v)) {
      const aninhado = listaDoPayload(v);
      if (aninhado.length > 0) return aninhado;
    }
  }
  return [];
}

/** Lê os postos de serviço direto da API da NEXTI (com fallback no cache local). */
export const buscarPostosNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostosNextiResultado> => {
    const ctx = context as { supabase: any };
    const encontrados = new Map<string, PostoNexti>();

    const guardar = (p: PostoNexti) => {
      const chave = p.nome.toLowerCase();
      if (!chave || encontrados.has(chave)) return;
      encontrados.set(chave, p);
    };

    let erro: string | undefined;

    try {
      const { loadConfig, normalizeBaseUrl, requestNexti } = await import("@/lib/nexti.functions");
      const bruta = await loadConfig(ctx.supabase);
      const config = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };

      const endpoints = ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"];
      for (const endpoint of endpoints) {
        try {
          const coletados: RecNexti[] = [];
          for (let page = 0; page < 40; page++) {
            const resposta = await requestNexti({
              config,
              endpoint,
              method: "GET",
              query: { page, size: 200 },
            });
            const lista = listaDoPayload(resposta.data);
            if (lista.length === 0) break;
            coletados.push(...lista);
            if (lista.length < 200) break;
          }
          if (coletados.length === 0) continue;
          for (const item of coletados) {
            const nome = texto(escolher(item, ["name", "nome", "description", "workplaceName"]));
            if (!nome) continue;
            const idBruto = escolher(item, ["id", "nextiId", "workplaceId", "code"]);
            const id = Number(idBruto);
            const cidade = texto(escolher(item, ["city", "cidade"]));
            const uf = texto(escolher(item, ["state", "uf", "estado"]));
            guardar({
              nextiId: Number.isFinite(id) ? id : null,
              nome,
              cliente: texto(escolher(item, ["clientName", "cliente", "customerName"])),
              localidade: [cidade, uf].filter(Boolean).join(" / ") || null,
            });
          }
          break;
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    if (encontrados.size === 0) {
      const { data: cache } = await ctx.supabase
        .from("nexti_workplaces")
        .select("nexti_id, name, city, state")
        .order("name", { ascending: true })
        .limit(5000);
      for (const p of (cache ?? []) as RecNexti[]) {
        const nome = texto(p["name"]);
        if (!nome) continue;
        const cidade = texto(p["city"]);
        const uf = texto(p["state"]);
        guardar({
          nextiId: Number(p["nexti_id"]) || null,
          nome,
          cliente: null,
          localidade: [cidade, uf].filter(Boolean).join(" / ") || null,
        });
      }
    }

    const postos = [...encontrados.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (postos.length > 0) return { ok: true, postos };
    return erro ? { ok: false, postos, erro } : { ok: false, postos };
  });

// ---------------------------------------------------------------------------
// Importação em lote de postos
// ---------------------------------------------------------------------------

export type ImportarLoteResultado = {
  ok: boolean;
  criados: number;
  repetidos: number;
  falhas: number;
  erro?: string;
};

const loteSchema = z.object({
  postos: z
    .array(
      z.object({
        nome: z.string().min(2),
        gerenteNome: z.string().min(2),
        localidade: z.string().optional(),
        cliente: z.string().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/** Cadastra vários postos de uma vez, já vinculados ao gerente de área. */
export const importarPostosMesaLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => loteSchema.parse(input))
  .handler(async ({ context, data }): Promise<ImportarLoteResultado> => {
    const vistos = new Set<string>();
    const linhas = data.postos
      .map((p) => ({
        nome: p.nome.trim(),
        gerente_nome: p.gerenteNome.trim(),
        localidade: p.localidade?.trim() || null,
        cliente: p.cliente?.trim() || null,
        created_by: context.userId,
      }))
      .filter((p) => {
        const chave = `${p.nome.toLowerCase()}|${p.gerente_nome.toLowerCase()}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });

    const { data: existentes } = await context.supabase
      .from("mesa_postos_servico")
      .select("nome, gerente_nome");
    const jaTem = new Set(
      (existentes ?? []).map(
        (e: { nome: string; gerente_nome: string }) =>
          `${e.nome.toLowerCase()}|${e.gerente_nome.toLowerCase()}`,
      ),
    );

    const novos = linhas.filter(
      (p) => !jaTem.has(`${p.nome.toLowerCase()}|${p.gerente_nome.toLowerCase()}`),
    );
    const repetidos = linhas.length - novos.length;

    let criados = 0;
    let falhas = 0;
    let ultimoErro: string | undefined;

    for (let i = 0; i < novos.length; i += 200) {
      const bloco = novos.slice(i, i + 200);
      const { data: inseridos, error } = await context.supabase
        .from("mesa_postos_servico")
        .insert(bloco)
        .select("id");
      if (error) {
        falhas += bloco.length;
        ultimoErro = error.message;
        continue;
      }
      criados += inseridos?.length ?? bloco.length;
    }

    if (criados === 0 && ultimoErro) {
      return { ok: false, criados, repetidos, falhas, erro: ultimoErro };
    }
    return { ok: true, criados, repetidos, falhas };
  });
