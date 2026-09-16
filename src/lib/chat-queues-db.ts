import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/chat-interno-db";

export interface ChatQueue {
  id: string;
  name: string;
  description: string;
  department: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatQueueAgent {
  id: string;
  queue_id: string;
  user_id: string;
  added_at: string;
}

export interface ChatQueueConversation {
  id: string;
  queue_id: string;
  room_id: string;
  status: "waiting" | "in_progress" | "finished";
  assigned_to: string | null;
  started_by: string | null;
  subject: string;
  created_at: string;
  assigned_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface QueueStats {
  waiting: number;
  in_progress: number;
  available_agents: number;
  avg_wait_minutes: number;
}

// ---- Queues CRUD ----

export async function listQueues(): Promise<ChatQueue[]> {
  const { data, error } = await supabase
    .from("chat_queues" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ChatQueue[];
}

export async function createQueue(input: {
  name: string;
  description: string;
  department: string;
  active: boolean;
}): Promise<ChatQueue> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("chat_queues" as any)
    .insert({
      name: input.name,
      description: input.description,
      department: input.department,
      active: input.active,
      created_by: userId,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ChatQueue;
}

export async function updateQueue(
  queueId: string,
  input: {
    name: string;
    description: string;
    department: string;
    active: boolean;
  },
): Promise<void> {
  const { error } = await supabase
    .from("chat_queues" as any)
    .update({
      name: input.name,
      description: input.description,
      department: input.department,
      active: input.active,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", queueId);
  if (error) throw error;
}

export async function deleteQueue(queueId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_queues" as any)
    .delete()
    .eq("id", queueId);
  if (error) throw error;
}

// ---- Queue Agents ----

export async function listQueueAgents(queueId: string): Promise<ChatQueueAgent[]> {
  const { data, error } = await supabase
    .from("chat_queue_agents" as any)
    .select("*")
    .eq("queue_id", queueId);
  if (error) throw error;
  return (data ?? []) as unknown as ChatQueueAgent[];
}

export async function listAllQueueAgents(): Promise<ChatQueueAgent[]> {
  const { data, error } = await supabase.from("chat_queue_agents" as any).select("*");
  if (error) throw error;
  return (data ?? []) as unknown as ChatQueueAgent[];
}

export async function addQueueAgent(queueId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_queue_agents" as any)
    .upsert({ queue_id: queueId, user_id: userId } as any, { onConflict: "queue_id,user_id" });
  if (error) throw error;
}

export async function removeQueueAgent(queueId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_queue_agents" as any)
    .delete()
    .eq("queue_id", queueId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setQueueAgents(queueId: string, userIds: string[]): Promise<void> {
  // Remove all current agents
  await supabase
    .from("chat_queue_agents" as any)
    .delete()
    .eq("queue_id", queueId);

  // Insert new agents
  if (userIds.length > 0) {
    const rows = userIds.map((uid) => ({ queue_id: queueId, user_id: uid }));
    const { error } = await supabase.from("chat_queue_agents" as any).insert(rows as any);
    if (error) throw error;
  }
}

// ---- Queue Conversations ----

export async function listQueueConversations(queueId: string): Promise<ChatQueueConversation[]> {
  const { data, error } = await supabase
    .from("chat_queue_conversations" as any)
    .select("*")
    .eq("queue_id", queueId)
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChatQueueConversation[];
}

export async function listAllActiveConversations(): Promise<ChatQueueConversation[]> {
  const { data, error } = await supabase
    .from("chat_queue_conversations" as any)
    .select("*")
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChatQueueConversation[];
}

export async function createQueueConversation(input: {
  queueId: string;
  roomId: string;
  subject: string;
}): Promise<ChatQueueConversation> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("chat_queue_conversations" as any)
    .insert({
      queue_id: input.queueId,
      room_id: input.roomId,
      subject: input.subject,
      started_by: userId,
      status: "waiting",
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ChatQueueConversation;
}

export async function assignConversation(conversationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("chat_queue_conversations" as any)
    .update({
      status: "in_progress",
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function transferConversation(
  conversationId: string,
  targetQueueId: string,
  targetAgentId?: string,
): Promise<void> {
  const payload: any = {
    queue_id: targetQueueId,
    updated_at: new Date().toISOString(),
  };
  if (targetAgentId) {
    payload.assigned_to = targetAgentId;
    payload.status = "in_progress";
    payload.assigned_at = new Date().toISOString();
  } else {
    payload.assigned_to = null;
    payload.status = "waiting";
    payload.assigned_at = null;
  }
  const { error } = await supabase
    .from("chat_queue_conversations" as any)
    .update(payload)
    .eq("id", conversationId);
  if (error) throw error;
}

export async function finishConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_queue_conversations" as any)
    .update({
      status: "finished",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

// ---- Stats ----

export function computeQueueStats(
  conversations: ChatQueueConversation[],
  agents: ChatQueueAgent[],
  onlineUserIds: string[],
): QueueStats {
  const waiting = conversations.filter((c) => c.status === "waiting");
  const inProgress = conversations.filter((c) => c.status === "in_progress");
  const agentUserIds = agents.map((a) => a.user_id);
  const availableAgents = agentUserIds.filter((uid) => onlineUserIds.includes(uid)).length;

  // Average wait time for waiting conversations
  let avgWaitMinutes = 0;
  if (waiting.length > 0) {
    const now = Date.now();
    const totalMs = waiting.reduce((sum, c) => {
      return sum + (now - new Date(c.created_at).getTime());
    }, 0);
    avgWaitMinutes = Math.round(totalMs / waiting.length / 60000);
  }

  return {
    waiting: waiting.length,
    in_progress: inProgress.length,
    available_agents: availableAgents,
    avg_wait_minutes: avgWaitMinutes,
  };
}
