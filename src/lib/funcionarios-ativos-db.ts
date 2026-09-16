import { supabase } from "@/integrations/supabase/client";
import { NAO_IDENTIFICADO, type ColaboradorExtraido } from "./cartoes-ponto-parser";
import { notificarAtualizacaoProtocoloFolhas } from "@/lib/protocolo-folhas-sync";

export interface FuncionarioAtivo {
  id: string;
  empresa: string;
  nome: string;
  cargo: string;
  posto: string;
  matricula: string;
  ativo: boolean;
  revisar: boolean;
}

/** Evento disparado quando a lista de funcionários ativos muda. */
export const EVENTO_FUNCIONARIOS_ATUALIZADO = "funcionarios:atualizado";

export function notificarAtualizacaoFuncionarios() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_FUNCIONARIOS_ATUALIZADO));
  }
  notificarAtualizacaoProtocoloFolhas("importacao");
}

export async function contarFuncionariosAtivos(): Promise<number> {
  const { count, error } = await supabase
    .from("funcionarios_ativos")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true);
  if (error) throw error;
  return count ?? 0;
}

export async function listarFuncionariosAtivos(): Promise<FuncionarioAtivo[]> {
  const { data, error } = await supabase
    .from("funcionarios_ativos")
    .select("id, empresa, nome, cargo, posto, matricula, ativo, revisar")
    .order("empresa")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as FuncionarioAtivo[];
}

export async function salvarFuncionariosAtivos(registros: ColaboradorExtraido[]): Promise<number> {
  const linhas = registros.map((r) => ({
    empresa: r.empresa,
    nome: r.nome,
    cargo: r.cargo,
    posto: r.posto,
    matricula: r.matricula,
    revisar: r.revisar,
    ativo: true,
  }));

  // Sem matrícula não há chave de conflito confiável: essas linhas são inseridas.
  const semMatricula = linhas.filter((l) => l.matricula === NAO_IDENTIFICADO);
  const comMatricula: typeof linhas = [];
  const chaves = new Set<string>();
  for (const l of linhas) {
    if (l.matricula === NAO_IDENTIFICADO) continue;
    const chave = `${l.empresa.toLowerCase()}|${l.matricula.toLowerCase()}`;
    if (chaves.has(chave)) continue; // evita conflito duplicado no mesmo lote
    chaves.add(chave);
    comMatricula.push(l);
  }

  let total = 0;

  if (comMatricula.length > 0) {
    // Remove os registros existentes com a mesma matrícula antes de inserir (substituição).
    for (const l of comMatricula) {
      const { error } = await supabase
        .from("funcionarios_ativos")
        .delete()
        .eq("empresa", l.empresa)
        .eq("matricula", l.matricula);
      if (error) throw error;
    }
    const { error, data } = await supabase
      .from("funcionarios_ativos")
      .insert(comMatricula)
      .select("id");
    if (error) throw error;
    total += data?.length ?? comMatricula.length;
  }

  if (semMatricula.length > 0) {
    const { error, data } = await supabase
      .from("funcionarios_ativos")
      .insert(semMatricula)
      .select("id");
    if (error) throw error;
    total += data?.length ?? semMatricula.length;
  }

  notificarAtualizacaoFuncionarios();
  return total;
}

export async function atualizarFuncionarioAtivo(
  id: string,
  dados: Partial<Omit<FuncionarioAtivo, "id">>,
): Promise<void> {
  const { error } = await supabase.from("funcionarios_ativos").update(dados).eq("id", id);
  if (error) throw error;
  notificarAtualizacaoFuncionarios();
}

export async function excluirFuncionarioAtivo(id: string): Promise<void> {
  const { error } = await supabase.from("funcionarios_ativos").delete().eq("id", id);
  if (error) throw error;
  notificarAtualizacaoFuncionarios();
}

export async function limparFuncionariosAtivos(): Promise<void> {
  const { error } = await supabase.from("funcionarios_ativos").delete().not("id", "is", null);
  if (error) throw error;
  notificarAtualizacaoFuncionarios();
}
