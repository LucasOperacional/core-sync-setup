import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Visão geral | NXS Sistemas" },
      {
        name: "description",
        content: "Visão geral do sistema de gestão empresarial NXS.",
      },
      { property: "og:title", content: "Visão geral | NXS Sistemas" },
      { property: "og:description", content: "Visão geral do sistema de gestão empresarial NXS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [userName, setUserName] = useState<string>("Usuário");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [currentWeekday, setCurrentWeekday] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      const u = data?.user;
      if (u && !error) {
        const display =
          (u.user_metadata?.["name"] as string) ||
          (u.user_metadata?.["full_name"] as string) ||
          u.email ||
          "Usuário";
        setUserName(display);
      }
    });
  }, []);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentWeekday(now.toLocaleDateString("pt-BR", { weekday: "long" }));
      setCurrentDate(
        now.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
      setCurrentTime(
        now.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto grid min-h-24 max-w-[88rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold">Visão Geral</h1>
            <p className="mt-1 text-sm text-muted-foreground">Bem-vindo, {userName}</p>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Clock3 className="size-4" />
            <span className="capitalize">{currentWeekday}</span>
            <span>·</span><span>{currentDate}</span><span>·</span><span className="tabular-nums">{currentTime}</span>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="panel flex min-h-44 items-center overflow-hidden">
          <div className="h-full w-1 self-stretch bg-primary" />
          <div className="px-6 py-8 sm:px-8">
            <p className="text-xs font-semibold uppercase text-primary">Central integrada</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-foreground">NXS Gestão Empresarial</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Selecione uma categoria no menu lateral para acessar as ferramentas disponíveis.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
