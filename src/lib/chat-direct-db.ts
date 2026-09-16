import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/chat-interno-db";

export type DirectStatus = "aberta" | "em_atendimento" | "finalizada";

export interface DirectConversation {
  id: string;
  nexti_person_id: number;
  contato_nome: string;
  contato_matricula: string | null;
  contato_posto: string | null;
  contato_cargo: string | null;
  status: DirectStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  user_id: string | null;
  autor: "agente" | "contato" | "sistema";
  content: string;
  created_at: string;
  nexti_message_id?: string | null;
  entregue?: boolean | null;
  erro_envio?: string | null;
}

export interface DirectTransfer {
  id: string;
  conversation_id: string;
  de_user_id: string | null;
  para_user_id: string | null;
  motivo: string | null;
  created_at: string;
}

/**
 * Carrega TODAS as conversas do Direct, em páginas, para que nenhuma fique de fora.
 */
export async function listDirectConversations(maximo = 20000): Promise<DirectConversation[]> {
  const pagina = 1000;
  const todas: DirectConversation[] = [];

  for (let inicio = 0; inicio < maximo; inicio += pagina) {
    const { data, error } = await supabase
      .from("chat_direct_conversations" as any)
      .select("*")
      .order("contato_posto", { ascending: true, nullsFirst: false })
      .order("contato_nome", { ascending: true })
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as DirectConversation[];
    todas.push(...lote);
    if (lote.length < pagina) break;
  }

  return todas;
}

export async function listDirectMessages(conversationId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from("chat_direct_messages" as any)
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as DirectMessage[];
}

export async function sendDirectMessage(conversationId: string, content: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("chat_direct_messages" as any).insert({
    conversation_id: conversationId,
    user_id: userId,
    autor: "agente",
    content,
  } as any);
  if (error) throw error;
  await supabase
    .from("chat_direct_conversations" as any)
    .update({ last_message_at: new Date().toISOString() } as any)
    .eq("id", conversationId);
}

export async function assumirDirect(conversationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("chat_direct_conversations" as any)
    .update({
      status: "em_atendimento",
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function finalizarDirect(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_direct_conversations" as any)
    .update({ status: "finalizada" } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function transferirDirect(
  conversationId: string,
  paraUserId: string | null,
  motivo?: string,
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("chat_direct_conversations" as any)
    .update({
      assigned_to: paraUserId,
      status: paraUserId ? "em_atendimento" : "aberta",
      assigned_at: paraUserId ? new Date().toISOString() : null,
    } as any)
    .eq("id", conversationId);
  if (error) throw error;

  await supabase.from("chat_direct_transfers" as any).insert({
    conversation_id: conversationId,
    de_user_id: userId,
    para_user_id: paraUserId,
    motivo: motivo ?? null,
  } as any);

  await supabase.from("chat_direct_messages" as any).insert({
    conversation_id: conversationId,
    user_id: userId,
    autor: "sistema",
    content: paraUserId
      ? `Conversa transferida${motivo ? ` — ${motivo}` : ""}.`
      : `Conversa devolvida para a fila${motivo ? ` — ${motivo}` : ""}.`,
  } as any);
}

export async function listDirectTransfers(conversationId: string): Promise<DirectTransfer[]> {
  const { data, error } = await supabase
    .from("chat_direct_transfers" as any)
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as DirectTransfer[];
}
