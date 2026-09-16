import { createServerFn } from "@tanstack/react-start";

export type CadastroRole = "diretor" | "cordenador" | "mesa_operacional";

const ROLES_PERMITIDAS: CadastroRole[] = ["diretor", "cordenador", "mesa_operacional"];

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * Auto-cadastro público a partir da página de autenticação.
 * Cria a conta já confirmada, com nome, departamento e função.
 */
export const cadastrarConta = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      nome: string;
      email: string;
      senha: string;
      role: CadastroRole;
      departamento: string;
    }) => {
      const nome = (input.nome ?? "").trim();
      if (nome.length < 3) throw new Error("Informe o nome completo.");
      if (nome.length > 120) throw new Error("Nome muito longo.");
      const email = (input.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
      if (email.length > 255) throw new Error("E-mail muito longo.");
      if (!STRONG_PASSWORD_REGEX.test(input.senha ?? ""))
        throw new Error(
          "A senha deve ter ao menos 8 caracteres, com 1 maiúscula, 1 minúscula, 1 número e 1 símbolo.",
        );
      if (!ROLES_PERMITIDAS.includes(input.role)) throw new Error("Selecione uma função válida.");
      const role: CadastroRole = input.role;
      const departamento = (input.departamento ?? "").trim();
      if (!departamento) throw new Error("Informe o departamento.");
      if (departamento.length > 120) throw new Error("Departamento muito longo.");
      return { nome, email, senha: input.senha, role, departamento };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Limite simples para evitar abuso do cadastro público.
    try {
      const { data: limite } = await (supabaseAdmin as any).rpc("security_check_rate_limit", {
        _identity: `signup:${data.email}`,
        _resource: "auth.cadastro",
        _limit: 5,
        _window_seconds: 3600,
      });
      if (limite && limite.allowed === false) {
        throw new Error("Muitas tentativas de cadastro. Tente novamente mais tarde.");
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Muitas tentativas")) throw err;
    }

    const { data: existentes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (existentes?.users?.some((u) => u.email?.toLowerCase() === data.email)) {
      throw new Error("Já existe uma conta com este e-mail.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, departamento: data.departamento },
    });
    if (error || !created?.user) {
      throw new Error(error?.message ?? "Não foi possível criar a conta.");
    }

    const userId = created.user.id;

    // Nenhuma função nem permissão é concedida agora: o acesso depende da
    // aprovação do superadmin, que também define as páginas liberadas.
    await (supabaseAdmin as any).from("solicitacoes_acesso").insert({
      user_id: userId,
      nome: data.nome,
      email: data.email,
      role_solicitada: data.role,
      departamento: data.departamento,
      status: "pendente",
    });

    await (supabaseAdmin as any)
      .from("user_profiles")
      .upsert(
        { id: userId, display_name: data.nome, department: data.departamento },
        { onConflict: "id" },
      );
    await (supabaseAdmin as any)
      .from("profiles")
      .upsert(
        { id: userId, nome: data.nome, email: data.email, departamento: data.departamento },
        { onConflict: "id" },
      );

    return { ok: true as const, pendente: true as const };
  });
