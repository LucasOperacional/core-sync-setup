import { supabase } from "@/integrations/supabase/client";
import { safeFileName } from "./privacy/redaction";

export interface ChatRoom {
  id: string;
  name: string;
  type: "group" | "private";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  edited: boolean;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRead {
  id: string;
  room_id: string;
  user_id: string;
  last_read_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string;
}

const GENERAL_ROOM_ID = "00000000-0000-0000-0000-000000000001";

export { GENERAL_ROOM_ID };

export async function getCurrentUserId(): Promise<string> {
  // A sessão pode ainda estar sendo restaurada quando a tela abre; tenta
  // algumas vezes antes de concluir que não há usuário autenticado.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: sessao } = await supabase.auth.getSession();
    const id = sessao.session?.user?.id;
    if (id) return id;
    await new Promise((r) => setTimeout(r, 300));
  }
  const { data } = await supabase.auth.getUser();
  if (!data?.user?.id) throw new Error("Usuário não autenticado");
  return data.user.id;
}

/** Ensure current user is a member of the general room */
export async function ensureGeneralMembership(): Promise<void> {
  const userId = await getCurrentUserId();
  await supabase
    .from("chat_room_members" as any)
    .upsert({ room_id: GENERAL_ROOM_ID, user_id: userId, role: "member" } as any, {
      onConflict: "room_id,user_id",
    });
}

/** Ensure current user has a profile row */
export async function ensureMyProfile(): Promise<UserProfile> {
  const userId = await getCurrentUserId();
  const { data: existing } = await supabase
    .from("user_profiles" as any)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return existing as unknown as UserProfile;

  // Get user info for display name
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  const meta = user?.user_metadata as { nome?: string; full_name?: string } | undefined;
  const displayName = meta?.nome ?? meta?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";

  const { data: created, error } = await supabase
    .from("user_profiles" as any)
    .upsert(
      { id: userId, display_name: displayName, last_seen_at: new Date().toISOString() } as any,
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) throw error;
  return created as unknown as UserProfile;
}

/** Update last_seen_at for current user */
export async function updateLastSeen(): Promise<void> {
  const userId = await getCurrentUserId();
  await supabase
    .from("user_profiles" as any)
    .update({ last_seen_at: new Date().toISOString() } as any)
    .eq("id", userId);
}

/** List all user profiles */
export async function listAllProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("user_profiles" as any)
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as UserProfile[];
}

export async function listMyRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase
    .from("chat_rooms" as any)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ChatRoom[];
}

export async function listRoomMembers(roomId: string): Promise<ChatRoomMember[]> {
  const { data, error } = await supabase
    .from("chat_room_members" as any)
    .select("*")
    .eq("room_id", roomId);
  if (error) throw error;
  return (data ?? []) as unknown as ChatRoomMember[];
}

export async function listMessages(roomId: string, limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages" as any)
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessage[];
}

export async function sendMessage(
  roomId: string,
  content: string,
  attachment?: {
    url: string;
    name: string;
    type: string;
  },
): Promise<ChatMessage> {
  const userId = await getCurrentUserId();
  const payload: any = {
    room_id: roomId,
    user_id: userId,
    content,
  };
  if (attachment) {
    payload.attachment_url = attachment.url;
    payload.attachment_name = attachment.name;
    payload.attachment_type = attachment.type;
  }
  const { data, error } = await supabase
    .from("chat_messages" as any)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ChatMessage;
}

export async function editMessage(messageId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("chat_messages" as any)
    .update({ content, edited: true, updated_at: new Date().toISOString() } as any)
    .eq("id", messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_messages" as any)
    .update({ deleted: true, content: "", updated_at: new Date().toISOString() } as any)
    .eq("id", messageId);
  if (error) throw error;
}

export async function markRoomAsRead(roomId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await supabase
    .from("chat_message_reads" as any)
    .upsert({ room_id: roomId, user_id: userId, last_read_at: new Date().toISOString() } as any, {
      onConflict: "room_id,user_id",
    });
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  const userId = await getCurrentUserId();

  // Get all reads
  const { data: reads } = await supabase
    .from("chat_message_reads" as any)
    .select("room_id, last_read_at")
    .eq("user_id", userId);

  const readMap: Record<string, string> = {};
  for (const r of (reads ?? []) as any[]) {
    readMap[r.room_id] = r.last_read_at;
  }

  // Get rooms
  const rooms = await listMyRooms();
  const counts: Record<string, number> = {};

  for (const room of rooms) {
    const lastRead = readMap[room.id];
    let query = supabase
      .from("chat_messages" as any)
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("deleted", false)
      .neq("user_id", userId);

    if (lastRead) {
      query = query.gt("created_at", lastRead);
    }

    const { count } = await query;
    if (count && count > 0) {
      counts[room.id] = count;
    }
  }

  return counts;
}

export async function findOrCreatePrivateRoom(otherUserId: string): Promise<ChatRoom> {
  const userId = await getCurrentUserId();

  // Find existing private room with both users
  const { data: myMemberships } = await supabase
    .from("chat_room_members" as any)
    .select("room_id")
    .eq("user_id", userId);

  const myRoomIds = ((myMemberships ?? []) as any[]).map((m: any) => m.room_id);

  if (myRoomIds.length > 0) {
    const { data: otherMemberships } = await supabase
      .from("chat_room_members" as any)
      .select("room_id")
      .eq("user_id", otherUserId)
      .in("room_id", myRoomIds);

    const commonRoomIds = ((otherMemberships ?? []) as any[]).map((m: any) => m.room_id);

    if (commonRoomIds.length > 0) {
      const { data: privateRooms } = await supabase
        .from("chat_rooms" as any)
        .select("*")
        .eq("type", "private")
        .in("id", commonRoomIds);

      if (privateRooms && privateRooms.length > 0) {
        return (privateRooms as any[])[0] as unknown as ChatRoom;
      }
    }
  }

  // Create new private room
  const { data: room, error } = await supabase
    .from("chat_rooms" as any)
    .insert({
      name: "Conversa Privada",
      type: "private",
      created_by: userId,
    } as any)
    .select()
    .single();

  if (error) throw error;
  const newRoom = room as unknown as ChatRoom;

  // Add both users
  await supabase.from("chat_room_members" as any).insert([
    { room_id: newRoom.id, user_id: userId, role: "admin" },
    { room_id: newRoom.id, user_id: otherUserId, role: "member" },
  ] as any);

  return newRoom;
}

/** Create a group room (team chat) with the given members */
export async function createGroupRoom(name: string, memberIds: string[]): Promise<ChatRoom> {
  const userId = await getCurrentUserId();
  const { data: room, error } = await supabase
    .from("chat_rooms" as any)
    .insert({ name, type: "group", created_by: userId } as any)
    .select()
    .single();
  if (error) throw error;
  const newRoom = room as unknown as ChatRoom;

  const unique = Array.from(new Set(memberIds.filter((id) => id !== userId)));
  const rows = [
    { room_id: newRoom.id, user_id: userId, role: "admin" },
    ...unique.map((uid) => ({ room_id: newRoom.id, user_id: uid, role: "member" })),
  ];
  const { error: memberError } = await supabase
    .from("chat_room_members" as any)
    .insert(rows as any);
  if (memberError) throw memberError;

  return newRoom;
}

/** Add members to an existing room */
export async function addRoomMembers(roomId: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const rows = memberIds.map((uid) => ({ room_id: roomId, user_id: uid, role: "member" }));
  const { error } = await supabase
    .from("chat_room_members" as any)
    .upsert(rows as any, { onConflict: "room_id,user_id" });
  if (error) throw error;
}

/** Leave a room (removes only the current user) */
export async function leaveRoom(roomId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("chat_room_members" as any)
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Delete a room entirely (room admins only, enforced by RLS) */
export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_rooms" as any)
    .delete()
    .eq("id", roomId);
  if (error) throw error;
}

/** True when the current user has the platform-wide "admin" role */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.rpc(
      "has_role" as any,
      {
        _user_id: userId,
        _role: "admin",
      } as any,
    );
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function uploadChatAttachment(
  roomId: string,
  file: File,
): Promise<{
  url: string;
  name: string;
  type: string;
}> {
  const userId = await getCurrentUserId();
  const ext = file.name.split(".").pop() || "bin";
  // Nome de arquivo sem dado pessoal (nunca o nome original do documento).
  const path = `${roomId}/${userId}/${safeFileName(ext, "anexo")}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, file);

  if (error) throw error;

  // Bucket privado: o acesso é sempre por URL assinada de curta duração.
  const { data: urlData, error: urlError } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60);
  if (urlError || !urlData) throw urlError ?? new Error("Não foi possível liberar o anexo.");

  return {
    url: urlData.signedUrl,
    name: file.name,
    type: file.type,
  };
}

/** Get the private room's other user id */
export function getPrivateRoomOtherUserId(
  room: ChatRoom,
  members: ChatRoomMember[],
  currentUserId: string,
): string | null {
  if (room.type !== "private") return null;
  const other = members.find((m) => m.user_id !== currentUserId);
  return other?.user_id ?? null;
}
