import { supabase } from "@/integrations/supabase/client";

export interface AiConversation {
  id: string;
  user_id: string;
  title: string;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  status: string;
  created_at: string;
}

export async function listConversations(): Promise<AiConversation[]> {
  const { data, error } = await supabase
    .from("ai_conversations" as any)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AiConversation[];
}

export async function createConversation(title?: string): Promise<AiConversation> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("ai_conversations" as any)
    .insert({ user_id: userId, title: title ?? "Nova conversa" } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as AiConversation;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations" as any)
    .update({ title, updated_at: new Date().toISOString() } as any)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations" as any)
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function listMessages(conversationId: string): Promise<AiMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages" as any)
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AiMessage[];
}

export async function saveMessage(msg: {
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  status?: string;
}): Promise<AiMessage> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("ai_messages" as any)
    .insert({
      conversation_id: msg.conversation_id,
      user_id: userId,
      role: msg.role,
      content: msg.content,
      provider: msg.provider ?? null,
      model: msg.model ?? null,
      status: msg.status ?? "sent",
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as AiMessage;
}

export async function updateMessageStatus(
  id: string,
  status: string,
  content?: string,
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (content !== undefined) updates["content"] = content;

  const { error } = await supabase
    .from("ai_messages" as any)
    .update(updates as any)
    .eq("id", id);

  if (error) throw error;
}

export async function updateConversationProvider(id: string, provider: string): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations" as any)
    .update({ provider, updated_at: new Date().toISOString() } as any)
    .eq("id", id);

  if (error) throw error;
}
