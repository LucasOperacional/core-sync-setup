import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, type ServerGuardContext } from "@/lib/security-guard.server";
import { assertAdmin } from "./usuarios-guard.server";
import { traduzirErroSenha } from "./usuarios-senha";
import { isSuperAdmin } from "./user-permissions";

/** Retorna true se o usuário-alvo é o superadmin e o chamador NÃO é o superadmin. */
async function alvoEhSuperadminProtegido(
  supabaseAdmin: any,
  callerId: string,
  targetId: string,
): Promise<boolean> {
  const [{ data: caller }, { data: target }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(callerId),
    supabaseAdmin.auth.admin.getUserById(targetId),
  ]);
  const callerIsSuper = caller?.user?.email ? isSuperAdmin(caller.user.email) : false;
  const targetIsSuper = target?.user?.email ? isSuperAdmin(target.user.email) : false;
  return targetIsSuper && !callerIsSuper;
}

export type AppRole =
  | "admin"
  | "user"
  | "supervisor"
  | "gerente"
  | "visualizador"
  | "diretor"
  | "cordenador"
  | "mesa_operacional";

export const APP_ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "supervisor", label: "Supervisor" },
  { value: "diretor", label: "Diretor" },
  { value: "cordenador", label: "Cordenador" },
  { value: "mesa_operacional", label: "Mesa Operacional" },
  { value: "gerente", label: "Gerente" },
  { value: "visualizador", label: "Visualizador" },
  { value: "user", label: "Usuário" },
];

const ROLES_VALIDAS = APP_ROLES.map((r) => r.value);

export type UsuarioAdmin = {
  id: string;
  email: string;
  role: AppRole;
  createdAt: string;
  lastSignInAt: string | null;
  fullName?: string;
  department?: string;
};

export const meuPapel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { role: (data?.role ?? "user") as AppRole };
  });

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsuarioAdmin[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const callerIsSuper = callerData?.user?.email ? isSuperAdmin(callerData.user.email) : false;

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const mapa = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));

    const { data: profiles } = await (supabaseAdmin as any)
      .from("user_profiles")
      .select("id, display_name, department");
    const profileMap = new Map<string, { fullName: string; department: string }>(
      (profiles ?? []).map(
        (p: { id: string; display_name?: string | null; department?: string | null }) => [
          p.id,
          { fullName: p.display_name ?? "", department: p.department ?? "" },
        ],
      ),
    );

    // Somente o superadmin pode ver a própria conta na listagem.
    const visibleUsers = callerIsSuper
      ? data.users
      : data.users.filter((u) => !u.email || !isSuperAdmin(u.email));

    return visibleUsers.map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        role: mapa.get(u.id) ?? ("user" as AppRole),
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        fullName: profile?.fullName ?? "",
        department: profile?.department ?? "",
      };
    });
  });

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      senha: string;
      role: AppRole;
      fullName: string;
      department: string;
      permissions?: { pageKey: string; allowed: boolean }[];
    }) => {
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
      if (!input.senha || input.senha.length < 8)
        throw new Error("A senha precisa ter ao menos 8 caracteres.");
      if (!STRONG_PASSWORD_REGEX.test(input.senha))
        throw new Error(
          "A senha deve conter pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 símbolo.",
        );
      if (!ROLES_VALIDAS.includes(input.role)) throw new Error("Papel inválido.");
      const fullName = (input.fullName ?? "").trim();
      if (!fullName) throw new Error("Nome completo é obrigatório.");
      const department = (input.department ?? "").trim();
      if (!department) throw new Error("Departamento é obrigatório.");
      const permissions = Array.isArray(input.permissions) ? input.permissions : [];
      return { email, senha: input.senha, role: input.role, fullName, department, permissions };
    },
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context as unknown as ServerGuardContext, "usuarios.criar", 10, 60);
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Somente o superadmin pode cadastrar novos usuários.
    const { data: callerData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (!callerData?.user?.email || !isSuperAdmin(callerData.user.email)) {
      throw new Error("Somente o superadmin pode cadastrar novos usuários.");
    }

    // Check for duplicate email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const duplicate = existingUsers?.users?.find((u) => u.email?.toLowerCase() === data.email);
    if (duplicate) {
      throw new Error("Já existe um usuário cadastrado com este e-mail.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(
        error ? traduzirErroSenha(error.message) : "Não foi possível criar o usuário.",
      );
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (roleError) throw new Error(roleError.message);

    // Upsert profile with full name and department
    const { error: profileError } = await (supabaseAdmin as any).from("user_profiles").upsert(
      {
        id: created.user.id,
        display_name: data.fullName,
        department: data.department,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      console.error("Erro ao salvar perfil:", profileError.message);
    }

    // Salva as permissões de páginas escolhidas no cadastro.
    const perms =
      data.role === "supervisor"
        ? [{ pageKey: "supervisor", allowed: true }]
        : (data.permissions ?? []).filter((p) => p && p.pageKey);
    if (perms.length > 0) {
      const { error: permError } = await supabaseAdmin.from("user_permissions").insert(
        perms.map((p) => ({
          user_id: created.user.id,
          page_key: p.pageKey,
          allowed: !!p.allowed,
        })),
      );
      if (permError) {
        console.error("Erro ao salvar permissões:", permError.message);
      }
    }

    return { ok: true as const, id: created.user.id };
  });

export const alterarPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRole }) => {
    if (!ROLES_VALIDAS.includes(input.role)) throw new Error("Papel inválido.");
    if (!input.userId) throw new Error("Usuário inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await enforceRateLimit(
      context as unknown as ServerGuardContext,
      "usuarios.alterarPapel",
      10,
      60,
    );
    await assertAdmin(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await alvoEhSuperadminProtegido(supabaseAdmin, context.userId, data.userId)) {
      throw new Error("Somente o superadmin pode gerenciar esta conta.");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);

    // Supervisor: mantém apenas o acesso ao card Supervisor.
    if (data.role === "supervisor") {
      await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.userId);
      await supabaseAdmin
        .from("user_permissions")
        .insert({ user_id: data.userId, page_key: "supervisor", allowed: true });
    }
    return { ok: true as const };
  });

export const redefinirSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; senha: string }) => {
    if (!input.userId) throw new Error("Usuário inválido.");
    if (!input.senha || input.senha.length < 8)
      throw new Error("A senha precisa ter ao menos 8 caracteres.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await enforceRateLimit(
      context as unknown as ServerGuardContext,
      "usuarios.redefinirSenha",
      10,
      60,
    );
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await alvoEhSuperadminProtegido(supabaseAdmin, context.userId, data.userId)) {
      throw new Error("Somente o superadmin pode gerenciar esta conta.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.senha,
    });
    // Senha recusada pelo provedor (fraca/vazada) não é uma falha do sistema:
    // devolvemos o aviso para a tela em vez de lançar um erro de execução.
    if (error) return { ok: false as const, erro: traduzirErroSenha(error.message) };
    return { ok: true as const, erro: null };
  });

export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input.userId) throw new Error("Usuário inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context as unknown as ServerGuardContext, "usuarios.excluir", 10, 60);
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await alvoEhSuperadminProtegido(supabaseAdmin, context.userId, data.userId)) {
      throw new Error("Somente o superadmin pode gerenciar esta conta.");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
