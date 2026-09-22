import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./usuarios-guard.server";

export const AVAILABLE_PAGES = [
  {
    key: "painel-nexti",
    label: "Painel NEXTI",
    description: "Indicadores operacionais sincronizados com a NEXTI",
  },
  {
    key: "nxs-control",
    label: "NXS Control",
    description: "Torre de controle: rastreamento em tempo real, dispositivos e alertas",
  },
  { key: "control", label: "Control", description: "Dashboard de supervisão de postos" },
  { key: "faltas", label: "Faltas", description: "Dashboard de faltas" },
  { key: "admin", label: "Painel Admin", description: "Importação de relatórios e configurações" },
  { key: "canais", label: "Lançamento CRT", description: "Lançamento de CRT" },
  { key: "atestados", label: "Atestados", description: "Gestão de atestados médicos" },
  {
    key: "verificador-atestados",
    label: "Verificador de Atestados",
    description: "Análise de autenticidade de atestados",
  },
  {
    key: "protocolo-folhas-ponto",
    label: "Folhas de Ponto",
    description: "Protocolo de entrega de folhas de ponto",
  },
  {
    key: "protocolo-limpeza-geral",
    label: "Limpeza Geral",
    description: "Protocolo de limpeza geral",
  },
  {
    key: "assinatura-documentos",
    label: "Assinatura de Documentos",
    description: "CRT e PDFs assinados pelo celular com protocolo e QR Code",
  },
  {
    key: "chat-ia",
    label: "Chat Oficial com IA",
    description: "Chat com IA integrada (Gemini/OpenAI)",
  },
  {
    key: "chat-interno",
    label: "Chat Interno",
    description: "Chat em tempo real entre membros da equipe",
  },
  {
    key: "ia-operacional",
    label: "IA Operacional",
    description: "Monitoramento e recuperação automática de falhas",
  },
  {
    key: "lgpd",
    label: "LGPD",
    description: "Conformidade com a Lei nº 13.709/2018 e direitos do titular",
  },
  {
    key: "usuarios",
    label: "Gestão de Usuários",
    description: "Gerenciamento de permissões e acessos",
  },
  { key: "vagas", label: "Vagas", description: "Gerenciamento de vagas e oportunidades" },
  {
    key: "supervisor",
    label: "Supervisor",
    description: "Painel de supervisão operacional com relatórios de visita",
  },
  {
    key: "movimentacao-posto",
    label: "Movimentação de Posto",
    description: "Registro de transferência de colaboradores entre postos",
  },
  {
    key: "rh",
    label: "RH",
    description: "Central de recursos humanos",
  },
  {
    key: "gps",
    label: "GPS",
    description: "Rastreamento em tempo real dos supervisores",
  },
  {
    key: "areas",
    label: "Áreas",
    description: "Consulta das áreas operacionais cadastradas",
  },
  {
    key: "mesa-operacional",
    label: "Mesa Operacional",
    description: "Check-in diário dos postos de serviço por gerente de área",
  },
  {
    key: "postos",
    label: "Postos de Serviço",
    description: "Postos importados da NEXTI com as vagas disponíveis em cada posto",
  },
  {
    key: "indicadores",
    label: "Indicadores",
    description: "Tempo de execução dos relatórios de campo e das fichas de avaliação",
  },
] as const;

export type PageKey = (typeof AVAILABLE_PAGES)[number]["key"];

/**
 * Categorias do menu lateral. Cada uma vira uma permissão própria
 * ("categoria-operacional", etc.) para liberar o menu por usuário.
 */
export const SIDEBAR_CATEGORIES = [
  { key: "categoria-comercial", label: "Comercial" },
  { key: "categoria-departamento-pessoal", label: "Departamento pessoal" },
  { key: "categoria-financeiro", label: "Financeiro" },
  { key: "categoria-operacional", label: "Operacional" },
  { key: "categoria-recursos-humanos", label: "Recursos humanos" },
  { key: "categoria-suprimentos", label: "Suprimentos" },
] as const;

export type SidebarCategoryKey = (typeof SIDEBAR_CATEGORIES)[number]["key"];

export type UserPermission = {
  pageKey: string;
  allowed: boolean;
};

export const SUPERADMIN_EMAIL = "lucasdallan@gmail.com";
export const SUPERADMIN_EMAILS = ["lucasdallan@gmail.com"];

export function isSuperAdmin(email: string): boolean {
  return SUPERADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export const listarPermissoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input.userId) throw new Error("Usuário inválido.");
    return input;
  })
  .handler(async ({ data, context }): Promise<UserPermission[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    if (!admin) {
      throw new Error(
        "Admin client indisponível: conecte o Supabase no painel da Lovable Cloud para gerenciar permissões.",
      );
    }

    const { data: perms, error } = await admin
      .from("user_permissions")
      .select("page_key, allowed")
      .eq("user_id", data.userId);

    if (error) throw new Error(error.message);

    return (perms ?? []).map((p: { page_key: string; allowed: boolean }) => ({
      pageKey: p.page_key,
      allowed: p.allowed,
    }));
  });

export const listarTodasPermissoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, UserPermission[]>> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    if (!admin) {
      throw new Error(
        "Admin client indisponível: conecte o Supabase no painel da Lovable Cloud para gerenciar permissões.",
      );
    }

    const { data: perms, error } = await admin
      .from("user_permissions")
      .select("user_id, page_key, allowed");

    if (error) throw new Error(error.message);

    const result: Record<string, UserPermission[]> = {};
    for (const p of perms ?? ([] as { user_id: string; page_key: string; allowed: boolean }[])) {
      const list = result[p.user_id] ?? (result[p.user_id] = []);
      list.push({ pageKey: p.page_key, allowed: p.allowed });
    }
    return result;
  });

export const salvarPermissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { userId: string; permissions: { pageKey: string; allowed: boolean }[] }) => {
      if (!input.userId) throw new Error("Usuário inválido.");
      if (!Array.isArray(input.permissions)) throw new Error("Permissões inválidas.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    if (!admin) {
      throw new Error(
        "Admin client indisponível: conecte o Supabase no painel da Lovable Cloud para gerenciar permissões.",
      );
    }

    // Prevent editing superadmin permissions
    const { data: userData } = await admin.auth.admin.getUserById(data.userId);
    if (userData?.user?.email && isSuperAdmin(userData.user.email)) {
      throw new Error("Não é possível alterar permissões do superadmin.");
    }

    // Delete existing permissions for this user
    await admin.from("user_permissions").delete().eq("user_id", data.userId);

    // Insert new permissions
    if (data.permissions.length > 0) {
      const rows = data.permissions.map((p: { pageKey: string; allowed: boolean }) => ({
        user_id: data.userId,
        page_key: p.pageKey,
        allowed: p.allowed,
      }));

      const { error } = await admin.from("user_permissions").insert(rows);

      if (error) throw new Error(error.message);
    }

    return { ok: true as const };
  });

export const minhasPermissoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserPermission[]> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin: any = supabaseAdmin;

      // Check if user is superadmin - full access always
      if (admin) {
        const { data: userData } = await admin.auth.admin.getUserById(context.userId);
        if (userData?.user?.email && isSuperAdmin(userData.user.email)) {
          return AVAILABLE_PAGES.map((p: (typeof AVAILABLE_PAGES)[number]) => ({
            pageKey: p.key,
            allowed: true,
          }));
        }

        // Check if user has admin role - full access
        const { data: roleData } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .maybeSingle();

        if (roleData?.role === "admin") {
          return AVAILABLE_PAGES.map((p: (typeof AVAILABLE_PAGES)[number]) => ({
            pageKey: p.key,
            allowed: true,
          }));
        }

        // Supervisor: acesso exclusivo ao card Supervisor
        if (roleData?.role === "supervisor") {
          return AVAILABLE_PAGES.map((p: (typeof AVAILABLE_PAGES)[number]) => ({
            pageKey: p.key,
            allowed: p.key === "supervisor",
          }));
        }

        const { data: perms, error } = await admin
          .from("user_permissions")
          .select("page_key, allowed")
          .eq("user_id", context.userId);

        if (!error && perms && perms.length > 0) {
          return perms.map((p: { page_key: string; allowed: boolean }) => ({
            pageKey: p.page_key,
            allowed: p.allowed,
          }));
        }
      }
    } catch {
      // Admin client indisponivel (preview sem Supabase conectado):
      // retorna fallback silencioso em vez de travar a pagina com 500.
    }

    // Fallback: se o admin client não está disponível (preview local sem Supabase),
    // retorna todas as páginas como não permitidas para não-admins.
    // O usuário admin real do preview pode ver tudo via hook useMinhasPermissoes.
    return AVAILABLE_PAGES.map((p) => ({ pageKey: p.key, allowed: false }));
  });
