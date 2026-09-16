import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Login por "usuário + senha" resolvido inteiramente no servidor.
 *
 * A resolução usuário -> e-mail NUNCA é devolvida ao cliente (evita
 * enumeração de contas e vazamento de e-mails). O servidor autentica e
 * devolve apenas a sessão, que o cliente instala via supabase.auth.setSession.
 */
export const entrarComUsuario = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        usuario: z.string().trim().min(2).max(255),
        senha: z.string().min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const identificador = data.usuario.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Limite de tentativas por identificador (anti força-bruta / enumeração)
    try {
      const { data: limite } = await (supabaseAdmin as any).rpc("security_check_rate_limit", {
        _identity: `login:${identificador}`,
        _resource: "auth.login",
        _limit: 10,
        _window_seconds: 300,
      });
      if (limite && limite.allowed === false) {
        return { ok: false as const, motivo: "rate_limit" as const };
      }
    } catch {
      // se o controle de limite falhar, segue o fluxo normal de login
    }

    let email: string | null = null;

    if (identificador.includes("@")) {
      email = identificador;
    } else {
      if (!/^[a-zA-Z0-9._-]+$/.test(identificador)) {
        return { ok: false as const, motivo: "credenciais" as const };
      }

      const { data: perfil } = await supabaseAdmin
        .from("user_profiles")
        .select("id")
        .ilike("display_name", identificador)
        .limit(1)
        .maybeSingle();

      if (perfil) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
        email = userData?.user?.email ?? null;
      }

      if (!email) {
        const { data: lista } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        email =
          lista?.users.find((u) => (u.email ?? "").toLowerCase().split("@")[0] === identificador)
            ?.email ?? null;
      }
    }

    if (!email) return { ok: false as const, motivo: "credenciais" as const };

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const cliente = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: auth, error } = await cliente.auth.signInWithPassword({
      email,
      password: data.senha,
    });

    if (error || !auth?.session) return { ok: false as const, motivo: "credenciais" as const };

    return {
      ok: true as const,
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
    };
  });
