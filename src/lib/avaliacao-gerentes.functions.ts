import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AvaliacaoGerente = {
  id: string;
  gerente_nome: string;
  mes_referencia: string;
  nota_lideranca: number;
  nota_operacao: number;
  nota_comunicacao: number;
  nota_prazos: number;
  nota_cliente: number;
  pontos_fortes: string | null;
  pontos_melhoria: string | null;
  observacoes: string | null;
  avaliador_nome: string | null;
  created_at: string;
};

export type ListarAvaliacoesResultado = {
  ok: boolean;
  avaliacoes: AvaliacaoGerente[];
  erro?: string;
};

export type SalvarAvaliacaoResultado = { ok: boolean; id?: string; erro?: string };

const CAMPOS =
  "id, gerente_nome, mes_referencia, nota_lideranca, nota_operacao, nota_comunicacao, nota_prazos, nota_cliente, pontos_fortes, pontos_melhoria, observacoes, avaliador_nome, created_at";

const nota = z.number().int().min(1).max(5);

const salvarSchema = z.object({
  gerenteNome: z.string(),
  mesReferencia: z.string(),
  notaLideranca: nota,
  notaOperacao: nota,
  notaComunicacao: nota,
  notaPrazos: nota,
  notaCliente: nota,
  pontosFortes: z.string().optional(),
  pontosMelhoria: z.string().optional(),
  observacoes: z.string().optional(),
  avaliadorNome: z.string().optional(),
  /** Tempo gasto para preencher a ficha, em segundos. */
  duracaoSegundos: z.number().int().min(0).max(86400).nullable().optional(),
});

export const listarAvaliacoesGerentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListarAvaliacoesResultado> => {
    const { data, error } = await context.supabase
      .from("avaliacoes_gerentes_area")
      .select(CAMPOS)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return { ok: false, avaliacoes: [], erro: error.message };
    return { ok: true, avaliacoes: (data ?? []) as AvaliacaoGerente[] };
  });

export const salvarAvaliacaoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => salvarSchema.parse(data))
  .handler(async ({ context, data }): Promise<SalvarAvaliacaoResultado> => {
    const gerenteNome = data.gerenteNome.trim();
    const mesReferencia = data.mesReferencia.trim();
    if (!gerenteNome || !mesReferencia) {
      return { ok: false, erro: "Selecione o gerente e o mês de referência." };
    }

    const { data: criada, error } = await context.supabase
      .from("avaliacoes_gerentes_area")
      .insert({
        gerente_nome: gerenteNome,
        mes_referencia: mesReferencia,
        nota_lideranca: data.notaLideranca,
        nota_operacao: data.notaOperacao,
        nota_comunicacao: data.notaComunicacao,
        nota_prazos: data.notaPrazos,
        nota_cliente: data.notaCliente,
        pontos_fortes: data.pontosFortes?.trim() || null,
        pontos_melhoria: data.pontosMelhoria?.trim() || null,
        observacoes: data.observacoes?.trim() || null,
        avaliador_nome: data.avaliadorNome?.trim() || null,
        duracao_segundos: data.duracaoSegundos ?? null,
        avaliador_id: context.userId,
      })
      .select("id")
      .single();

    if (error) return { ok: false, erro: error.message };
    return { ok: true, id: criada?.id };
  });

export const removerAvaliacaoGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }): Promise<SalvarAvaliacaoResultado> => {
    const { error } = await context.supabase
      .from("avaliacoes_gerentes_area")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });
