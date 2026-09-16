import { supabase } from "@/integrations/supabase/client";
import type { ColaboradorExtraido } from "./cartoes-ponto-parser";
import { notificarAtualizacaoProtocoloFolhas } from "@/lib/protocolo-folhas-sync";

export interface ColaboradorPonto {
  id: string;
  empresa: string;
  nome: string;
  cargo: string;
  posto: string;
  matricula: string;
  revisar: boolean;
}

export interface ProtocoloPonto {
  id: string;
  numero_protocolo: string;
  empresa: string;
  data_criacao: string;
  status: "Pendente" | "Entregue";
}

export interface ProtocoloItem {
  id: string;
  protocolo_id: string;
  empresa: string;
  nome: string;
  cargo: string;
  posto: string;
  matricula: string;
}

export interface ResumoPonto {
  folhas: number;
  ativos: number;
  empresas: number;
  revisar: number;
  protocolos: number;
}

/** Evento disparado quando os dados de ponto mudam, para atualizar o resumo. */
export const EVENTO_PONTO_ATUALIZADO = "ponto:atualizado";

export function notificarAtualizacaoPonto() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_PONTO_ATUALIZADO));
  }
  notificarAtualizacaoProtocoloFolhas("atualizacao");
}

export async function obterResumoPonto(): Promise<ResumoPonto> {
  const [colaboradores, protocolos, ativos] = await Promise.all([
    supabase.from("colaboradores_ponto").select("empresa, revisar"),
    supabase.from("protocolos_ponto").select("id", { count: "exact", head: true }),
    supabase
      .from("funcionarios_ativos")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true),
  ]);
  if (colaboradores.error) throw colaboradores.error;
  if (protocolos.error) throw protocolos.error;
  if (ativos.error) throw ativos.error;
  const linhas = colaboradores.data ?? [];
  return {
    folhas: linhas.length,
    ativos: ativos.count ?? 0,
    empresas: new Set(linhas.map((l) => l.empresa)).size,
    revisar: linhas.filter((l) => l.revisar).length,
    protocolos: protocolos.count ?? 0,
  };
}

export async function listarColaboradores(): Promise<ColaboradorPonto[]> {
  const { data, error } = await supabase
    .from("colaboradores_ponto")
    .select("id, empresa, nome, cargo, posto, matricula, revisar")
    .order("empresa")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ColaboradorPonto[];
}

export async function salvarImportacao(registros: ColaboradorExtraido[]): Promise<number> {
  const linhas = registros.map((r) => ({
    empresa: r.empresa,
    nome: r.nome,
    cargo: r.cargo,
    posto: r.posto,
    matricula: r.matricula,
    revisar: r.revisar,
  }));
  const { data, error } = await supabase
    .from("colaboradores_ponto")
    .upsert(linhas, { onConflict: "empresa,matricula" })
    .select("id");
  if (error) throw error;
  notificarAtualizacaoPonto();
  return data?.length ?? 0;
}

export async function atualizarColaborador(
  id: string,
  campos: Partial<Omit<ColaboradorPonto, "id">>,
): Promise<void> {
  const { error } = await supabase.from("colaboradores_ponto").update(campos).eq("id", id);
  if (error) throw error;
  notificarAtualizacaoPonto();
}

export async function excluirColaborador(id: string): Promise<void> {
  const { error } = await supabase.from("colaboradores_ponto").delete().eq("id", id);
  if (error) throw error;
  notificarAtualizacaoPonto();
}

export async function listarProtocolos(): Promise<ProtocoloPonto[]> {
  const { data, error } = await supabase
    .from("protocolos_ponto")
    .select("id, numero_protocolo, empresa, data_criacao, status")
    .order("data_criacao", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProtocoloPonto[];
}

export async function listarItens(protocoloId: string): Promise<ProtocoloItem[]> {
  const { data, error } = await supabase
    .from("protocolo_ponto_itens")
    .select("id, protocolo_id, empresa, nome, cargo, posto, matricula")
    .eq("protocolo_id", protocoloId)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ProtocoloItem[];
}

/** Gera um protocolo por empresa a partir dos colaboradores selecionados. */
export async function gerarProtocolos(
  colaboradores: ColaboradorPonto[],
): Promise<ProtocoloPonto[]> {
  const porEmpresa = new Map<string, ColaboradorPonto[]>();
  for (const c of colaboradores) {
    const lista = porEmpresa.get(c.empresa) ?? [];
    lista.push(c);
    porEmpresa.set(c.empresa, lista);
  }

  const criados: ProtocoloPonto[] = [];
  for (const [empresa, lista] of porEmpresa) {
    const { data, error } = await supabase
      .from("protocolos_ponto")
      .insert({ empresa })
      .select("id, numero_protocolo, empresa, data_criacao, status")
      .single();
    if (error) throw error;
    const protocolo = data as ProtocoloPonto;
    const { error: erroItens } = await supabase.from("protocolo_ponto_itens").insert(
      lista.map((c) => ({
        protocolo_id: protocolo.id,
        empresa: c.empresa,
        nome: c.nome,
        cargo: c.cargo,
        posto: c.posto,
        matricula: c.matricula,
      })),
    );
    if (erroItens) throw erroItens;
    criados.push(protocolo);
  }
  notificarAtualizacaoPonto();
  return criados;
}

export async function atualizarStatusProtocolo(
  id: string,
  status: "Pendente" | "Entregue",
): Promise<void> {
  const { error } = await supabase.from("protocolos_ponto").update({ status }).eq("id", id);
  if (error) throw error;
  notificarAtualizacaoPonto();
}

export async function excluirProtocolo(id: string): Promise<void> {
  const { error } = await supabase.from("protocolos_ponto").delete().eq("id", id);
  if (error) throw error;
  notificarAtualizacaoPonto();
}

export async function limparProtocolos(): Promise<number> {
  const { data, error } = await supabase
    .from("protocolos_ponto")
    .delete()
    .not("id", "is", null)
    .select("id");
  if (error) throw error;
  notificarAtualizacaoPonto();
  return data?.length ?? 0;
}
