import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  type ChatQueue,
  listQueues,
  createQueue,
  deleteQueue,
} from "@/lib/chat-queues-db";

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

export function WhatsAppQueuesCard() {
  const [queues, setQueues] = useState<ChatQueue[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ChatQueue | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setQueues(await listQueues());
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar filas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setFormName("");
    setFormDesc("");
    setFormDept("");
    setFormActive(true);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Nome da fila é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      await createQueue({
        name: formName.trim(),
        description: formDesc.trim(),
        department: formDept,
        active: formActive,
      });
      toast.success("Fila criada.");
      setShowForm(false);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar fila.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQueue(deleteTarget.id);
      toast.success("Fila excluída.");
      setDeleteTarget(null);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir fila.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Filas de atendimento</h3>
          <p className="text-xs text-muted-foreground">
            Crie filas para organizar o atendimento do WhatsApp no chat interno.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
            <Plus className="mr-1 size-3.5" />
            Nova fila
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : queues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Nenhuma fila criada ainda.
        </p>
      ) : (
        <div className="space-y-1.5">
          {queues.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <Users className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{q.name}</p>
                  <Badge
                    variant={q.active ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {q.active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                {q.department && (
                  <p className="text-[10px] text-muted-foreground">{q.department}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:text-destructive"
                aria-label="Excluir fila"
                onClick={() => setDeleteTarget(q)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova fila de atendimento</DialogTitle>
            <DialogDescription>
              A fila fica disponível no chat interno para organizar os atendimentos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wa-queue-name">Nome da fila</Label>
              <Input
                id="wa-queue-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex.: Suporte WhatsApp"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Select value={formDept} onValueChange={setFormDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
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
            <div className="space-y-1.5">
              <Label htmlFor="wa-queue-desc">Descrição (opcional)</Label>
              <Textarea
                id="wa-queue-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                placeholder="Para que serve esta fila"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <Label htmlFor="wa-queue-active" className="text-sm">
                Fila ativa
              </Label>
              <Switch id="wa-queue-active" checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Criando..." : "Criar fila"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fila</AlertDialogTitle>
            <AlertDialogDescription>
              A fila "{deleteTarget?.name}" será excluída. As conversas em andamento dela também
              serão removidas da fila.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
