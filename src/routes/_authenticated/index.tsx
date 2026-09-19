import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Clock3, LayoutGrid } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { operacionalNavItems } from "@/components/FloatingNav";
import { useMinhasPermissoes } from "@/hooks/use-minhas-permissoes";
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
  const { podeVer } = useMinhasPermissoes();
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
      <section className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div><h2 className="font-display text-base font-semibold">Áreas de trabalho</h2><p className="text-sm text-muted-foreground">Acesse os módulos disponíveis para o seu perfil.</p></div>
          <Activity className="size-4 text-primary" />
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {allNavItems.filter((item) => item.to !== "/" && podeVer(item.to)).map((item) => (
            <Link key={item.to} to={item.to} className="group flex min-w-0 items-center gap-3 bg-card p-4 transition-colors duration-150 hover:bg-accent/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted/50 text-muted-foreground group-hover:border-primary/25 group-hover:text-primary"><item.icon className="size-4" /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
            </Link>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><LayoutGrid className="size-3.5" />Os módulos exibidos respeitam suas permissões de acesso.</div>
      </section>
    </main>
  );
}
