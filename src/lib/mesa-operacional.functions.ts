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

    return {
      ok: true,
      data: dia,
      postos: (postos ?? []).map((p) => {
        const c = mapa.get(p.id);
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
        };
      }),
    };
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
