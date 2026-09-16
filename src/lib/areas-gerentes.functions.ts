import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    return {
      ok: true,
      postos: (postos ?? []).map((p) => ({
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
