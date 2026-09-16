import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ChatQueue,
  type ChatQueueAgent,
  type ChatQueueConversation,
  type QueueStats,
  listQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  listAllQueueAgents,
  setQueueAgents,
  listAllActiveConversations,
  createQueueConversation,
  assignConversation,
  transferConversation,
  finishConversation,
  computeQueueStats,
} from "@/lib/chat-queues-db";
import { addRoomMembers, createGroupRoom } from "@/lib/chat-interno-db";

export function useChatQueues(onlineUsers: string[]) {
  const [queues, setQueues] = useState<ChatQueue[]>([]);
  const [allAgents, setAllAgents] = useState<ChatQueueAgent[]>([]);
  const [allConversations, setAllConversations] = useState<ChatQueueConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [q, ag, conv] = await Promise.all([
        listQueues(),
        listAllQueueAgents(),
        listAllActiveConversations(),
      ]);
      if (!mountedRef.current) return;
      setQueues(q);
      setAllAgents(ag);
      setAllConversations(conv);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[ChatQueues] refresh error:", err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  // Realtime subscriptions
  useEffect(() => {
    // Each effect instance needs its own topic. React Strict Mode can mount the
    // effect again before removeChannel has finished removing the old channel;
    // reusing a fixed topic would return the already-subscribed channel and
    // Supabase then rejects additional postgres_changes callbacks.
    const channel = supabase.channel(`chat-queues-rt:${crypto.randomUUID()}`);

    channel
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "chat_queues" }, () => {
        refresh();
      })
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "chat_queue_agents" },
        () => {
          refresh();
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "chat_queue_conversations" },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Helpers
  const agentsForQueue = useCallback(
    (queueId: string) => allAgents.filter((a) => a.queue_id === queueId),
    [allAgents],
  );

  const conversationsForQueue = useCallback(
    (queueId: string) => allConversations.filter((c) => c.queue_id === queueId),
    [allConversations],
  );

  const statsForQueue = useCallback(
    (queueId: string): QueueStats => {
      return computeQueueStats(
        conversationsForQueue(queueId),
        agentsForQueue(queueId),
        onlineUsers,
      );
    },
    [conversationsForQueue, agentsForQueue, onlineUsers],
  );

  const totalWaiting = allConversations.filter((c) => c.status === "waiting").length;

  const doCreateQueue = useCallback(
    async (input: {
      name: string;
      description: string;
      department: string;
      active: boolean;
      agentIds: string[];
    }) => {
      const queue = await createQueue(input);
      if (input.agentIds.length > 0) {
        await setQueueAgents(queue.id, input.agentIds);
      }
      await refresh();
      return queue;
    },
    [refresh],
  );

  const doUpdateQueue = useCallback(
    async (
      queueId: string,
      input: {
        name: string;
        description: string;
        department: string;
        active: boolean;
        agentIds: string[];
      },
    ) => {
      await updateQueue(queueId, input);
      await setQueueAgents(queueId, input.agentIds);
      await refresh();
    },
    [refresh],
  );

  const doDeleteQueue = useCallback(
    async (queueId: string) => {
      await deleteQueue(queueId);
      await refresh();
    },
    [refresh],
  );

  const doCreateConversation = useCallback(
    async (input: { queueId: string; roomId: string; subject: string }) => {
      const conv = await createQueueConversation(input);
      await refresh();
      return conv;
    },
    [refresh],
  );

  const doAssign = useCallback(
    async (conversationId: string) => {
      await assignConversation(conversationId);
      await refresh();
    },
    [refresh],
  );

  const doTransfer = useCallback(
    async (conversationId: string, targetQueueId: string, targetAgentId?: string) => {
      await transferConversation(conversationId, targetQueueId, targetAgentId);
      // Make sure the agents of the target queue can access the conversation room
      const conv = allConversations.find((c) => c.id === conversationId);
      if (conv) {
        const targetAgents = allAgents
          .filter((a) => a.queue_id === targetQueueId)
          .map((a) => a.user_id);
        const ids = targetAgentId ? [...targetAgents, targetAgentId] : targetAgents;
        if (ids.length > 0) await addRoomMembers(conv.room_id, ids);
      }
      await refresh();
    },
    [refresh, allConversations, allAgents],
  );

  /** Open a new attendance request in a queue: creates the chat room + conversation */
  const requestAttendance = useCallback(
    async (queueId: string, subject: string) => {
      const queue = queues.find((q) => q.id === queueId);
      const agentIds = allAgents.filter((a) => a.queue_id === queueId).map((a) => a.user_id);
      const room = await createGroupRoom(`Atendimento · ${queue?.name ?? "Fila"}`, agentIds);
      const conv = await createQueueConversation({
        queueId,
        roomId: room.id,
        subject: subject.trim() || `Atendimento em ${queue?.name ?? "fila"}`,
      });
      await refresh();
      return { conversation: conv, roomId: room.id };
    },
    [queues, allAgents, refresh],
  );

  const doFinish = useCallback(
    async (conversationId: string) => {
      await finishConversation(conversationId);
      await refresh();
    },
    [refresh],
  );

  return {
    queues,
    allAgents,
    allConversations,
    loading,
    totalWaiting,
    agentsForQueue,
    conversationsForQueue,
    statsForQueue,
    refresh,
    createQueue: doCreateQueue,
    updateQueue: doUpdateQueue,
    deleteQueue: doDeleteQueue,
    createConversation: doCreateConversation,
    requestAttendance,
    assignConversation: doAssign,
    transferConversation: doTransfer,
    finishConversation: doFinish,
  };
}
