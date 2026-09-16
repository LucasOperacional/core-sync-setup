import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSessao() {
  const [user, setUser] = useState<User | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setUser(data.session?.user ?? null);
      setCarregando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUser(session?.user ?? null);
      setCarregando(false);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, carregando };
}

export function nomeDoUsuario(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { nome?: string; full_name?: string } | undefined;
  return meta?.nome ?? meta?.full_name ?? user.email?.split("@")[0] ?? "Usuário";
}

const SUPERADMIN_EMAILS = ["lucasdallan@gmail.com"];

export function useIsAdmin(user: User | null) {
  return useQuery({
    queryKey: ["sou-admin", user?.id ?? null],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return false;
      if (user.email && SUPERADMIN_EMAILS.includes(user.email.toLowerCase().trim())) return true;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
}
