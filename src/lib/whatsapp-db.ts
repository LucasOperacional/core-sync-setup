import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/chat-interno-db";

export type WhatsAppConvStatus = "aberta" | "em_atendimento" | "finalizada";

export interface WhatsAppConversation {
  id: string;
  wa_chat_id: string;
  telefone: string | null;
  contato_nome: string | null;
  is_group: boolean;
  status: WhatsAppConvStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  nao_lidas: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  foto_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direcao: "recebida" | "enviada" | "sistema";
  autor_nome: string | null;
  user_id: string | null;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

export async function listWhatsAppConversations(limit = 300): Promise<WhatsAppConversation[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversations" as any)
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as WhatsAppConversation[];
}

export async function listWhatsAppMessages(conversationId: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages" as any)
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as WhatsAppMessage[];
}

export async function marcarWhatsAppLida(conversationId: string): Promise<void> {
  await supabase
    .from("whatsapp_conversations" as any)
    .update({ nao_lidas: 0 } as any)
    .eq("id", conversationId);
}

export async function assumirWhatsApp(conversationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("whatsapp_conversations" as any)
    .update({
      status: "em_atendimento",
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function finalizarWhatsApp(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations" as any)
    .update({ status: "finalizada" } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function transferirWhatsApp(
  conversationId: string,
  paraUserId: string | null,
  motivo?: string,
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("whatsapp_conversations" as any)
    .update({
      assigned_to: paraUserId,
      status: paraUserId ? "em_atendimento" : "aberta",
      assigned_at: paraUserId ? new Date().toISOString() : null,
    } as any)
    .eq("id", conversationId);
  if (error) throw error;

  await supabase.from("whatsapp_transfers" as any).insert({
    conversation_id: conversationId,
    de_user_id: userId,
    para_user_id: paraUserId,
    motivo: motivo ?? null,
  } as any);

  await supabase.from("whatsapp_messages" as any).insert({
    conversation_id: conversationId,
    direcao: "sistema",
    user_id: userId,
    content: paraUserId
      ? `Conversa transferida${motivo ? ` — ${motivo}` : ""}.`
      : `Conversa devolvida para a fila${motivo ? ` — ${motivo}` : ""}.`,
  } as any);
}

export async function apagarMensagemWhatsApp(messageId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_messages" as any)
    .delete()
    .eq("id", messageId);
  if (error) throw new Error(error.message);
}

export async function apagarWhatsApp(conversationId: string): Promise<void> {
  const { error: eMsg } = await supabase
    .from("whatsapp_messages" as any)
    .delete()
    .eq("conversation_id", conversationId);
  if (eMsg) throw new Error(eMsg.message);

  const { error: eTr } = await supabase
    .from("whatsapp_transfers" as any)
    .delete()
    .eq("conversation_id", conversationId);
  if (eTr) throw new Error(eTr.message);

  const { error: eConv } = await supabase
    .from("whatsapp_conversations" as any)
    .delete()
    .eq("id", conversationId);
  if (eConv) throw new Error(eConv.message);
}
