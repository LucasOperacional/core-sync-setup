/**
 * Tipos compartilhados do módulo Assinatura de Documentos.
 *
 * As posições dos campos são guardadas em fração da página (0 a 1) a partir
 * do canto superior esquerdo, para funcionar em qualquer tamanho de PDF.
 */

export type CampoTipo =
  | "nome"
  | "cpf"
  | "matricula"
  | "empresa"
  | "posto"
  | "cargo"
  | "data"
  | "observacao"
  | "texto"
  | "rubrica"
  | "assinatura";

export interface CampoDocumento {
  id: string;
  tipo: CampoTipo;
  rotulo: string;
  pagina: number;
  /** Fração horizontal (0..1) do canto esquerdo do campo. */
  x: number;
  /** Fração vertical (0..1) do topo do campo. */
  y: number;
  /** Largura em fração da página. */
  w: number;
  /** Altura em fração da página. */
  h: number;
  obrigatorio: boolean;
  /** Valor já preenchido pelo emissor (campos de texto). */
  valor?: string;
  /** Ordem do signatário responsável (1..n) — vazio = preenchido pelo emissor. */
  signatario?: number | null;
}

export type StatusDocumento =
  | "rascunho"
  | "enviado"
  | "visualizado"
  | "aguardando_assinatura"
  | "assinado_parcialmente"
  | "concluido"
  | "recusado"
  | "cancelado"
  | "expirado";

export type StatusSignatario = "enviado" | "visualizado" | "assinado" | "recusado" | "cancelado";

export const ROTULO_STATUS: Record<StatusDocumento, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  visualizado: "Visualizado",
  aguardando_assinatura: "Aguardando assinatura",
  assinado_parcialmente: "Assinado parcialmente",
  concluido: "Concluído",
  recusado: "Recusado",
  cancelado: "Cancelado",
  expirado: "Expirado",
};

export const ROTULO_CAMPO: Record<CampoTipo, string> = {
  nome: "Nome completo",
  cpf: "CPF",
  matricula: "Matrícula",
  empresa: "Empresa",
  posto: "Posto de serviço",
  cargo: "Cargo",
  data: "Data",
  observacao: "Observações",
  texto: "Texto livre",
  rubrica: "Rubrica",
  assinatura: "Assinatura",
};

export const TIPOS_ASSINATURA: CampoTipo[] = ["assinatura", "rubrica"];

export interface DocumentoAssinatura {
  id: string;
  titulo: string;
  tipo: string;
  status: StatusDocumento;
  protocolo: string;
  original_path: string | null;
  preenchido_path: string | null;
  assinado_path: string | null;
  hash_sha256: string | null;
  campos: CampoDocumento[];
  exige_codigo: boolean;
  expira_em: string | null;
  criado_por_nome: string | null;
  concluido_em: string | null;
  cancelado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignatarioAssinatura {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ordem: number;
  status: StatusSignatario;
  visualizado_em: string | null;
  assinado_em: string | null;
  recusado_em: string | null;
  motivo_recusa: string | null;
  ip: string | null;
  dispositivo: string | null;
}

export interface EventoAuditoria {
  id: string;
  evento: string;
  detalhe: string | null;
  ip: string | null;
  dispositivo: string | null;
  created_at: string;
}

/** Detecta se o PDF importado é um formulário CRT (Controle de Reserva Técnica). */
export function pareceCrt(texto: string, nomeArquivo = ""): boolean {
  const alvo = `${texto} ${nomeArquivo}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return (
    alvo.includes("RE.OPE.14") ||
    alvo.includes("CONTROLE DE RESERVA TECNICA") ||
    (alvo.includes("CRT") && alvo.includes("SUBSTITU"))
  );
}

/** Campos padrão sugeridos para um formulário CRT. */
export function camposPadraoCrt(): CampoDocumento[] {
  const novo = (
    tipo: CampoTipo,
    rotulo: string,
    x: number,
    y: number,
    w: number,
    h: number,
    signatario: number | null = null,
    obrigatorio = true,
  ): CampoDocumento => ({
    id: `${tipo}-${Math.random().toString(36).slice(2, 9)}`,
    tipo,
    rotulo,
    pagina: 1,
    x,
    y,
    w,
    h,
    obrigatorio,
    valor: "",
    signatario,
  });

  return [
    novo("nome", "Colaborador substituído", 0.1, 0.3, 0.5, 0.03),
    novo("matricula", "Matrícula", 0.1, 0.35, 0.25, 0.03, null, false),
    novo("posto", "Posto de serviço", 0.1, 0.4, 0.5, 0.03),
    novo("data", "Data da substituição", 0.1, 0.45, 0.25, 0.03),
    novo("nome", "Reserva / substituto", 0.1, 0.55, 0.5, 0.03),
    novo("observacao", "Motivo", 0.1, 0.62, 0.75, 0.05, null, false),
    novo("assinatura", "Assinatura do supervisor", 0.1, 0.8, 0.32, 0.06, 1),
    novo("assinatura", "Assinatura do colaborador", 0.55, 0.8, 0.32, 0.06, 2),
  ];
}
