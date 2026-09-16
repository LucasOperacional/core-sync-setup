import { useCallback, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  Clock,
  MessageCircle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  Circle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useChatQueues } from "@/hooks/use-chat-queues";
import type { UserProfile } from "@/lib/chat-interno-db";
import type { ChatQueue, ChatQueueConversation } from "@/lib/chat-queues-db";

const DEPARTAMENTOS = [
  "Administrativo",
  "Comercial",
  "Compras",
  "Contabilidade",
  "Diretoria",
  "Financeiro",
  "Jurídico",
  "Logística",
  "Marketing",
  "Operacional",
  "Recursos Humanos",
  "Supervisão",
  "Tecnologia da Informação",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function formatMinutes(mins: number): string {
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

interface ChatQueuesProps {
  isAdmin: boolean;
  currentUserId: string;
  userProfiles: Record<string, UserProfile>;
  onlineUsers: string[];
  onOpenRoom?: (roomId: string) => void;
}

export function ChatQueues({
  isAdmin,
  currentUserId,
  userProfiles,
  onlineUsers,
  onOpenRoom,
}: ChatQueuesProps) {
  const {
    queues,
    allAgents,
    allConversations,
    loading,
    agentsForQueue,
    conversationsForQueue,
    statsForQueue,
    createQueue,
    updateQueue,
    deleteQueue: doDeleteQueue,
    assignConversation,
    transferConversation,
    finishConversation,
    requestAttendance,
  } = useChatQueues(onlineUsers);

  // Request attendance
  const [requestSubject, setRequestSubject] = useState("");
  const [requesting, setRequesting] = useState(false);

  // View state
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Create/Edit dialog
  const [showForm, setShowForm] = useState(false);
  const [editingQueue, setEditingQueue] = useState<ChatQueue | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formAgentIds, setFormAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ChatQueue | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Transfer dialog
  const [transferConv, setTransferConv] = useState<ChatQueueConversation | null>(null);
  const [transferQueueId, setTransferQueueId] = useState("");
  const [transferAgentId, setTransferAgentId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const selectedQueue = queues.find((q) => q.id === selectedQueueId);

  const allProfilesList = useMemo(
    () => Object.values(userProfiles).filter((p) => p.id !== currentUserId),
    [userProfiles, currentUserId],
  );

  const filteredProfiles = useMemo(() => {
    if (!agentSearch.trim()) return allProfilesList;
    const s = agentSearch.toLowerCase();
    return allProfilesList.filter((p) => p.display_name.toLowerCase().includes(s));
  }, [allProfilesList, agentSearch]);

  const getDisplayName = useCallback(
    (userId: string) => userProfiles[userId]?.display_name || userId.substring(0, 8) + "...",
    [userProfiles],
  );

  // Check if current user is an agent of the selected queue
  const isAgentOfSelected = useMemo(() => {
    if (!selectedQueueId) return false;
    return agentsForQueue(selectedQueueId).some((a) => a.user_id === currentUserId);
  }, [selectedQueueId, agentsForQueue, currentUserId]);

  // ---- Form handlers ----

  function openCreate() {
    setEditingQueue(null);
    setFormName("");
    setFormDesc("");
    setFormDept("");
    setFormActive(true);
    setFormAgentIds([]);
    setAgentSearch("");
    setShowForm(true);
  }

  function openEdit(queue: ChatQueue) {
    setEditingQueue(queue);
    setFormName(queue.name);
    setFormDesc(queue.description);
    setFormDept(queue.department);
    setFormActive(queue.active);
    const agents = agentsForQueue(queue.id);
    setFormAgentIds(agents.map((a) => a.user_id));
    setAgentSearch("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Nome da fila é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: formName.trim(),
        description: formDesc.trim(),
        department: formDept,
        active: formActive,
        agentIds: formAgentIds,
      };
      if (editingQueue) {
        await updateQueue(editingQueue.id, input);
        toast.success("Fila atualizada.");
      } else {
        await createQueue(input);
        toast.success("Fila criada.");
      }
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar fila.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await doDeleteQueue(deleteTarget.id);
      toast.success("Fila excluída.");
      if (selectedQueueId === deleteTarget.id) setSelectedQueueId(null);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir fila.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAssign(convId: string) {
    try {
      await assignConversation(convId);
      toast.success("Conversa assumida.");
      const conv = allConversations.find((c) => c.id === convId);
      if (conv) onOpenRoom?.(conv.room_id);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao assumir conversa.");
    }
  }

  async function handleRequestAttendance(queueId: string) {
    setRequesting(true);
    try {
      const { roomId } = await requestAttendance(queueId, requestSubject);
      setRequestSubject("");
      toast.success("Atendimento solicitado.");
      onOpenRoom?.(roomId);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao solicitar atendimento.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleFinish(convId: string) {
    try {
      await finishConversation(convId);
      toast.success("Atendimento finalizado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao finalizar.");
    }
  }

  async function handleTransfer() {
    if (!transferConv || !transferQueueId) return;
    setTransferring(true);
    try {
      await transferConversation(transferConv.id, transferQueueId, transferAgentId || undefined);
      toast.success("Conversa transferida.");
      setTransferConv(null);
      setTransferQueueId("");
      setTransferAgentId("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao transferir.");
    } finally {
      setTransferring(false);
    }
  }

  function toggleAgent(userId: string) {
    setFormAgentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- Detail view ----
  if (selectedQueue) {
    const stats = statsForQueue(selectedQueue.id);
    const conversations = conversationsForQueue(selectedQueue.id);
    const agents = agentsForQueue(selectedQueue.id);
    const waitingConvs = conversations.filter((c) => c.status === "waiting");
    const inProgressConvs = conversations.filter((c) => c.status === "in_progress");

    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={() => setSelectedQueueId(null)}
            className="rounded-md p-1 hover:bg-muted"
          >
            <ChevronLeft className="size-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{selectedQueue.name}</h3>
              <Badge
                variant={selectedQueue.active ? "default" : "secondary"}
                className="text-[10px]"
              >
                {selectedQueue.active ? "Ativa" : "Inativa"}
              </Badge>
            </div>
            {selectedQueue.department && (
              <p className="text-[10px] text-muted-foreground">{selectedQueue.department}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => openEdit(selectedQueue)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(selectedQueue)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2 border-b border-border px-4 py-3">
          <div className="text-center">
            <p className="text-lg font-bold text-amber-500">{stats.waiting}</p>
            <p className="text-[10px] text-muted-foreground">Aguardando</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-500">{stats.in_progress}</p>
            <p className="text-[10px] text-muted-foreground">Em andamento</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-500">{stats.available_agents}</p>
            <p className="text-[10px] text-muted-foreground">Atendentes on</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-muted-foreground">
              {formatMinutes(stats.avg_wait_minutes)}
            </p>
            <p className="text-[10px] text-muted-foreground">Espera média</p>
          </div>
        </div>

        {/* Agents list */}
        <div className="border-b border-border px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Atendentes ({agents.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {agents.map((ag) => {
              const profile = userProfiles[ag.user_id];
              const isOn = onlineUsers.includes(ag.user_id);
              return (
                <div
                  key={ag.id}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"
                >
                  <div className="relative">
                    <Avatar className="size-5">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {getInitials(profile?.display_name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full border border-muted ${
                        isOn ? "bg-emerald-400" : "bg-gray-500"
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-medium">{profile?.display_name ?? "?"}</span>
                </div>
              );
            })}
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum atendente</p>
            )}
          </div>
        </div>

        {/* Request attendance */}
        {selectedQueue.active && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Input
              placeholder="Assunto do atendimento"
              value={requestSubject}
              onChange={(e) => setRequestSubject(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 shrink-0 text-xs"
              disabled={requesting}
              onClick={() => handleRequestAttendance(selectedQueue.id)}
            >
              {requesting ? "Solicitando..." : "Solicitar atendimento"}
            </Button>
          </div>
        )}

        {/* Conversations */}
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-3">
            {waitingConvs.length === 0 && inProgressConvs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <MessageCircle className="size-8 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa na fila</p>
              </div>
            )}

            {waitingConvs.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 px-1 pt-1">
                  Aguardando ({waitingConvs.length})
                </p>
                {waitingConvs.map((conv) => {
                  const waitMs = Date.now() - new Date(conv.created_at).getTime();
                  const waitMin = Math.round(waitMs / 60000);
                  return (
                    <div
                      key={conv.id}
                      className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conv.subject || "Conversa sem assunto"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="size-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            Aguardando há {formatMinutes(waitMin)}
                          </span>
                          {conv.started_by && (
                            <span className="text-[10px] text-muted-foreground">
                              • {getDisplayName(conv.started_by)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {onOpenRoom && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => onOpenRoom(conv.room_id)}
                          >
                            Abrir
                          </Button>
                        )}
                        {(isAdmin || isAgentOfSelected) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleAssign(conv.id)}
                          >
                            Assumir
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              setTransferConv(conv);
                              setTransferQueueId("");
                              setTransferAgentId("");
                            }}
                          >
                            <ArrowRightLeft className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {inProgressConvs.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 px-1 pt-3">
                  Em andamento ({inProgressConvs.length})
                </p>
                {inProgressConvs.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conv.subject || "Conversa sem assunto"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Circle className="size-2 fill-blue-400 text-blue-400" />
                        <span className="text-[10px] text-muted-foreground">
                          Atendente: {conv.assigned_to ? getDisplayName(conv.assigned_to) : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {onOpenRoom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => onOpenRoom(conv.room_id)}
                        >
                          Abrir
                        </Button>
                      )}
                      {(isAdmin || conv.assigned_to === currentUserId) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-emerald-600 border-emerald-500/30"
                          onClick={() => handleFinish(conv.id)}
                        >
                          <CheckCircle2 className="mr-1 size-3" />
                          Finalizar
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            setTransferConv(conv);
                            setTransferQueueId("");
                            setTransferAgentId("");
                          }}
                        >
                          <ArrowRightLeft className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Transfer dialog */}
        <Dialog open={!!transferConv} onOpenChange={(open) => !open && setTransferConv(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Transferir Conversa</DialogTitle>
              <DialogDescription>
                Selecione a fila de destino e, opcionalmente, o atendente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Fila de destino</Label>
                <Select value={transferQueueId} onValueChange={setTransferQueueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a fila" />
                  </SelectTrigger>
                  <SelectContent>
                    {queues
                      .filter((q) => q.active)
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {transferQueueId && (
                <div className="grid gap-2">
                  <Label>Atendente (opcional)</Label>
                  <Select value={transferAgentId} onValueChange={setTransferAgentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum (volta para espera)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Nenhum (volta para espera)</SelectItem>
                      {agentsForQueue(transferQueueId).map((ag) => (
                        <SelectItem key={ag.user_id} value={ag.user_id}>
                          {getDisplayName(ag.user_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTransferConv(null)}
                disabled={transferring}
              >
                Cancelar
              </Button>
              <Button onClick={handleTransfer} disabled={transferring || !transferQueueId}>
                {transferring && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Transferir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir fila</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a fila "{deleteTarget?.name}"? Todas as conversas
                associadas serão removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create/Edit form dialog */}
        {renderFormDialog()}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-teal-400" />
          <span className="text-sm font-semibold">Filas de Atendimento</span>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openCreate}>
            <Plus className="mr-1 size-3" />
            Nova fila
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {queues.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="size-10 text-muted-foreground/20" />
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma fila cadastrada</p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
                  <Plus className="mr-1 size-3.5" />
                  Criar primeira fila
                </Button>
              )}
            </div>
          )}

          {queues.map((queue) => {
            const stats = statsForQueue(queue.id);
            const agents = agentsForQueue(queue.id);

            return (
              <button
                key={queue.id}
                onClick={() => setSelectedQueueId(queue.id)}
                className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-teal-500/30 hover:bg-teal-500/5"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold truncate">{queue.name}</h4>
                      <Badge
                        variant={queue.active ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {queue.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                    {queue.department && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{queue.department}</p>
                    )}
                    {queue.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {queue.description}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5 shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(queue);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(queue);
                        }}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-center">
                    <p className="text-sm font-bold text-amber-500">{stats.waiting}</p>
                    <p className="text-[9px] text-muted-foreground">Aguardando</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-blue-500">{stats.in_progress}</p>
                    <p className="text-[9px] text-muted-foreground">Andamento</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-emerald-500">{stats.available_agents}</p>
                    <p className="text-[9px] text-muted-foreground">Online</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-muted-foreground">
                      {formatMinutes(stats.avg_wait_minutes)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Espera</p>
                  </div>
                </div>

                {/* Agents preview */}
                <div className="mt-2 flex items-center gap-1">
                  <Users className="size-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {agents.length} atendente{agents.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fila</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a fila "{deleteTarget?.name}"? Todas as conversas
              associadas serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renderFormDialog()}
    </div>
  );

  // ---- Form dialog (shared) ----
  function renderFormDialog() {
    return (
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) setShowForm(false);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQueue ? "Editar Fila" : "Nova Fila"}</DialogTitle>
            <DialogDescription>
              {editingQueue
                ? "Altere as informações da fila de atendimento."
                : "Preencha os dados para criar uma nova fila de atendimento."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="q-name">
                Nome da fila <span className="text-destructive">*</span>
              </Label>
              <Input
                id="q-name"
                placeholder="Ex: Suporte Técnico"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-desc">Descrição</Label>
              <Textarea
                id="q-desc"
                placeholder="Descrição da fila..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-dept">Departamento</Label>
              <Select value={formDept} onValueChange={setFormDept}>
                <SelectTrigger id="q-dept">
                  <SelectValue placeholder="Selecione o departamento" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-muted-foreground">
                  {formActive ? "Fila ativa" : "Fila inativa"}
                </p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>

            {/* Agent selection */}
            <div className="grid gap-2">
              <Label>Atendentes</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuários..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Selected agents */}
              {formAgentIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formAgentIds.map((uid) => {
                    const p = userProfiles[uid];
                    return (
                      <div
                        key={uid}
                        className="flex items-center gap-1.5 rounded-full bg-teal-500/15 pl-2.5 pr-1.5 py-1 text-[11px] font-medium text-teal-300"
                      >
                        {p?.display_name ?? uid.substring(0, 8)}
                        <button
                          onClick={() => toggleAgent(uid)}
                          className="rounded-full p-0.5 hover:bg-teal-500/30"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* User list */}
              <ScrollArea className="max-h-40 rounded-lg border border-border">
                <div className="space-y-0.5 p-1">
                  {filteredProfiles.length === 0 && (
                    <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                      Nenhum usuário encontrado
                    </p>
                  )}
                  {filteredProfiles.map((profile) => {
                    const selected = formAgentIds.includes(profile.id);
                    const isOn = onlineUsers.includes(profile.id);
                    return (
                      <button
                        key={profile.id}
                        onClick={() => toggleAgent(profile.id)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                          selected
                            ? "bg-teal-500/15 text-teal-300"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="size-6">
                            <AvatarImage src={profile.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[8px]">
                              {getInitials(profile.display_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full border border-card ${
                              isOn ? "bg-emerald-400" : "bg-gray-500"
                            }`}
                          />
                        </div>
                        <span className="flex-1 truncate">{profile.display_name}</span>
                        {selected && <CheckCircle2 className="size-3.5 text-teal-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {editingQueue ? "Salvar" : "Criar fila"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
