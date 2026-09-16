import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hash,
  Lock,
  Send,
  Paperclip,
  SmilePlus,
  Pencil,
  Trash2,
  Check,
  X,
  Users,
  Circle,
  Search,
  ChevronLeft,
  Image as ImageIcon,
  FileText,
  MessageCircle,
  ListOrdered,
  
  Plus,
  LogOut,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useChatInterno } from "@/hooks/use-chat-interno";
import { GENERAL_ROOM_ID } from "@/lib/chat-interno-db";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChatQueues } from "@/components/ChatQueues";

import { ChatWhatsApp } from "@/components/ChatWhatsApp";
import { EvolutionGoStatusBadge } from "@/components/EvolutionGoStatusBadge";
import { useChatQueues } from "@/hooks/use-chat-queues";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const EMOJI_LIST = [
  "😀",
  "😂",
  "😍",
  "🥳",
  "😎",
  "🤔",
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🎉",
  "✅",
  "❌",
  "⚡",
  "💡",
  "📌",
  "🙏",
  "👋",
  "🤝",
  "💪",
];

function formatTime(iso: string) {
  try {
    return format(new Date(iso), "HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ChatInterno() {
  const {
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
    createTeam,
    leaveTeam,
    deleteTeam,
    isRoomAdmin,
  } = useChatInterno();

  const { totalWaiting } = useChatQueues(onlineUsers);

  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [inputText, setInputText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [filePreview, setFilePreview] = useState<File | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [showQueues, setShowQueues] = useState(false);
  const [showWhats, setShowWhats] = useState(false);
  const [activeModule, setActiveModule] = useState<"interno" | "whatsapp" | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [privateDialogOpen, setPrivateDialogOpen] = useState(false);
  const [privateSearch, setPrivateSearch] = useState("");
  const [startingPrivate, setStartingPrivate] = useState<string | null>(null);
  const [apagarPrivadaId, setApagarPrivadaId] = useState<string | null>(null);
  const [apagandoPrivada, setApagandoPrivada] = useState(false);

  const apagarConversaPrivada = async () => {
    if (!apagarPrivadaId) return;
    setApagandoPrivada(true);
    try {
      await deleteTeam(apagarPrivadaId);
      toast.success("Conversa apagada");
      setApagarPrivadaId(null);
    } catch {
      toast.error("Não foi possível apagar a conversa");
    } finally {
      setApagandoPrivada(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // On mobile, hide sidebar when room selected
  useEffect(() => {
    if (isMobile && activeRoomId) {
      setShowSidebar(false);
    }
  }, [activeRoomId, isMobile]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !filePreview) return;
    await send(text, filePreview ?? undefined);
    setInputText("");
    setFilePreview(null);
    setEmojiOpen(false);
  }, [inputText, filePreview, send]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFilePreview(file);
    }
    e.target.value = "";
  };

  const startEdit = (msgId: string, content: string) => {
    setEditingId(msgId);
    setEditText(content);
  };

  const confirmEdit = async () => {
    if (editingId && editText.trim()) {
      await edit(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  // Build a map: otherUserId → roomId for private rooms
  const privateRoomByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of rooms) {
      if (room.type !== "private") continue;
      const members = roomMembers[room.id] ?? [];
      const other = members.find((m) => m.user_id !== currentUserId);
      if (other) {
        map[other.user_id] = room.id;
      }
    }
    return map;
  }, [rooms, roomMembers, currentUserId]);

  // Unread count for a user's private room
  const unreadForUser = useCallback(
    (userId: string): number => {
      const roomId = privateRoomByUser[userId];
      if (!roomId) return 0;
      return unreadCounts[roomId] ?? 0;
    },
    [privateRoomByUser, unreadCounts],
  );

  // All users except current, sorted online first then alphabetical
  const sortedUsers = useMemo(() => {
    const allProfiles = Object.values(userProfiles).filter((p) => p.id !== currentUserId);

    // Filter by search
    const filtered = userSearch.trim()
      ? allProfiles.filter((p) => p.display_name.toLowerCase().includes(userSearch.toLowerCase()))
      : allProfiles;

    // Sort: online first, then alphabetical
    return filtered.sort((a, b) => {
      const aOnline = onlineUsers.includes(a.id);
      const bOnline = onlineUsers.includes(b.id);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.display_name.localeCompare(b.display_name, "pt-BR");
    });
  }, [userProfiles, currentUserId, onlineUsers, userSearch]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // Team (group) rooms other than the general one
  const teamRooms = useMemo(
    () =>
      rooms
        .filter((r) => r.type === "group" && r.id !== GENERAL_ROOM_ID)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [rooms],
  );

  // Existing private conversations
  const privateConversations = useMemo(
    () =>
      rooms
        .filter((r) => r.type === "private")
        .map((room) => {
          const members = roomMembers[room.id] ?? [];
          const other = members.find((m) => m.user_id !== currentUserId);
          return { room, otherUserId: other?.user_id ?? null };
        })
        .sort((a, b) => {
          const an = a.otherUserId
            ? (userProfiles[a.otherUserId]?.display_name ?? "")
            : a.room.name;
          const bn = b.otherUserId
            ? (userProfiles[b.otherUserId]?.display_name ?? "")
            : b.room.name;
          return an.localeCompare(bn, "pt-BR");
        }),
    [rooms, roomMembers, currentUserId, userProfiles],
  );

  const handleStartPrivate = useCallback(
    async (userId: string) => {
      setStartingPrivate(userId);
      try {
        setShowQueues(false);
        setShowWhats(false);
        await openPrivateChat(userId);
        setPrivateDialogOpen(false);
        setPrivateSearch("");
      } catch (err) {
        toast.error("Não foi possível iniciar a conversa", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setStartingPrivate(null);
      }
    },
    [openPrivateChat],
  );

  const handleCreateTeam = useCallback(async () => {
    const name = teamName.trim();
    if (!name) return;
    setCreatingTeam(true);
    try {
      await createTeam(name, teamMemberIds);
      setTeamDialogOpen(false);
      setTeamName("");
      setTeamMemberIds([]);
      setShowQueues(false);
      setShowWhats(false);
      toast.success("Equipe criada com sucesso");
    } catch (err) {
      toast.error("Não foi possível criar a equipe", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingTeam(false);
    }
  }, [teamName, teamMemberIds, createTeam]);

  // Get display name for a user
  const getDisplayName = useCallback(
    (userId: string): string => {
      return userProfiles[userId]?.display_name || userId.substring(0, 8) + "...";
    },
    [userProfiles],
  );

  // Get the other user's name for a private room header
  const getPrivateRoomName = useCallback(
    (room: typeof activeRoom): string => {
      if (!room || room.type !== "private") return room?.name ?? "";
      const members = roomMembers[room.id] ?? [];
      const other = members.find((m) => m.user_id !== currentUserId);
      if (other) return getDisplayName(other.user_id);
      return room.name;
    },
    [roomMembers, currentUserId, getDisplayName],
  );

  // Group messages by date
  const groupedMessages: { date: string; msgs: typeof messages }[] = [];
  let lastDate = "";
  for (const m of messages) {
    const d = formatDate(m.created_at);
    if (d !== lastDate) {
      groupedMessages.push({ date: d, msgs: [] });
      lastDate = d;
    }
    groupedMessages[groupedMessages.length - 1]?.msgs.push(m);
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="mx-auto size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center">
          <Users className="mx-auto size-12 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            Usuário não autenticado. Faça login para acessar o chat.
          </p>
        </div>
      </div>
    );
  }

  if (activeModule === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <button onClick={() => setActiveModule("interno")} className="text-left">
          <Card className="h-full transition-colors hover:border-teal-400/50 hover:bg-teal-500/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-teal-500/15">
                  <Users className="size-5 text-teal-400" />
                </div>
                <div>
                  <CardTitle>Chat Interno</CardTitle>
                  <CardDescription>Equipe, filas e conversas privadas</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Acesse o chat geral, filas de atendimento, equipes e mensagens privadas entre os
                usuários.
              </p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => setActiveModule("whatsapp")} className="text-left">
          <Card className="h-full transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15">
                  <MessageCircle className="size-5 text-emerald-400" />
                </div>
                <div>
                  <CardTitle>WhatsApp</CardTitle>
                  <CardDescription>Conversas via WhatsApp</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Atenda conversas do WhatsApp, sincronize mensagens e gerencie transferências entre
                atendentes.
              </p>
              <EvolutionGoStatusBadge />
            </CardContent>
          </Card>
        </button>
      </div>
    );
  }

  if (activeModule === "whatsapp") {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            title="Voltar"
            onClick={() => setActiveModule(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15">
            <MessageCircle className="size-4 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold">WhatsApp</p>
          <div className="ml-auto">
            <EvolutionGoStatusBadge />
          </div>
        </div>
        <EvolutionGoInstanciasPanel />
        <div className="flex-1 overflow-hidden">
          <ChatWhatsApp currentUserId={currentUserId} userProfiles={userProfiles} />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-card">
        {/* Sidebar */}
        {showSidebar && (
          <div
            className={`flex flex-col border-r border-border bg-card ${
              isMobile ? "absolute inset-0 z-20" : "w-80 shrink-0"
            }`}
          >
            {/* Sidebar header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  title="Voltar"
                  onClick={() => setActiveModule(null)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>

                <Users className="size-5 text-teal-400" />
                <span className="text-sm font-semibold">Chat Interno</span>
                {totalUnread > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">
                    {totalUnread}
                  </Badge>
                )}
              </div>

              {isMobile && (
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1 hover:bg-muted rounded-md"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Online count */}
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
              <Circle className="size-2 fill-emerald-400 text-emerald-400" />
              {onlineUsers.length} online
            </div>

            {/* General room button */}
            <div className="px-2 pb-1">
              <button
                onClick={() => {
                  setShowQueues(false);
                  setShowWhats(false);
                  setActiveRoomId(GENERAL_ROOM_ID);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  activeRoomId === GENERAL_ROOM_ID && !showQueues && !showWhats
                    ? "bg-teal-500/15 text-teal-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Hash className="size-4 shrink-0" />
                <span className="flex-1 truncate font-medium">Chat da Equipe</span>
                {(unreadCounts[GENERAL_ROOM_ID] ?? 0) > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {unreadCounts[GENERAL_ROOM_ID]}
                  </Badge>
                )}
              </button>
            </div>

            {/* Queues button */}
            <div className="px-2 pb-1">
              <button
                onClick={() => {
                  setShowQueues(true);
                  
                  setShowWhats(false);
                  setActiveRoomId(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  showQueues
                    ? "bg-teal-500/15 text-teal-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <ListOrdered className="size-4 shrink-0" />
                <span className="flex-1 truncate font-medium">Filas de Atendimento</span>
                {totalWaiting > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {totalWaiting}
                  </Badge>
                )}
              </button>
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Equipes
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTeamDialogOpen(true)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Nova equipe</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-0.5 px-2 pb-1">
              {teamRooms.length === 0 && (
                <p className="px-3 py-1 text-[11px] text-muted-foreground">Nenhuma equipe criada</p>
              )}
              {teamRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setShowQueues(false);
                    setShowWhats(false);
                    setActiveRoomId(room.id);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeRoomId === room.id && !showQueues && !showWhats
                      ? "bg-teal-500/15 text-teal-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <UsersRound className="size-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{room.name}</span>
                  {(unreadCounts[room.id] ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {unreadCounts[room.id]}
                    </Badge>
                  )}
                </button>
              ))}
            </div>

            {/* Private conversations */}
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Conversas privadas
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setPrivateSearch("");
                      setPrivateDialogOpen(true);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Iniciar conversa privada</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-0.5 px-2 pb-1">
              {privateConversations.length === 0 && (
                <p className="px-3 py-1 text-[11px] text-muted-foreground">
                  Nenhuma conversa privada
                </p>
              )}
              {privateConversations.map(({ room, otherUserId }) => (
                <div key={room.id} className="group relative">
                  <button
                    onClick={() => {
                      setShowQueues(false);
                      setShowWhats(false);
                      setActiveRoomId(room.id);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeRoomId === room.id && !showQueues && !showWhats
                        ? "bg-teal-500/15 text-teal-300"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Lock className="size-4 shrink-0" />
                    <span className="flex-1 truncate font-medium">
                      {otherUserId ? getDisplayName(otherUserId) : room.name}
                    </span>
                    {otherUserId && onlineUsers.includes(otherUserId) && (
                      <Circle className="size-2 fill-emerald-400 text-emerald-400" />
                    )}
                    {(unreadCounts[room.id] ?? 0) > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {unreadCounts[room.id]}
                      </Badge>
                    )}
                  </button>
                  <button
                    title="Apagar conversa"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApagarPrivadaId(room.id);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Usuários
              </p>
            </div>

            {/* User search */}
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuário..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {/* User list */}
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 px-2 py-1">
                {sortedUsers.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum usuário encontrado
                  </p>
                )}
                {sortedUsers.map((profile) => {
                  const isOnline = onlineUsers.includes(profile.id);
                  const privateRoomId = privateRoomByUser[profile.id];
                  const isActive =
                    privateRoomId === activeRoomId && !showQueues && !showWhats;
                  const unread = unreadForUser(profile.id);

                  return (
                    <button
                      key={profile.id}
                      onClick={() => {
                        setShowQueues(false);
                        setShowWhats(false);
                        openPrivateChat(profile.id);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-teal-500/15 text-teal-300"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {/* Avatar with status indicator */}
                      <div className="relative shrink-0">
                        <Avatar className="size-8">
                          <AvatarImage
                            src={profile.avatar_url ?? undefined}
                            alt={profile.display_name}
                          />
                          <AvatarFallback className="bg-muted text-xs font-medium">
                            {getInitials(profile.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full border-2 border-card ${
                            isOnline ? "bg-emerald-400" : "bg-gray-500"
                          }`}
                        />
                      </div>

                      {/* Name + status text */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{profile.display_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {isOnline ? "Online" : "Offline"}
                        </p>
                      </div>

                      {/* Unread badge */}
                      {unread > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                          {unread}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main area */}
        <div className="flex flex-1 flex-col">
          {/* Show queues view */}
          {showWhats ? (
            <ChatWhatsApp currentUserId={currentUserId} userProfiles={userProfiles} />
          ) : showQueues ? (
            <ChatQueues
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              userProfiles={userProfiles}
              onlineUsers={onlineUsers}
              onOpenRoom={(roomId) => {
                setShowQueues(false);
                setShowWhats(false);
                setActiveRoomId(roomId);
              }}
            />
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                {isMobile && (
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    <ChevronLeft className="size-5 text-muted-foreground" />
                  </button>
                )}
                {activeRoom ? (
                  <>
                    {activeRoom.type === "group" ? (
                      <div className="flex size-9 items-center justify-center rounded-full bg-teal-500/15">
                        <Hash className="size-5 text-teal-400" />
                      </div>
                    ) : (
                      (() => {
                        const members = roomMembers[activeRoom.id] ?? [];
                        const other = members.find((m) => m.user_id !== currentUserId);
                        const otherProfile = other ? userProfiles[other.user_id] : null;
                        const otherOnline = other ? onlineUsers.includes(other.user_id) : false;
                        return (
                          <div className="relative">
                            <Avatar className="size-9">
                              <AvatarImage
                                src={otherProfile?.avatar_url ?? undefined}
                                alt={otherProfile?.display_name ?? ""}
                              />
                              <AvatarFallback className="bg-muted text-xs font-medium">
                                {getInitials(otherProfile?.display_name ?? "?")}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full border-2 border-card ${
                                otherOnline ? "bg-emerald-400" : "bg-gray-500"
                              }`}
                            />
                          </div>
                        );
                      })()
                    )}
                    <div>
                      <p className="text-sm font-semibold">
                        {activeRoom.id === GENERAL_ROOM_ID
                          ? "Chat da Equipe"
                          : getPrivateRoomName(activeRoom)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeRoom.type === "group"
                          ? `${onlineUsers.length} membros online`
                          : (() => {
                              const members = roomMembers[activeRoom.id] ?? [];
                              const other = members.find((m) => m.user_id !== currentUserId);
                              if (other && onlineUsers.includes(other.user_id)) {
                                return "Online";
                              }
                              return "Offline";
                            })()}
                      </p>
                    </div>

                    {/* Team room actions */}
                    {activeRoom.type === "group" && activeRoom.id !== GENERAL_ROOM_ID && (
                      <div className="ml-auto flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={async () => {
                                try {
                                  await leaveTeam(activeRoom.id);
                                  toast.success("Você saiu da equipe");
                                } catch {
                                  toast.error("Não foi possível sair da equipe");
                                }
                              }}
                              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <LogOut className="size-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">Sair da equipe</p>
                          </TooltipContent>
                        </Tooltip>
                        {isRoomAdmin(activeRoom.id) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={async () => {
                                  try {
                                    await deleteTeam(activeRoom.id);
                                    toast.success("Equipe excluída");
                                  } catch {
                                    toast.error("Não foi possível excluir a equipe");
                                  }
                                }}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Excluir equipe</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
                )}
              </div>

              {/* Messages */}
              {activeRoomId ? (
                <ScrollArea className="flex-1 px-4 py-3">
                  {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <MessageCircle className="mx-auto size-10 text-muted-foreground/20" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          Nenhuma mensagem ainda. Comece a conversa!
                        </p>
                      </div>
                    </div>
                  )}
                  {groupedMessages.map((group) => (
                    <div key={group.date}>
                      <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {group.date}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      {group.msgs.map((msg) => {
                        const isOwn = msg.user_id === currentUserId;
                        const isOnline = onlineUsers.includes(msg.user_id);
                        const senderProfile = userProfiles[msg.user_id];
                        const senderName =
                          senderProfile?.display_name || msg.user_id.substring(0, 8) + "...";

                        if (msg.deleted) {
                          return (
                            <div
                              key={msg.id}
                              className={`mb-2 flex ${isOwn ? "justify-end" : "justify-start"}`}
                            >
                              <div className="max-w-[75%] rounded-xl bg-muted/50 px-3 py-2 text-xs italic text-muted-foreground">
                                Mensagem apagada
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            className={`group mb-2 flex ${isOwn ? "justify-end" : "justify-start"}`}
                          >
                            {/* Avatar for other users */}
                            {!isOwn && (
                              <div className="mr-2 mt-1 shrink-0">
                                <Avatar className="size-7">
                                  <AvatarImage
                                    src={senderProfile?.avatar_url ?? undefined}
                                    alt={senderName}
                                  />
                                  <AvatarFallback className="bg-muted text-[10px] font-medium">
                                    {getInitials(senderName)}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            )}

                            <div
                              className={`max-w-[75%] rounded-xl px-3 py-2 ${
                                isOwn
                                  ? "bg-teal-600/20 text-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {/* User name */}
                              {!isOwn && (
                                <div className="mb-1 flex items-center gap-1.5">
                                  <Circle
                                    className={`size-1.5 ${
                                      isOnline
                                        ? "fill-emerald-400 text-emerald-400"
                                        : "fill-gray-500 text-gray-500"
                                    }`}
                                  />
                                  <span className="text-[10px] font-medium text-muted-foreground">
                                    {senderName}
                                  </span>
                                </div>
                              )}

                              {/* Editing */}
                              {editingId === msg.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="h-7 text-xs"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") confirmEdit();
                                      if (e.key === "Escape") {
                                        setEditingId(null);
                                        setEditText("");
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={confirmEdit}
                                    className="p-1 text-emerald-400 hover:text-emerald-300"
                                  >
                                    <Check className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditText("");
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {/* Content */}
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.content}
                                  </p>

                                  {/* Attachment */}
                                  {msg.attachment_url && (
                                    <a
                                      href={msg.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1.5 flex items-center gap-1.5 rounded-md bg-black/20 px-2 py-1.5 text-xs text-teal-300 hover:text-teal-200 transition-colors"
                                    >
                                      {msg.attachment_type?.startsWith("image/") ? (
                                        <ImageIcon className="size-3.5" />
                                      ) : (
                                        <FileText className="size-3.5" />
                                      )}
                                      <span className="truncate">
                                        {msg.attachment_name ?? "Arquivo"}
                                      </span>
                                    </a>
                                  )}

                                  {/* Meta */}
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatTime(msg.created_at)}
                                    </span>
                                    {msg.edited && (
                                      <span className="text-[10px] italic text-muted-foreground">
                                        editada
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* Actions (own messages) */}
                              {isOwn && editingId !== msg.id && (
                                <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => startEdit(msg.id, msg.content)}
                                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                      >
                                        <Pencil className="size-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Editar</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => remove(msg.id)}
                                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted"
                                      >
                                        <Trash2 className="size-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Apagar</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </ScrollArea>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center">
                    <MessageCircle className="mx-auto size-12 text-muted-foreground/20" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Selecione uma conversa para começar
                    </p>
                  </div>
                </div>
              )}

              {/* Input area */}
              {activeRoomId && (
                <div className="border-t border-border px-4 py-3">
                  {/* File preview */}
                  {filePreview && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                      <Paperclip className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs">{filePreview.name}</span>
                      <button
                        onClick={() => setFilePreview(null)}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Emoji picker */}
                  {emojiOpen && (
                    <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-2">
                      {EMOJI_LIST.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setInputText((prev) => prev + emoji);
                            setEmojiOpen(false);
                          }}
                          className="rounded p-1 text-lg hover:bg-muted"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Paperclip className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">Anexar arquivo</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setEmojiOpen(!emojiOpen)}
                          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <SmilePlus className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">Emoji</p>
                      </TooltipContent>
                    </Tooltip>
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1"
                      disabled={sending}
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={sending || (!inputText.trim() && !filePreview)}
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* New team dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
            <DialogDescription>
              Crie um chat de equipe e selecione quem participa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nome da equipe (ex.: Operações)"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {Object.values(userProfiles)
                .filter((p) => p.id !== currentUserId)
                .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"))
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={teamMemberIds.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setTeamMemberIds((prev) =>
                          checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span className="flex-1 truncate">{p.display_name}</span>
                    {onlineUsers.includes(p.id) && (
                      <Circle className="size-2 fill-emerald-400 text-emerald-400" />
                    )}
                  </label>
                ))}
              {Object.values(userProfiles).filter((p) => p.id !== currentUserId).length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nenhum outro usuário cadastrado
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTeam} disabled={!teamName.trim() || creatingTeam}>
              {creatingTeam ? "Criando..." : "Criar equipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* New private conversation dialog */}
      <Dialog open={privateDialogOpen} onOpenChange={setPrivateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa privada</DialogTitle>
            <DialogDescription>Escolha um usuário para conversar em particular.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={privateSearch}
                onChange={(e) => setPrivateSearch(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {Object.values(userProfiles)
                .filter(
                  (p) =>
                    p.id !== currentUserId &&
                    (!privateSearch.trim() ||
                      p.display_name.toLowerCase().includes(privateSearch.toLowerCase())),
                )
                .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"))
                .map((p) => (
                  <button
                    key={p.id}
                    disabled={startingPrivate !== null}
                    onClick={() => handleStartPrivate(p.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={p.avatar_url ?? undefined} alt={p.display_name} />
                      <AvatarFallback className="bg-muted text-[10px] font-medium">
                        {getInitials(p.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{p.display_name}</span>
                    {onlineUsers.includes(p.id) && (
                      <Circle className="size-2 fill-emerald-400 text-emerald-400" />
                    )}
                    {startingPrivate === p.id && (
                      <span className="text-[11px] text-muted-foreground">abrindo...</span>
                    )}
                  </button>
                ))}
              {Object.values(userProfiles).filter((p) => p.id !== currentUserId).length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nenhum outro usuário cadastrado
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrivateDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apagarPrivadaId !== null} onOpenChange={(o) => !o && setApagarPrivadaId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar conversa</DialogTitle>
            <DialogDescription>
              Tem certeza? A conversa e todas as mensagens serão apagadas permanentemente. Essa ação
              não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApagarPrivadaId(null)} disabled={apagandoPrivada}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void apagarConversaPrivada()} disabled={apagandoPrivada}>
              {apagandoPrivada ? "Apagando..." : "Apagar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
