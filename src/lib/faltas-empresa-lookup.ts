import { supabase } from "@/integrations/supabase/client";
import { pesquisarColaboradoresNexti } from "@/lib/nexti-ativos.functions";

export interface ColaboradorSugestao {
  nome: string;
  empresa: string;
  cargo: string;
  posto: string;
}

/** Busca local (cache do banco) usada como plano B quando a API da NEXTI falha. */
async function buscarNoBanco(termo: string): Promise<ColaboradorSugestao[]> {
  const { data, error } = await supabase
    .from("funcionarios_ativos")
    .select("nome, empresa, cargo, posto")
    .ilike("nome", `%${termo}%`)
    .order("nome")
    .limit(8);
  if (error) return [];

  const vistos = new Set<string>();
  const lista: ColaboradorSugestao[] = [];
  for (const r of data ?? []) {
    const chave = `${r.nome}|${r.empresa}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push({
      nome: r.nome ?? "",
      empresa: r.empresa ?? "",
      cargo: r.cargo ?? "",
      posto: r.posto ?? "",
    });
  }
  return lista;
}

/**
 * Busca colaboradores pelo nome diretamente na API da NEXTI (fonte oficial).
 * Se a API estiver indisponível, cai para a cópia local sincronizada.
 */
export async function buscarColaboradoresPorNome(termo: string): Promise<ColaboradorSugestao[]> {
  const q = termo.trim();
  if (q.length < 3) return [];

  try {
    const resultado = await pesquisarColaboradoresNexti({ data: { termo: q } });
    if (resultado.ok && resultado.colaboradores.length > 0) {
      return resultado.colaboradores.slice(0, 8).map((c) => ({
        nome: c.colaborador,
        empresa: c.empresa,
        cargo: c.cargo,
        posto: c.posto,
      }));
    }
    // API respondeu mas sem resultados: tenta a cópia local antes de desistir.
    if (resultado.ok) return buscarNoBanco(q);
    return buscarNoBanco(q);
  } catch {
    return buscarNoBanco(q);
  }
}
