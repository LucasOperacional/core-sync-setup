import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/** Sino com o contador de avisos não lidos, atualizado em tempo real. */
export function SinoNotificacoes() {
  const [naoLidas, setNaoLidas] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (ativo) setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sessao) => {
      setUserId(sessao?.user.id ?? null);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setNaoLidas(0);
      return;
    }

    async function contar() {
      const { count } = await supabase
        .from("notification_history")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      setNaoLidas(count ?? 0);
    }
    void contar();

    const canal = supabase
      .channel(`avisos-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_history",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const novo = payload.new as { title?: string; body?: string };
          setNaoLidas((n) => n + 1);
          // Com a página aberta o push não aparece; mostramos o aviso na tela.
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            toast(novo.title ?? "Novo aviso", { description: novo.body ?? "" });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notification_history",
          filter: `user_id=eq.${userId}`,
        },
        () => void contar(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId]);

  if (!userId) return null;

  return (
    <Link
      to="/notificacoes"
      aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} não lidas)` : ""}`}
      className="fixed right-4 top-2.5 z-[60] inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-xs transition-colors duration-150 hover:bg-accent hover:text-accent-foreground lg:top-4"
    >
      <Bell className="size-5" />
      {naoLidas > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground">
          {naoLidas > 99 ? "99+" : naoLidas}
        </span>
      )}
    </Link>
  );
}
