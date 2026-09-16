import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";
import { gerenteAreaACanonico, normalizarNome } from "./gerentes-area-a";
import { areaGerenteCanonica } from "./areas-gerentes";

export type FaltaLancada = {
  colaborador: string;
  posto: string;
  cargo: string;
  tipo: string;
  periodo: string;
  faltas: number;
};

export type MinhasFaltasResultado = {
  ehGerente: boolean;
  gerenteNome: string | null;
  totalRegistros: number;
  totalFaltas: number;
  registros: FaltaLancada[];
  postos: { id: string; nome: string; localidade: string | null }[];
};

const linhaSchema = z.object({
  gerente: z.string(),
  colaborador: z.string().default(""),
  posto: z.string().default(""),
  cargo: z.string().default(""),
  tipo: z.string().default(""),
  periodo: z.string().default(""),
  faltas: z.number().int().min(0).default(0),
});

function assinatura(l: z.infer<typeof linhaSchema>, gerente: string): string {
  return [gerente, l.colaborador, l.posto, l.cargo, l.tipo, l.periodo, String(l.faltas)]
    .map((v) => normalizarNome(v))
    .join("|");
}

/**
 * Grava no banco as faltas extraídas da planilha, associadas ao gerente de área
 * que as lançou. Chaves repetidas são ignoradas (sem duplicar registros).
 */
export const sincronizarFaltasLancadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ linhas: z.array(linhaSchema).max(20000) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const vistos = new Set<string>();
    const registros = data.linhas
      .map((l) => {
        const gerente = gerenteAreaACanonico(l.gerente) ?? areaGerenteCanonica(l.gerente);
        if (!gerente) return null;
        const chave = assinatura(l, gerente);
        if (vistos.has(chave)) return null;
        vistos.add(chave);
        return {
          gerente_nome: gerente,
          colaborador: l.colaborador,
          posto: l.posto,
          cargo: l.cargo,
          tipo: l.tipo,
          periodo: l.periodo,
          faltas: l.faltas,
          assinatura: chave,
          created_by: context.userId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    let gravados = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("faltas_lancamentos")
        .upsert(lote, { onConflict: "assinatura", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      gravados += lote.length;
    }

    return { ok: true as const, gravados };
  });

/**
 * Faltas lançadas no nome do gerente de área logado e os postos vinculados a ele.
 */
export const minhasFaltasLancadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MinhasFaltasResultado> => {
    const vazio: MinhasFaltasResultado = {
      ehGerente: false,
      gerenteNome: null,
      totalRegistros: 0,
      totalFaltas: 0,
      registros: [],
      postos: [],
    };

    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const nome = (perfil?.display_name ?? "").trim();
    const gerenteNome = nome ? (gerenteAreaACanonico(nome) ?? areaGerenteCanonica(nome)) : null;
    if (!gerenteNome) return vazio;

    const [{ data: linhas }, { data: postos }] = await Promise.all([
      context.supabase
        .from("faltas_lancamentos")
        .select("colaborador, posto, cargo, tipo, periodo, faltas")
        .eq("gerente_nome", gerenteNome)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("areas_gerentes_postos")
        .select("id, posto_nome, posto_localidade")
        .eq("gerente_nome", gerenteNome)
        .order("posto_nome", { ascending: true }),
    ]);

    const registros = (linhas ?? []).map((l) => ({
      colaborador: l.colaborador ?? "",
      posto: l.posto ?? "",
      cargo: l.cargo ?? "",
      tipo: l.tipo ?? "",
      periodo: l.periodo ?? "",
      faltas: l.faltas ?? 0,
    }));

    return {
      ehGerente: true,
      gerenteNome,
      totalRegistros: registros.length,
      totalFaltas: registros.reduce((s, r) => s + (r.faltas || 0), 0),
      registros,
      postos: (postos ?? []).map((p) => ({
        id: p.id,
        nome: p.posto_nome,
        localidade: p.posto_localidade,
      })),
    };
  });
