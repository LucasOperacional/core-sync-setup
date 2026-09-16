import { supabase } from "@/integrations/supabase/client";
import { registrarAtividade, type DetalhesAtividade } from "@/lib/atividades.functions";

/** Nome amigável do módulo a partir da rota atual. */
export function moduloDaRota(rota: string): string {
  const limpa = rota.split("?")[0] ?? rota;
  const partes = limpa.split("/").filter(Boolean);
  if (partes.length === 0) return "inicio";
  return partes[0]!.toLowerCase();
}

/**
 * Registra uma atividade do usuário sem interromper a tela em caso de falha.
 */
export async function registrarLog(
  acao: string,
  opcoes?: { modulo?: string; rota?: string; detalhes?: DetalhesAtividade },
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const rota =
      opcoes?.rota ?? (typeof window !== "undefined" ? window.location.pathname : undefined);
    await registrarAtividade({
      data: {
        acao,
        modulo: opcoes?.modulo ?? (rota ? moduloDaRota(rota) : "geral"),
        ...(rota ? { rota } : {}),
        ...(opcoes?.detalhes ? { detalhes: opcoes.detalhes } : {}),
      },
    });
  } catch {
    // registro de log nunca pode quebrar a experiência do usuário
  }
}
