import { supabase } from "@/integrations/supabase/client";

export type ComercialModo = "dashboard" | "clientes" | "funil" | "propostas" | "agenda" | "contratos" | "relatorios";

export type ClienteComercial = {
  id: string;
  tipo: "potencial" | "cliente";
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  segmento: string | null;
  origem_lead: string | null;
  responsavel_id: string;
  unidade_id: string | null;
  ativo: boolean;
  created_at: string;
};

export type EtapaComercial = {
  id: string;
  nome: string;
  ordem: number;
  probabilidade: number;
  tipo_final: "ganho" | "perdido" | null;
};

export type OportunidadeComercial = {
  id: string;
  cliente_id: string;
  etapa_id: string;
  titulo: string;
  valor_previsto: number;
  probabilidade: number;
  previsao_fechamento: string | null;
  responsavel_id: string;
  motivo_perda: string | null;
  created_at: string;
};

export type PropostaComercial = {
  id: string;
  oportunidade_id: string;
  numero: string;
  status: "rascunho" | "enviada" | "aprovada" | "recusada" | "expirada";
  versao_atual: number;
  valor_mensal: number;
  prazo_meses: number;
  validade_ate: string | null;
  responsavel_id: string;
  created_at: string;
};

export type AtividadeComercial = {
  id: string;
  cliente_id: string | null;
  oportunidade_id: string | null;
  tipo: "tarefa" | "reuniao" | "retorno" | "lembrete";
  titulo: string;
  descricao: string | null;
  inicio_em: string;
  concluida_em: string | null;
  responsavel_id: string;
};

export type ContratoComercial = {
  id: string;
  proposta_id: string;
  cliente_id: string;
  numero: string;
  inicio: string;
  fim: string;
  valor_mensal: number;
  indice_reajuste: string | null;
  proximo_reajuste: string | null;
  status: "implantacao" | "ativo" | "encerrado" | "cancelado";
  implantacao_status: "pendente" | "enviado" | "recebido" | "concluido";
  responsavel_id: string;
};

export type ComercialDados = {
  clientes: ClienteComercial[];
  etapas: EtapaComercial[];
  oportunidades: OportunidadeComercial[];
  propostas: PropostaComercial[];
  atividades: AtividadeComercial[];
  contratos: ContratoComercial[];
};

// O arquivo de tipos do banco é regenerado pelo Lovable Cloud. Este adaptador
// mantém o módulo legível enquanto as relações novas continuam tipadas na origem.
const banco = supabase as any;

export async function carregarComercial(): Promise<ComercialDados> {
  const [clientes, etapas, oportunidades, propostas, atividades, contratos] = await Promise.all([
    banco.from("com_clientes").select("id,tipo,razao_social,nome_fantasia,cnpj,email,telefone,endereco,cidade,uf,segmento,origem_lead,responsavel_id,unidade_id,ativo,created_at").eq("ativo", true).order("created_at", { ascending: false }).limit(500),
    banco.from("com_etapas").select("id,nome,ordem,probabilidade,tipo_final").eq("ativo", true).order("ordem"),
    banco.from("com_oportunidades").select("id,cliente_id,etapa_id,titulo,valor_previsto,probabilidade,previsao_fechamento,responsavel_id,motivo_perda,created_at").order("updated_at", { ascending: false }).limit(500),
    banco.from("com_propostas").select("id,oportunidade_id,numero,status,versao_atual,valor_mensal,prazo_meses,validade_ate,responsavel_id,created_at").order("created_at", { ascending: false }).limit(500),
    banco.from("com_atividades").select("id,cliente_id,oportunidade_id,tipo,titulo,descricao,inicio_em,concluida_em,responsavel_id").order("inicio_em").limit(500),
    banco.from("com_contratos").select("id,proposta_id,cliente_id,numero,inicio,fim,valor_mensal,indice_reajuste,proximo_reajuste,status,implantacao_status,responsavel_id").order("fim").limit(500),
  ]);
  const erro = [clientes, etapas, oportunidades, propostas, atividades, contratos].find((r) => r.error)?.error;
  if (erro) throw new Error(erro.message);
  return {
    clientes: (clientes.data ?? []) as ClienteComercial[],
    etapas: (etapas.data ?? []) as EtapaComercial[],
    oportunidades: (oportunidades.data ?? []) as OportunidadeComercial[],
    propostas: (propostas.data ?? []) as PropostaComercial[],
    atividades: (atividades.data ?? []) as AtividadeComercial[],
    contratos: (contratos.data ?? []) as ContratoComercial[],
  };
}

export async function registrarAuditoria(acao: string, entidade: string, entidadeId?: string, detalhes: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await banco.from("com_auditoria").insert({ user_id: data.user.id, acao, entidade, entidade_id: entidadeId, detalhes });
}

export function moeda(valor: number | string | null | undefined) {
  return Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function nomeCliente(clientes: ClienteComercial[], id: string | null) {
  const cliente = clientes.find((item) => item.id === id);
  return cliente?.nome_fantasia || cliente?.razao_social || "Cliente não informado";
}

export function baixarArquivo(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}