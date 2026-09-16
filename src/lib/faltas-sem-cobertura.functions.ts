import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAprovadorVagas } from "./vagas-guard.server";

export type FaltaSemCobertura = {
  id: string;
  data: string;
  posto: string;
  nome: string;
  cargo: string;
  motivo: string;
  cobertura: string;
  horario: string;
  empresa: string;
};

const linhaSchema = z.object({
  data: z.string().default(""),
  posto: z.string().default(""),
  nome: z.string().default(""),
  cargo: z.string().default(""),
  motivo: z.string().default(""),
  cobertura: z.string().default(""),
  horario: z.string().default(""),
  empresa: z.string().default(""),
});

/** Salva os lançamentos do supervisor no registro central de faltas sem cobertura. */
export const salvarFaltasSemCobertura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ linhas: z.array(linhaSchema).min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const registros = data.linhas.map((l) => ({
      user_id: context.userId,
      data: l.data ? l.data : null,
      posto: l.posto,
      nome: l.nome,
      cargo: l.cargo,
      motivo: l.motivo,
      cobertura: l.cobertura,
      horario: l.horario,
      empresa: l.empresa,
    }));

    const { error } = await context.supabase.from("faltas_sem_cobertura").insert(registros);
    if (error) throw new Error(`Não foi possível salvar os lançamentos: ${error.message}`);
    return { ok: true, total: registros.length };
  });

/** Indica se o usuário logado pode gerar a planilha consolidada (Admin, Diretor, Cordenador). */
export const podeGerarPlanilhaFaltas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertAprovadorVagas(context);
      return { permitido: true };
    } catch {
      return { permitido: false };
    }
  });

/** Lista todos os lançamentos de todos os supervisores (restrito aos gestores). */
export const listarFaltasSemCobertura = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FaltaSemCobertura[]> => {
    await assertAprovadorVagas(context);

    const { data, error } = await context.supabase
      .from("faltas_sem_cobertura")
      .select("id, data, posto, nome, cargo, motivo, cobertura, horario, empresa")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`Não foi possível carregar os lançamentos: ${error.message}`);

    return (data ?? []).map((r) => ({
      id: r.id,
      data: r.data ?? "",
      posto: r.posto ?? "",
      nome: r.nome ?? "",
      cargo: r.cargo ?? "",
      motivo: r.motivo ?? "",
      cobertura: r.cobertura ?? "",
      horario: r.horario ?? "",
      empresa: r.empresa ?? "",
    }));
  });
