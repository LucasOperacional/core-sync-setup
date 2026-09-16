import { supabase } from "@/integrations/supabase/client";
import type { Visit } from "@/lib/report-parser";
import { listVisitas, saveVisitsDetalhado } from "@/lib/visitas-db";
import { mesclarVisitas } from "@/lib/control-nexti";
import { notificarControlAtualizado } from "@/lib/control-sync";
import { filtrarFonteControl } from "@/lib/control-regras";

export const CONTROL_STORAGE_KEY = "nexti-visitas-v1";

export type ResultadoImportacaoControl = {
  /** Lista final exibida no dashboard (banco + importadas). */
  visitas: Visit[];
  /** Quantidade de visitas gravadas no banco. */
  salvas: number;
  /** Quantidade de visitas lidas do PDF. */
  lidas: number;
  autenticado: boolean;
  erros: string[];
};

/**
 * Único caminho de importação usado tanto pela página de administração quanto
 * pelo Dashboard CONTROL: grava todas as visitas lidas (upsert por chave),
 * relê o banco para que as duas telas mostrem exatamente o mesmo conteúdo e
 * avisa o dashboard para recarregar imediatamente.
 */
export async function importarVisitasControl(
  entrada: Visit[],
): Promise<ResultadoImportacaoControl> {
  // Regra do Control: nenhuma visita vinda da API NEXTI entra no dashboard.
  const novas = filtrarFonteControl(entrada);
  const { data } = await supabase.auth.getSession();
  const autenticado = Boolean(data.session);

  if (!autenticado) {
    let atual: Visit[] = [];
    try {
      const raw = localStorage.getItem(CONTROL_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Visit[]) : [];
      if (Array.isArray(parsed)) atual = parsed;
    } catch {
      /* cache inválido */
    }
    const visitas = mesclarVisitas(novas, atual);
    gravarCache(visitas);
    notificarControlAtualizado();
    return { visitas, salvas: 0, lidas: novas.length, autenticado, erros: [] };
  }

  const { salvas, erros } = await saveVisitsDetalhado(novas);
  const doBanco = await listVisitas();
  const visitas = doBanco.length > 0 ? doBanco : mesclarVisitas(novas, []);
  gravarCache(visitas);
  notificarControlAtualizado();

  return { visitas, salvas, lidas: novas.length, autenticado, erros };
}

function gravarCache(visitas: Visit[]) {
  try {
    localStorage.setItem(CONTROL_STORAGE_KEY, JSON.stringify(visitas.slice(0, 500)));
  } catch {
    /* storage cheio */
  }
}
