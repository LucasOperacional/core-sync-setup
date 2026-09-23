import { Link } from "@tanstack/react-router";
import { BarChart3, BriefcaseBusiness, CalendarDays, FileText, LayoutDashboard, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const itens = [
  { to: "/comercial", label: "Visão geral", icon: LayoutDashboard },
  { to: "/comercial-clientes", label: "Clientes", icon: Users },
  { to: "/comercial-funil", label: "Funil", icon: Target },
  { to: "/comercial-propostas", label: "Propostas", icon: FileText },
  { to: "/comercial-agenda", label: "Agenda", icon: CalendarDays },
  { to: "/comercial-contratos", label: "Contratos", icon: BriefcaseBusiness },
  { to: "/comercial-relatorios", label: "Relatórios", icon: BarChart3 },
] as const;

export function ComercialNav({ atual }: { atual: string }) {
  return (
    <nav className="overflow-x-auto border-b border-primary/20 bg-background px-4 sm:px-6 lg:px-8" aria-label="Seções do Comercial">
      <div className="mx-auto flex max-w-[88rem] min-w-max gap-1 py-2">
        {itens.map((item) => {
          const ativo = atual === item.to;
          return (
            <Link key={item.to} to={item.to} preload="intent" preloadDelay={0} className={cn("flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors", ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <item.icon className="size-4" />{item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}