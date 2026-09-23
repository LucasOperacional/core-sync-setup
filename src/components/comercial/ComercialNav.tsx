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
    <nav className="overflow-x-auto border-b border-red-950 bg-neutral-950 px-4 sm:px-6 lg:px-8" aria-label="Seções do Comercial">
      <div className="mx-auto flex max-w-[88rem] min-w-max gap-1 py-2">
        {itens.map((item) => {
          const ativo = atual === item.to;
          return (
            <Link key={item.to} to={item.to} className={cn("flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors", ativo ? "bg-red-600 text-neutral-50" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-50")}>
              <item.icon className="size-4" />{item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}