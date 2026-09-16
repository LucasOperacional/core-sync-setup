/**
 * Types for the Medical Certificate Verification module.
 */

export type ClassificacaoAtestado =
  | "Validado eletronicamente"
  | "Sem validação eletrônica disponível"
  | "Necessita revisão manual"
  | "Inconsistências encontradas"
  | "Documento ilegível"
  | "Assinatura digital inválida"
  | "Documento alterado após assinatura";

export interface DadosExtraidos {
  nomePaciente: string;
  cpf: string;
  nomeMedico: string;
  crm: string;
  ufCrm: string;
  dataEmissao: string;
  horaEmissao: string;
  diasAfastamento: string;
  dataInicioAfastamento: string;
  dataFimAfastamento: string;
  nomeClinica: string;
  cnpjEstabelecimento: string;
  codigoValidacao: string;
  qrCodeDetectado: boolean;
  qrCodeConteudo: string;
  assinaturaDigitalDetectada: boolean;
  cid: string;
  cidDescricao: string;
}

export interface ValidacaoItem {
  id: string;
  descricao: string;
  resultado: "aprovado" | "reprovado" | "nao_verificavel" | "pendente";
  detalhes: string;
  origem: string;
  impactoPontuacao: number;
}

export interface Inconsistencia {
  id: string;
  tipo: string;
  descricao: string;
  severidade: "baixa" | "media" | "alta";
}

export interface AcaoHistorico {
  id: string;
  acao: string;
  usuario: string;
  dataHora: string;
  observacao?: string;
}

export interface ResultadoVerificacao {
  id: string;
  nomeArquivo: string;
  tipoArquivo: string;
  tamanhoArquivo: number;
  hashSha256: string;
  dataAnalise: string;
  classificacao: ClassificacaoAtestado;
  pontuacaoRisco: number;
  faixaRisco: "baixo" | "revisao" | "alto";
  dadosExtraidos: DadosExtraidos;
  validacoes: ValidacaoItem[];
  inconsistencias: Inconsistencia[];
  historico: AcaoHistorico[];
  textoExtraido: string;
  arquivoUrl: string;
  observacao: string;
}

export const CAMPO_NAO_IDENTIFICADO = "Não identificado";
