/** Tipos e listas compartilhadas do sistema de notificações no celular. */

export const CATEGORIAS_PUSH = [
  "protocolos",
  "atestados",
  "faltas",
  "nexti",
  "chat",
  "documentos",
  "sistema",
] as const;

export type CategoriaPush = (typeof CATEGORIAS_PUSH)[number];

export const ROTULO_CATEGORIA: Record<CategoriaPush, string> = {
  protocolos: "Protocolos",
  atestados: "Atestados",
  faltas: "Faltas",
  nexti: "NEXTI",
  chat: "Chat interno",
  documentos: "Documentos",
  sistema: "Sistema",
};

/** Textos padrão usados quando a IA não estiver disponível. */
export const TEXTO_PADRAO: Record<CategoriaPush, { title: string; body: string }> = {
  protocolos: {
    title: "Atualização de protocolo",
    body: "Um protocolo foi atualizado no sistema.",
  },
  atestados: { title: "Atualização de atestado", body: "Um atestado foi atualizado no sistema." },
  faltas: { title: "Atualização de faltas", body: "Houve uma atualização no controle de faltas." },
  nexti: { title: "Atualização NEXTI", body: "Houve uma atualização na integração com a NEXTI." },
  chat: { title: "Chat interno", body: "Você tem uma nova mensagem no chat interno." },
  documentos: { title: "Documentos", body: "Um documento precisa da sua atenção." },
  sistema: { title: "Aviso do sistema", body: "Há um novo aviso do sistema para você." },
};

export function ehCategoriaPush(valor: unknown): valor is CategoriaPush {
  return typeof valor === "string" && (CATEGORIAS_PUSH as readonly string[]).includes(valor);
}

/** Aceita apenas caminhos internos começando com "/" (nunca URL externa). */
export function rotaInternaValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  return valor.slice(0, 300);
}

export const MAX_DESTINATARIOS = 500;

export type StatusNotificacao = "pending" | "sent" | "partial" | "failed";

export type NotificacaoHistorico = {
  id: string;
  category: string;
  event_type: string;
  title: string;
  body: string;
  target_url: string | null;
  status: string;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  read_at: string | null;
  created_at: string;
};
