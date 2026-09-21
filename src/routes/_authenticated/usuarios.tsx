import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Home,
  Users,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  KeyRound,
  Settings2,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  listarUsuarios,
  criarUsuario,
  alterarPapel,
  redefinirSenha,
  excluirUsuario,
  type UsuarioAdmin,
  APP_ROLES,
  type AppRole,
} from "@/lib/usuarios.functions";
import {
  AVAILABLE_PAGES,
  isSuperAdmin,
  listarTodasPermissoes,
  salvarPermissoes,
  type UserPermission,
} from "@/lib/user-permissions";
import { SolicitacoesAcessoCard } from "@/components/SolicitacoesAcessoCard";
import { useSessao } from "@/hooks/use-sessao";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários" },
      {
        name: "description",
        content: "Gerenciamento de usuários e permissões.",
      },
    ],
  }),
  component: UsuariosPage,
});

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

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoriasVisiveisDoMenu(
  user: UsuarioAdmin,
  permissions: Record<string, UserPermission[]>,
) {
  if (isSuperAdmin(user.email) || user.role === "admin") {
    return AVAILABLE_PAGES.map((page) => page.label);
  }

  if (user.role === "supervisor") {
    const supervisorPage = AVAILABLE_PAGES.find((page) => page.key === "supervisor");
    return supervisorPage ? [supervisorPage.label] : [];
  }

  const allowedKeys = new Set(
    (permissions[user.id] ?? []).filter((permission) => permission.allowed).map((permission) => permission.pageKey),
  );

  return AVAILABLE_PAGES.filter((page) => allowedKeys.has(page.key)).map((page) => page.label);
}

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = useMemo(() => {
    return [
      { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
      { label: "Letra maiúscula", ok: /[A-Z]/.test(password) },
      { label: "Letra minúscula", ok: /[a-z]/.test(password) },
      { label: "Número", ok: /\d/.test(password) },
      { label: "Símbolo (!@#$...)", ok: /[^A-Za-z0-9]/.test(password) },
    ];
  }, [password]);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5 text-xs">
          {c.ok ? (
            <CheckCircle2 className="size-3.5 text-green-500" />
          ) : (
            <AlertCircle className="size-3.5 text-muted-foreground" />
          )}
          <span className={c.ok ? "text-green-600" : "text-muted-foreground"}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

function UsuariosPage() {
  const { user: usuarioAtual } = useSessao();
  const souSuperAdmin = !!usuarioAtual?.email && isSuperAdmin(usuarioAtual.email);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [allPermissions, setAllPermissions] = useState<Record<string, UserPermission[]>>({});
  const [loading, setLoading] = useState(true);

  // Create user
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newSenha, setNewSenha] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [newPerms, setNewPerms] = useState<Record<string, boolean>>({});

  // Role edit
  const [roleEditUser, setRoleEditUser] = useState<UsuarioAdmin | null>(null);
  const [roleEditValue, setRoleEditValue] = useState<AppRole>("user");
  const [savingRole, setSavingRole] = useState(false);

  // Password reset
  const [resetUser, setResetUser] = useState<UsuarioAdmin | null>(null);
  const [resetSenha, setResetSenha] = useState("");
  const [savingReset, setSavingReset] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete
  const [deleteUser, setDeleteUser] = useState<UsuarioAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Permissions
  const [permUser, setPermUser] = useState<UsuarioAdmin | null>(null);
  const [permState, setPermState] = useState<Record<string, boolean>>({});
  const [permCategoria, setPermCategoria] = useState("");
  const [savingPerms, setSavingPerms] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const isPasswordStrong = STRONG_PASSWORD_REGEX.test(newSenha);
  const canCreate =
    newFullName.trim().length > 0 && isEmailValid && isPasswordStrong && newDepartment.length > 0;

  async function fetchData() {
    try {
      setLoading(true);
      const [u, p] = await Promise.all([listarUsuarios(), listarTodasPermissoes()]);
      setUsuarios(u);
      setAllPermissions(p);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function resetCreateForm() {
    setNewFullName("");
    setNewEmail("");
    setNewSenha("");
    setNewDepartment("");
    setNewRole("user");
    setShowPassword(false);
    setNewPerms({});
  }

  async function handleCreate() {
    try {
      setCreating(true);
      await criarUsuario({
        data: {
          email: newEmail,
          senha: newSenha,
          role: newRole,
          fullName: newFullName.trim(),
          department: newDepartment,
          permissions: AVAILABLE_PAGES.map((p: (typeof AVAILABLE_PAGES)[number]) => ({
            pageKey: p.key,
            allowed: !!newPerms[p.key],
          })),
        },
      });
      toast.success("Usuário cadastrado com sucesso.");
      setShowCreate(false);
      resetCreateForm();
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar usuário.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleSave() {
    if (!roleEditUser?.id) return;
    try {
      setSavingRole(true);
      await alterarPapel({
        data: { userId: roleEditUser.id, role: roleEditValue },
      });
      toast.success("Papel alterado.");
      setRoleEditUser(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar papel.");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleResetSenha() {
    if (!resetUser?.id) return;
    try {
      setSavingReset(true);
      const res = await redefinirSenha({
        data: { userId: resetUser.id, senha: resetSenha },
      });
      if (!res.ok) {
        toast.error(res.erro ?? "Erro ao redefinir senha.");
        return;
      }
      toast.success("Senha redefinida.");
      setResetUser(null);
      setResetSenha("");
      setShowResetPassword(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao redefinir senha.");
    } finally {
      setSavingReset(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser?.id) return;
    try {
      setDeleting(true);
      await excluirUsuario({ data: { userId: deleteUser.id } });
      toast.success("Usuário excluído.");
      setDeleteUser(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir usuário.");
    } finally {
      setDeleting(false);
    }
  }

  function openPermissions(user: UsuarioAdmin) {
    const current = allPermissions[user.id] ?? [];
    const state: Record<string, boolean> = {};
    for (const p of AVAILABLE_PAGES) {
      const found = current.find((c) => c.pageKey === p.key);
      state[p.key] = found ? found.allowed : false;
    }
    setPermState(state);
    setPermCategoria(""); // O dado virá do banco futuramente
    setPermUser(user);
  }

  async function handlePermSave() {
    if (!permUser?.id) return;
    try {
      setSavingPerms(true);
      const permissions = Object.entries(permState).map(([pageKey, allowed]) => ({
        pageKey,
        allowed,
      }));
      await salvarPermissoes({
        data: { userId: permUser.id, permissions },
      });
      toast.success("Permissões salvas.");
      setPermUser(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar permissões.");
    } finally {
      setSavingPerms(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="size-4" />
            Painel Inicial
          </Link>
          <Users className="size-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerenciamento de permissões e acessos.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <SolicitacoesAcessoCard onDecidido={() => void fetchData()} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-xl font-semibold">Usuários cadastrados</CardTitle>
            {souSuperAdmin && (
              <Button
                onClick={() => {
                  resetCreateForm();
                  setShowCreate(true);
                }}
                size="sm"
              >
                <Plus className="mr-1.5 size-4" />
                Novo Usuário
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : usuarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
                <Users className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Categorias no Sidebar</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Último login</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((u) => {
                      const isSuper = isSuperAdmin(u.email);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.fullName || "—"}</TableCell>
                          <TableCell>
                            {u.email}
                            {isSuper && (
                              <Badge
                                variant="outline"
                                className="ml-2 border-amber-500 text-amber-600"
                              >
                                Super
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.department || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role === "admin" ? (
                                <ShieldCheck className="mr-1 size-3" />
                              ) : (
                                <Shield className="mr-1 size-3" />
                              )}
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-56">
                            {(() => {
                              const categorias = categoriasVisiveisDoMenu(u, allPermissions);
                              return categorias.length > 0 ? (
                                <div className="flex max-w-md flex-wrap gap-1">
                                  {categorias.map((categoria) => (
                                    <Badge key={categoria} variant="outline" className="text-xs">
                                      {categoria}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  Nenhuma categoria liberada
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(u.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(u.lastSignInAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Alterar papel"
                                disabled={isSuper}
                                onClick={() => {
                                  setRoleEditUser(u);
                                  setRoleEditValue(u.role);
                                }}
                              >
                                <ShieldCheck className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Redefinir senha"
                                onClick={() => {
                                  setResetUser(u);
                                  setResetSenha("");
                                  setShowResetPassword(false);
                                }}
                              >
                                <KeyRound className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar Menu Sidebar"
                                disabled={isSuper}
                                onClick={() => openPermissions(u)}
                              >
                                <Settings2 className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir usuário"
                                disabled={isSuper}
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteUser(u)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Criar usuário */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha todos os campos obrigatórios para cadastrar um novo usuário no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="new-fullname">
                Nome completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-fullname"
                type="text"
                placeholder="Nome completo do usuário"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-email">
                E-mail <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-email"
                type="email"
                placeholder="usuario@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="off"
              />
              {newEmail.trim() && !isEmailValid && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  Formato de e-mail inválido.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-senha">
                Senha <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="new-senha"
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha segura"
                  value={newSenha}
                  onChange={(e) => setNewSenha(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <PasswordStrengthIndicator password={newSenha} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-department">
                Departamento <span className="text-destructive">*</span>
              </Label>
              <Select value={newDepartment} onValueChange={setNewDepartment}>
                <SelectTrigger id="new-department">
                  <SelectValue placeholder="Selecione o departamento" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Papel</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categorias visíveis no Menu Lateral (Sidebar)</Label>
              <p className="text-xs text-muted-foreground">
                {newRole === "admin"
                  ? "Administradores visualizam todas as categorias do menu."
                  : newRole === "supervisor"
                    ? "Supervisores visualizam somente a categoria Supervisor."
                    : "Selecione somente as categorias que aparecerão no menu Sidebar deste usuário. As categorias não selecionadas não serão exibidas."}
              </p>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-2">
                {AVAILABLE_PAGES.map((p: (typeof AVAILABLE_PAGES)[number]) => (
                  <label
                    key={p.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={
                        newRole === "admin"
                          ? true
                          : newRole === "supervisor"
                            ? p.key === "supervisor"
                            : !!newPerms[p.key]
                      }
                      disabled={newRole === "admin" || newRole === "supervisor"}
                      onCheckedChange={(checked) =>
                        setNewPerms((prev) => ({
                          ...prev,
                          [p.key]: checked === true,
                        }))
                      }
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                resetCreateForm();
              }}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !canCreate}>
              {creating && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Cadastrar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Alterar papel */}
      <Dialog open={!!roleEditUser} onOpenChange={(open) => !open && setRoleEditUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Papel</DialogTitle>
            <DialogDescription>{roleEditUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={roleEditValue} onValueChange={(v) => setRoleEditValue(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleEditUser(null)} disabled={savingRole}>
              Cancelar
            </Button>
            <Button onClick={handleRoleSave} disabled={savingRole}>
              {savingRole && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Redefinir senha */}
      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>{resetUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="reset-senha">Nova senha</Label>
            <div className="relative">
              <Input
                id="reset-senha"
                type={showResetPassword ? "text" : "password"}
                placeholder="Mínimo 8 caracteres"
                value={resetSenha}
                onChange={(e) => setResetSenha(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                onClick={() => setShowResetPassword(!showResetPassword)}
              >
                {showResetPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)} disabled={savingReset}>
              Cancelar
            </Button>
            <Button onClick={handleResetSenha} disabled={savingReset || resetSenha.length < 8}>
              {savingReset && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Permissões */}
      <Dialog open={!!permUser} onOpenChange={(open) => !open && setPermUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permissões e Menu Lateral (Sidebar)</DialogTitle>
            <DialogDescription>{permUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="px-1 py-1">
            <Label className="mb-1 block">Categorias visíveis no Menu Lateral (Sidebar)</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Marque somente as categorias que este usuário poderá visualizar. As categorias sem seleção não aparecerão no menu Sidebar.
            </p>
          </div>
          <div className="mt-4">
            <Label className="mb-1 block">Categorias liberadas no menu</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              {permUser?.role === "admin"
                ? "Administradores possuem acesso a todas as categorias do menu por padrão."
                : permUser?.role === "supervisor"
                  ? "Supervisores possuem acesso fixo apenas à categoria Supervisor."
                  : "Cada opção selecionada será exibida no menu lateral deste usuário."}
            </p>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto py-2 border-t border-border pt-4">
            {AVAILABLE_PAGES.map((page: (typeof AVAILABLE_PAGES)[number]) => {
              const isFixedAdmin = permUser?.role === "admin";
              const isFixedSupervisor = permUser?.role === "supervisor";
              const isDisabled = isFixedAdmin || isFixedSupervisor;
              const isChecked = isFixedAdmin ? true : (isFixedSupervisor ? page.key === "supervisor" : (permState[page.key] ?? false));

              return (
                <label
                  key={page.key}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isDisabled}
                    onCheckedChange={(checked) =>
                      setPermState((prev) => ({
                        ...prev,
                        [page.key]: !!checked,
                      }))
                    }
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{page.label}</span>
                    <p className="text-xs text-muted-foreground">{page.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermUser(null)} disabled={savingPerms}>
              Cancelar
            </Button>
            <Button onClick={handlePermSave} disabled={savingPerms}>
              {savingPerms && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Excluir */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário {deleteUser?.email} será removido permanentemente. Essa ação não pode ser
              desfeita.
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
    </main>
  );
}
