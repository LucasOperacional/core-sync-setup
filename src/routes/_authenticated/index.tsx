import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Início" },
      {
        name: "description",
        content: "Painel central operacional — utilize o menu lateral para acessar o sistema.",
      },
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
        <div className="mx-auto grid max-w-[88rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Bem-vindo, {userName}</p>
            <h1 className="mt-1 truncate font-display text-2xl font-semibold">Central operacional</h1>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Clock3 className="size-4" />
            <span className="capitalize">{currentWeekday}</span>
            <span>·</span><span>{currentDate}</span><span>·</span><span className="tabular-nums">{currentTime}</span>
          </div>
        </div>
      </header>
    </main>
  );
}
