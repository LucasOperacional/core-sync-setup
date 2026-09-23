import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Clock3, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
            <p className="mb-1 text-[10px] font-semibold uppercase text-primary">NXS / Visão geral</p>
            <h1 className="font-display text-2xl">Bom dia, {userName.includes("@") ? userName.split("@")[0] : userName.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sua central de trabalho está pronta.</p>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Clock3 className="size-4" />
            <span className="capitalize">{currentWeekday}</span>
            <span>·</span><span>{currentDate}</span><span>·</span><span className="tabular-nums">{currentTime}</span>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,.7fr)] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Central integrada</p>
            <h2 className="mt-3 max-w-3xl font-display text-3xl leading-tight text-foreground sm:text-4xl">Gestão empresarial, sem ruído.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Acesse as áreas da operação pelo índice lateral. Cada setor reúne somente as ferramentas autorizadas para o seu perfil.</p>
          </div>
          <div className="border-l-2 border-primary pl-5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Ambiente</p>
            <p className="mt-2 text-lg font-semibold text-foreground">NXS Gestão Empresarial</p>
            <p className="mt-1 text-sm text-muted-foreground">Sessão protegida e ativa</p>
          </div>
        </div>
        <div className="grid gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          <Link to="/comercial-clientes" preload="intent" className="group bg-card p-6 transition-colors hover:bg-accent/35">
            <BriefcaseBusiness className="size-5 text-primary" />
            <p className="mt-8 text-xs font-semibold uppercase text-muted-foreground">Área 01</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Comercial</h3>
            <span className="mt-4 flex items-center gap-2 text-sm text-primary">Abrir área <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
          <Link to="/ponto" preload="intent" className="group bg-card p-6 transition-colors hover:bg-accent/35">
            <Clock3 className="size-5 text-primary" />
            <p className="mt-8 text-xs font-semibold uppercase text-muted-foreground">Área 02</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Departamento pessoal</h3>
            <span className="mt-4 flex items-center gap-2 text-sm text-primary">Abrir área <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
          <Link to="/control" preload="intent" className="group bg-card p-6 transition-colors hover:bg-accent/35">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-8 text-xs font-semibold uppercase text-muted-foreground">Área 03</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Operacional</h3>
            <span className="mt-4 flex items-center gap-2 text-sm text-primary">Abrir área <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
        </div>
      </section>
    </main>
  );
}
