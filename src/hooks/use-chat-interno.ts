import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/use-presence";
import {
  type ChatRoom,
  type ChatMessage,
  type ChatRoomMember,
  type UserProfile,
  GENERAL_ROOM_ID,
  ensureGeneralMembership,
  ensureMyProfile,
  listAllProfiles,
  listMyRooms,
  listMessages,
  listRoomMembers,
  sendMessage as dbSendMessage,
  editMessage as dbEditMessage,
  deleteMessage as dbDeleteMessage,
  markRoomAsRead,
  getUnreadCounts,
  findOrCreatePrivateRoom,
  uploadChatAttachment,
  getCurrentUserId,
  createGroupRoom,
  addRoomMembers,
  leaveRoom,
  deleteRoom,
  isPlatformAdmin,
} from "@/lib/chat-interno-db";

export function useChatInterno() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomMembers, setRoomMembers] = useState<Record<string, ChatRoomMember[]>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // App-wide presence (user is online as soon as they open the app)
  const onlineUsers = usePresence();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Init: ensure membership, profile & load rooms
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const uid = await getCurrentUserId();
        if (cancelled) return;
        if (!uid) {
          setLoading(false);
          return;
        }
        setCurrentUserId(uid);

        await ensureMyProfile();
        await ensureGeneralMembership();

        isPlatformAdmin().then((admin) => {
          if (!cancelled) setIsAdmin(admin);
        });

        const [roomList, profiles, counts] = await Promise.all([
          listMyRooms(),
          listAllProfiles(),
          getUnreadCounts(),
        ]);

        if (cancelled) return;

        setRooms(roomList);

        const profileMap: Record<string, UserProfile> = {};
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
        setUserProfiles(profileMap);

        setUnreadCounts(counts);

        // Load members for all rooms (needed for private room mapping)
        const membersMap: Record<string, ChatRoomMember[]> = {};
        await Promise.all(
          roomList.map(async (room) => {
            try {
              const members = await listRoomMembers(room.id);
              membersMap[room.id] = members;
            } catch {
              membersMap[room.id] = [];
            }
          }),
        );
        if (!cancelled) setRoomMembers(membersMap);

        // Auto-select general room
        if (!cancelled) {
          setActiveRoomId(GENERAL_ROOM_ID);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("[ChatInterno] init error:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Global realtime subscription for unread counts (all rooms)
  useEffect(() => {
    if (!currentUserId) return;

    const globalChannel = supabase
      .channel("chat-global-messages")
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload: any) => {
          const newMsg = payload.new as ChatMessage;
          // Don't count own messages
          if (newMsg.user_id === currentUserIdRef.current) return;
          // Don't count if this room is currently active (will be marked as read)
          if (newMsg.room_id === activeRoomIdRef.current) return;
          // Increment unread
          setUnreadCounts((prev) => ({
            ...prev,
            [newMsg.room_id]: (prev[newMsg.room_id] ?? 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalChannel);
    };
  }, [currentUserId]);

  // Load messages & subscribe to realtime when activeRoomId changes
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const msgs = await listMessages(activeRoomId!);
        if (!cancelled) setMessages(msgs);
        await markRoomAsRead(activeRoomId!);
        if (!cancelled) {
          setUnreadCounts((prev) => {
            const next = { ...prev };
            delete next[activeRoomId!];
            return next;
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("[ChatInterno] load messages error:", err);
        }
      }
    }

    load();

    // Realtime subscription for this room
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat-room-${activeRoomId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Mark as read since room is active
          markRoomAsRead(activeRoomId!).catch(() => {});
        },
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload: any) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeRoomId]);

  const refreshRooms = useCallback(async () => {
    try {
      const [roomList, profiles, counts] = await Promise.all([
        listMyRooms(),
        listAllProfiles(),
        getUnreadCounts(),
      ]);
      setRooms(roomList);
      setUnreadCounts(counts);

      const profileMap: Record<string, UserProfile> = {};
      for (const p of profiles) {
        profileMap[p.id] = p;
      }
      setUserProfiles(profileMap);

      const membersMap: Record<string, ChatRoomMember[]> = {};
      await Promise.all(
        roomList.map(async (room) => {
          try {
            const members = await listRoomMembers(room.id);
            membersMap[room.id] = members;
          } catch {
            membersMap[room.id] = [];
          }
        }),
      );
      setRoomMembers(membersMap);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[ChatInterno] refresh rooms error:", err);
      }
    }
  }, []);

  // Keep the room/team list in sync in realtime
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`chat-rooms-rt:${currentUserId}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "chat_rooms" }, () => {
        void refreshRooms();
      })
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "chat_room_members" },
        () => {
          void refreshRooms();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshRooms]);

  const send = useCallback(
    async (content: string, file?: File) => {
      if (!activeRoomId || sending) return;
      if (!currentUserId) return;
      setSending(true);
      try {
        let attachment: { url: string; name: string; type: string } | undefined;
        if (file) {
          attachment = await uploadChatAttachment(activeRoomId, file);
        }
        await dbSendMessage(activeRoomId, content, attachment);
        await markRoomAsRead(activeRoomId);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("[ChatInterno] send error:", err);
        }
      } finally {
        setSending(false);
      }
    },
    [activeRoomId, sending, currentUserId],
  );

  const edit = useCallback(async (messageId: string, content: string) => {
    try {
      await dbEditMessage(messageId, content);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[ChatInterno] edit error:", err);
      }
    }
  }, []);

  const remove = useCallback(async (messageId: string) => {
    try {
      await dbDeleteMessage(messageId);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[ChatInterno] delete error:", err);
      }
    }
  }, []);

  const openPrivateChat = useCallback(
    async (otherUserId: string) => {
      try {
        const room = await findOrCreatePrivateRoom(otherUserId);
        await refreshRooms();
        setActiveRoomId(room.id);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("[ChatInterno] openPrivateChat error:", err);
        }
      }
    },
    [refreshRooms],
  );

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const createTeam = useCallback(
    async (name: string, memberIds: string[]) => {
      const room = await createGroupRoom(name, memberIds);
      await refreshRooms();
      setActiveRoomId(room.id);
      return room;
    },
    [refreshRooms],
  );

  const addMembers = useCallback(
    async (roomId: string, memberIds: string[]) => {
      await addRoomMembers(roomId, memberIds);
      await refreshRooms();
    },
    [refreshRooms],
  );

  const leaveTeam = useCallback(
    async (roomId: string) => {
      await leaveRoom(roomId);
      setActiveRoomId(GENERAL_ROOM_ID);
      await refreshRooms();
    },
    [refreshRooms],
  );

  const deleteTeam = useCallback(
    async (roomId: string) => {
      await deleteRoom(roomId);
      setActiveRoomId(GENERAL_ROOM_ID);
      await refreshRooms();
    },
    [refreshRooms],
  );

  const isRoomAdmin = useCallback(
    (roomId: string) => {
      const members = roomMembers[roomId] ?? [];
      return members.some((m) => m.user_id === currentUserId && m.role === "admin");
    },
    [roomMembers, currentUserId],
  );

  return {
    rooms,
    roomMembers,
    activeRoomId,
    setActiveRoomId,
    messages,
    unreadCounts,
    totalUnread,
    onlineUsers,
    userProfiles,
    loading,
    sending,
    currentUserId,
    isAdmin,
    send,
    edit,
    remove,
    openPrivateChat,
    refreshRooms,
    createTeam,
    addMembers,
    leaveTeam,
    deleteTeam,
    isRoomAdmin,
  };
}
