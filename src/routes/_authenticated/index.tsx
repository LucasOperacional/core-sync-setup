import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoAzul from "@/assets/logo-nxs-plus-azul.png.asset.json";
import logoBranca from "@/assets/logo-nxs-plus-branca.png.asset.json";

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
      <section className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-[88rem] items-center justify-center px-6 py-8">
        <img
          src={logoAzul.url}
          alt="NXS Plus Gestão"
          className="block w-full max-w-xl dark:hidden"
          draggable={false}
        />
        <img
          src={logoBranca.url}
          alt="NXS Plus Gestão"
          className="hidden w-full max-w-xl dark:block"
          draggable={false}
        />
      </section>
    </main>
  );
}
