/**
 * Flags por colaborador usadas no lançamento de férias.
 *
 * Cada pessoa pode ter um ajuste próprio: lançar ou não as férias, receber (ou
 * não) o aviso, exigir leitura/aceite/assinatura e ter período e observação
 * específicos. Os ajustes ficam salvos no banco e valem para todos os usuários.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlagUsuarioFerias {
  id?: string;
  nomeChave: string;
  nome: string;
  empresa: string;
  matricula: string;
  personId: number | null;
  personExternalId: string;
  lancarFerias: boolean;
  enviarAviso: boolean;
  enviarFerias: boolean;
  exigirLeitura: boolean;
  exigirAceite: boolean;
  exigirAssinatura: boolean;
  dias: number | null;
  dataInicio: string;
  dataFim: string;
  observacao: string;
  origem: string;
}

export const FLAGS_FERIAS_QUERY_KEY = ["ferias", "usuarios-flags"] as const;

/** Chave estável da pessoa (nome sem acento, maiúsculas e espaços normalizados). */
export function chaveNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

type Linha = {
  id: string;
  nome_chave: string;
  nome: string;
  empresa: string | null;
  matricula: string | null;
  person_id: number | null;
  person_external_id: string | null;
  lancar_ferias: boolean;
  enviar_aviso: boolean;
  enviar_ferias: boolean;
  exigir_leitura: boolean;
  exigir_aceite: boolean;
  exigir_assinatura: boolean;
  dias: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  observacao: string | null;
  origem: string;
};

function paraFlag(l: Linha): FlagUsuarioFerias {
  return {
    id: l.id,
    nomeChave: l.nome_chave,
    nome: l.nome,
    empresa: l.empresa ?? "",
    matricula: l.matricula ?? "",
    personId: l.person_id === null ? null : Number(l.person_id),
    personExternalId: l.person_external_id ?? "",
    lancarFerias: l.lancar_ferias,
    enviarAviso: l.enviar_aviso,
    enviarFerias: l.enviar_ferias,
    exigirLeitura: l.exigir_leitura,
    exigirAceite: l.exigir_aceite,
    exigirAssinatura: l.exigir_assinatura,
    dias: l.dias,
    dataInicio: l.data_inicio ?? "",
    dataFim: l.data_fim ?? "",
    observacao: l.observacao ?? "",
    origem: l.origem,
  };
}

/** Flags padrão de uma pessoa ainda sem ajuste salvo. */
export function flagPadrao(
  nome: string,
  extras: Partial<FlagUsuarioFerias> = {},
): FlagUsuarioFerias {
  return {
    nomeChave: chaveNome(nome),
    nome: nome.trim(),
    empresa: "",
    matricula: "",
    personId: null,
    personExternalId: "",
    lancarFerias: true,
    enviarAviso: true,
    enviarFerias: true,
    exigirLeitura: false,
    exigirAceite: false,
    exigirAssinatura: false,
    dias: null,
    dataInicio: "",
    dataFim: "",
    observacao: "",
    origem: "manual",
    ...extras,
  };
}

export async function listarFlagsFerias(): Promise<FlagUsuarioFerias[]> {
  const { data, error } = await supabase
    .from("ferias_usuarios_flags")
    .select(
      "id,nome_chave,nome,empresa,matricula,person_id,person_external_id,lancar_ferias,enviar_aviso,enviar_ferias,exigir_leitura,exigir_aceite,exigir_assinatura,dias,data_inicio,data_fim,observacao,origem",
    )
    .order("nome", { ascending: true });
  if (error) throw new Error("Não foi possível carregar os ajustes por colaborador.");
  return ((data ?? []) as unknown as Linha[]).map(paraFlag);
}

/** Funcionário ativo (sincronizado da NEXTI) usado para montar a lista completa. */
export interface FuncionarioAtivoResumo {
  nome: string;
  empresa: string;
  matricula: string;
}

const TABELA_ATIVOS = "funcionarios_ativos";

/** Lista todos os funcionários ativos, paginando para não perder ninguém. */
export async function listarFuncionariosAtivos(): Promise<FuncionarioAtivoResumo[]> {
  const todos: FuncionarioAtivoResumo[] = [];
  const PAGINA = 1000;
  for (let pagina = 0; pagina < 50; pagina++) {
    const { data, error } = await supabase
      .from(TABELA_ATIVOS)
      .select("nome,empresa,matricula")
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) throw new Error("Não foi possível carregar os funcionários ativos.");
    const lote = (data ?? []) as { nome: string | null; empresa: string | null; matricula: string | null }[];
    for (const l of lote) {
      if (!l.nome) continue;
      todos.push({ nome: l.nome, empresa: l.empresa ?? "", matricula: l.matricula ?? "" });
    }
    if (lote.length < PAGINA) break;
  }
  return todos;
}

export function useFuncionariosAtivos() {
  return useQuery({
    queryKey: ["ferias", "funcionarios-ativos"],
    queryFn: listarFuncionariosAtivos,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFlagsFerias() {
  return useQuery({
    queryKey: FLAGS_FERIAS_QUERY_KEY,
    queryFn: listarFlagsFerias,
    staleTime: 60_000,
  });
}

export async function salvarFlagsFerias(flags: FlagUsuarioFerias[]): Promise<void> {
  if (flags.length === 0) return;
  const { data: sessao } = await supabase.auth.getUser();
  const linhas = flags.map((f) => ({
    nome_chave: f.nomeChave || chaveNome(f.nome),
    nome: f.nome.trim(),
    empresa: f.empresa || null,
    matricula: f.matricula || null,
    person_id: f.personId,
    person_external_id: f.personExternalId || null,
    lancar_ferias: f.lancarFerias,
    enviar_aviso: f.enviarAviso,
    enviar_ferias: f.enviarFerias,
    exigir_leitura: f.exigirLeitura,
    exigir_aceite: f.exigirAceite,
    exigir_assinatura: f.exigirAssinatura,
    dias: f.dias,
    data_inicio: f.dataInicio || null,
    data_fim: f.dataFim || null,
    observacao: f.observacao || null,
    origem: f.origem || "manual",
    atualizado_por: sessao.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("ferias_usuarios_flags")
    .upsert(linhas, { onConflict: "nome_chave" });
  if (error) throw new Error("Não foi possível salvar os ajustes por colaborador.");
}

export async function removerFlagFerias(nomeChave: string): Promise<void> {
  const { error } = await supabase
    .from("ferias_usuarios_flags")
    .delete()
    .eq("nome_chave", nomeChave);
  if (error) throw new Error("Não foi possível remover o colaborador da lista.");
}

/** Atualiza a lista na tela logo após salvar/remover. */
export function useAtualizarFlagsFerias() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: FLAGS_FERIAS_QUERY_KEY });
}
