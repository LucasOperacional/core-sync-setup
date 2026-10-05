import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehPostoNoturno, gerentePodeVerNoturno } from "@/lib/postos-noturnos.functions";

export type PostoDoGerente = {
  id: string;
  gerente_nome: string;
  posto_nome: string;
  posto_localidade: string | null;
  created_at: string;
};

export type ListarPostosResultado = {
  ok: boolean;
  postos: PostoDoGerente[];
  erro?: string;
};

export type GerenciarPostoResultado = {
  ok: boolean;
  id?: string;
  erro?: string;
};

const listarSchema = z.object({ nome: z.string() });
const adicionarSchema = z.object({
  gerenteNome: z.string(),
  postoNome: z.string(),
  postoLocalidade: z.string().optional(),
});
const removerSchema = z.object({ id: z.string() });

export type PostoNexti = {
  nexti_id: number;
  nome: string;
  localidade: string | null;
  cliente: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean | null;
};

export type BuscarPostosNextiResultado = {
  ok: boolean;
  postos: PostoNexti[];
  total: number;
  erro?: string;
};

const buscarNextiSchema = z.object({
  termo: z.string().optional().default(""),
  limite: z.number().int().min(1).max(200).optional().default(50),
});

/** Busca os postos importados da NEXTI por nome, cliente, cidade, UF ou centro de custo. */
export const buscarPostosNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => buscarNextiSchema.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<BuscarPostosNextiResultado> => {
    const termo = data.termo.trim();

    let query = context.supabase
      .from("nexti_workplaces")
      .select("nexti_id, name, client_name, city, state, cost_center, department, active", {
        count: "exact",
      })
      .order("name", { ascending: true })
      .limit(data.limite);

    if (termo) {
      const alvo = `%${termo.replace(/[%,]/g, " ")}%`;
      query = query.or(
        [
          `name.ilike.${alvo}`,
          `client_name.ilike.${alvo}`,
          `city.ilike.${alvo}`,
          `state.ilike.${alvo}`,
          `cost_center.ilike.${alvo}`,
          `department.ilike.${alvo}`,
        ].join(","),
      );
    }

    const { data: linhas, error, count } = await query;
    if (error) {
      return { ok: false, postos: [], total: 0, erro: error.message };
    }

    const postos = (linhas ?? []).map((p) => {
      const partes = [p.city, p.state].filter(Boolean).join(" / ");
      return {
        nexti_id: p.nexti_id,
        nome: p.name ?? `Posto ${p.nexti_id}`,
        localidade: [partes || null, p.client_name].filter(Boolean).join(" · ") || null,
        cliente: p.client_name,
        cidade: p.city,
        estado: p.state,
        ativo: p.active,
      };
    });

    return { ok: true, postos, total: count ?? postos.length };
  });

/** Lista os postos atribuídos em massa de TODOS os gerentes de uma vez (para os cards de resumo). */
export const listarPostosDeTodosGerentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("areas_gerentes_postos")
      .select("id, gerente_nome, posto_nome, posto_localidade, created_at")
      .order("posto_nome", { ascending: true });
    if (error) return { ok: false as const, gerentes: [] as { nome: string; postos: { id: string; posto_nome: string; posto_localidade: string | null }[] }[], erro: error.message };
    const porGerente = new Map<string, { id: string; posto_nome: string; posto_localidade: string | null }[]>();
    for (const p of data ?? []) {
      const lista = porGerente.get(p.gerente_nome) ?? [];
      lista.push({ id: p.id, posto_nome: p.posto_nome, posto_localidade: p.posto_localidade });
      porGerente.set(p.gerente_nome, lista);
    }
    const gerentes = [...porGerente.entries()]
      .map(([nome, postos]) => ({ nome, postos }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return { ok: true as const, gerentes };
  });

export const listarPostosDoGerente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listarSchema.parse(data))
  .handler(async ({ context, data }): Promise<ListarPostosResultado> => {
    const nome = data.nome.trim();
    if (!nome) {
      return { ok: false, postos: [], erro: "Nome do gerente é obrigatório." };
    }

    const { data: postos, error } = await context.supabase
      .from("areas_gerentes_postos")
      .select("id, gerente_nome, posto_nome, posto_localidade, created_at")
      .eq("gerente_nome", nome)
      .order("posto_nome", { ascending: true });

    if (error) {
      return { ok: false, postos: [], erro: error.message };
    }

    // REGRA: postos "noturno" só aparecem para Israel, Adarmisson e Gabriel Mendanha.
    const podeVerNoturno = gerentePodeVerNoturno(nome);
    const visiveis = (postos ?? []).filter(
      (p) => podeVerNoturno || !ehPostoNoturno(p.posto_nome),
    );

    return {
      ok: true,
      postos: visiveis.map((p) => ({
        id: p.id,
        gerente_nome: p.gerente_nome,
        posto_nome: p.posto_nome,
        posto_localidade: p.posto_localidade,
        created_at: p.created_at,
      })),
    };
  });

export const adicionarPostoAoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => adicionarSchema.parse(data))
  .handler(async ({ context, data }): Promise<GerenciarPostoResultado> => {
    const gerenteNome = data.gerenteNome.trim();
    const postoNome = data.postoNome.trim();
    const postoLocalidade = data.postoLocalidade?.trim() || null;

    if (!gerenteNome || !postoNome) {
      return { ok: false, erro: "Gerente e nome do posto são obrigatórios." };
    }

    const { data: posto, error } = await context.supabase
      .from("areas_gerentes_postos")
      .insert({
        gerente_nome: gerenteNome,
        posto_nome: postoNome,
        posto_localidade: postoLocalidade,
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, erro: error.message };
    }

    return { ok: true, id: posto?.id };
  });

export const removerPostoDoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => removerSchema.parse(data))
  .handler(async ({ context, data }): Promise<GerenciarPostoResultado> => {
    const { error } = await context.supabase
      .from("areas_gerentes_postos")
      .delete()
      .eq("id", data.id);

    if (error) {
      return { ok: false, erro: error.message };
    }

    return { ok: true };
  });

const renomearSchema = z.object({
  id: z.string().uuid(),
  postoNome: z.string().min(1),
});

/**
 * Renomeia um posto já salvo na lista de um gerente, sem mexer nos demais.
 */
export const renomearPostoDoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => renomearSchema.parse(data))
  .handler(async ({ context, data }): Promise<GerenciarPostoResultado> => {
    const nome = data.postoNome.trim();
    if (!nome) return { ok: false, erro: "Informe o novo nome do posto." };

    const { error } = await context.supabase
      .from("areas_gerentes_postos")
      .update({ posto_nome: nome })
      .eq("id", data.id);

    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

const definirSchema = z.object({
  gerenteNome: z.string().min(1),
  postos: z
    .array(z.object({ nome: z.string().min(1), localidade: z.string().nullable().optional() }))
    .max(2000),
});

/**
 * Substitui a lista inteira de postos de um gerente de área pela lista enviada.
 * Depois disso, o gerente passa a ver somente esses postos.
 */
export const definirPostosDoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => definirSchema.parse(data))
  .handler(async ({ context, data }): Promise<GerenciarPostoResultado & { total?: number }> => {
    const gerenteNome = data.gerenteNome.trim();
    const vistos = new Set<string>();
    const linhas = data.postos
      .map((p) => ({ nome: p.nome.trim(), localidade: p.localidade?.trim() || null }))
      .filter((p) => {
        const k = p.nome.toUpperCase();
        if (!p.nome || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });

    const { error: delErr } = await context.supabase
      .from("areas_gerentes_postos")
      .delete()
      .eq("gerente_nome", gerenteNome);
    if (delErr) return { ok: false, erro: delErr.message };

    if (linhas.length) {
      const { error } = await context.supabase.from("areas_gerentes_postos").insert(
        linhas.map((p) => ({
          gerente_nome: gerenteNome,
          posto_nome: p.nome,
          posto_localidade: p.localidade,
        })),
      );
      if (error) return { ok: false, erro: error.message };
    }
    return { ok: true, total: linhas.length };
  });

// ---------------------------------------------------------------------------
// Verificação dos nomes de postos contra a NEXTI
// ---------------------------------------------------------------------------

const normNexti = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();

export type PostoNextiAchado = {
  digitado: string;
  nexti_id: number;
  nome: string;
  cliente: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean | null;
  localidade: string | null;
};

type LinhaWp = { nexti_id: number; name: string | null; client_name: string | null; city: string | null; state: string | null; active: boolean | null };

function casarNomes(nomes: string[], wps: LinhaWp[]): Map<string, PostoNextiAchado> {
  const lista = wps
    .filter((w) => w.name)
    .map((w) => ({ w, k: normNexti(w.name!) }))
    // ativos primeiro
    .sort((a, b) => Number(b.w.active !== false) - Number(a.w.active !== false));
  const exato = new Map<string, LinhaWp>();
  for (const { w, k } of lista) if (!exato.has(k)) exato.set(k, w);
  const out = new Map<string, PostoNextiAchado>();
  for (const digitado of nomes) {
    const k = normNexti(digitado);
    if (!k) continue;
    let w = exato.get(k);
    if (!w && k.length >= 4) {
      const cands = lista.filter((x) => x.k.includes(k) || (k.includes(x.k) && x.k.length >= 6));
      if (cands.length === 1 || (cands.length > 1 && cands[0]!.w.active !== false && cands.filter((c) => c.w.active !== false).length === 1)) {
        w = cands[0]!.w;
      }
    }
    if (!w) continue;
    const partes = [w.city, w.state].filter(Boolean).join(" / ");
    out.set(digitado, {
      digitado,
      nexti_id: w.nexti_id,
      nome: w.name!,
      cliente: w.client_name,
      cidade: w.city,
      estado: w.state,
      ativo: w.active,
      localidade: [partes || null, w.client_name].filter(Boolean).join(" · ") || null,
    });
  }
  return out;
}

async function carregarWorkplaces(supabase: { from: (t: string) => any }): Promise<LinhaWp[]> {
  const todos: LinhaWp[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("nexti_workplaces")
      .select("nexti_id, name, client_name, city, state, active")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    todos.push(...((data ?? []) as LinhaWp[]));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

/** Verifica uma lista de nomes digitados e devolve o posto correspondente da NEXTI. */
export const verificarNomesPostosNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ nomes: z.array(z.string().max(300)).max(2000) }).parse(data))
  .handler(async ({ context, data }) => {
    try {
      const wps = await carregarWorkplaces(context.supabase as never);
      const m = casarNomes(data.nomes, wps);
      return { ok: true as const, achados: [...m.values()] };
    } catch (e) {
      return { ok: false as const, achados: [] as PostoNextiAchado[], erro: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Atualiza os postos de todos os cards dos gerentes com as informações da NEXTI
 * (nome oficial, cliente, cidade/UF). Não remove nenhum posto.
 */
export const atualizarCardsGerentesComNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data: linhas, error } = await context.supabase
        .from("areas_gerentes_postos")
        .select("id, posto_nome, posto_localidade");
      if (error) throw new Error(error.message);
      const wps = await carregarWorkplaces(context.supabase as never);
      const m = casarNomes((linhas ?? []).map((l) => l.posto_nome), wps);
      let atualizados = 0;
      let naoEncontrados = 0;
      for (const l of linhas ?? []) {
        const a = m.get(l.posto_nome);
        if (!a) { naoEncontrados++; continue; }
        if (a.nome === l.posto_nome && a.localidade === l.posto_localidade) continue;
        const { error: e } = await context.supabase
          .from("areas_gerentes_postos")
          .update({ posto_nome: a.nome, posto_localidade: a.localidade })
          .eq("id", l.id);
        if (!e) atualizados++;
      }
      return { ok: true as const, total: linhas?.length ?? 0, atualizados, naoEncontrados };
    } catch (e) {
      return { ok: false as const, total: 0, atualizados: 0, naoEncontrados: 0, erro: e instanceof Error ? e.message : String(e) };
    }
  });
