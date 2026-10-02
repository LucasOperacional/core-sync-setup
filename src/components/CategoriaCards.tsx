import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowRight,
  BarChart3,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  Gauge,
  LayoutGrid,
  MapPin,
  PencilLine,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useMinhasPermissoes } from "@/hooks/use-minhas-permissoes";

const ICONES: Record<string, LucideIcon> = {
  alarm: AlarmClock,
  briefcase: Briefcase,
  building: Building2,
  calendar: CalendarDays,
  check: CheckCircle2,
  chart: BarChart3,
  clipboard: ClipboardCheck,
  clock: Clock,
  file: FileText,
  gauge: Gauge,
  grid: LayoutGrid,
  pencil: PencilLine,
  pin: MapPin,
  settings: Settings,
  shield: ShieldCheck,
  signature: FileSignature,
  target: Target,
  users: Users,
  zap: Zap,
  x2: CalendarX2,
};

export interface ItemCategoria {
  to: string;
  label: string;
  descricao: string;
  /** Nome do ícone em ICONES. */
  icon: string;
  /** Não passa pela checagem de permissão individual (páginas fora do cadastro). */
  livre?: boolean;
}

type ItemMenu = Omit<ItemCategoria, "icon"> & { icon: LucideIcon };

function comIcones(itens: ItemCategoria[]): ItemMenu[] {
  return itens.map(({ icon, ...item }) => ({ ...item, icon: ICONES[icon] ?? FileText }));
}

export function CategoriaCards({
  categoriaKey,
  itens,
}: {
  categoriaKey: string;
  itens: ItemCategoria[];
}) {
  const { carregando, podeVer, podeVerCategoria } = useMinhasPermissoes();

  if (!podeVerCategoria(categoriaKey)) {
    return <p className="text-sm text-muted-foreground">Você não tem acesso a esta área.</p>;
  }

  if (carregando) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  const visiveis = comIcones(itens).filter((item) => item.livre || podeVer(item.to));

  if (visiveis.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum card disponível nesta área ainda.</p>
    );
  }

  const destaqueComercial = categoriaKey === "categoria-comercial";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visiveis.map((item) => (
        <Link key={item.to} to={item.to} preload="intent" className="group block">
          {destaqueComercial ? (
            <Card className="prospeccao-card relative aspect-square h-full overflow-hidden">
              <CardContent className="relative z-10 flex h-full flex-col items-center justify-center p-6 text-center">
                <span className="mb-6 grid size-20 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-colors duration-300 group-hover:border-primary/50">
                  <item.icon className="size-10" strokeWidth={1.5} />
                </span>
                <span className="font-display text-xl font-semibold leading-tight text-card-foreground">
                  {item.label}
                </span>
                <span className="mt-2 text-xs font-semibold uppercase text-muted-foreground transition-colors group-hover:text-primary">
                  Comercial
                </span>
                <span className="sr-only">{item.descricao}</span>
                <ArrowRight aria-hidden="true" className="absolute bottom-5 right-5 size-5 translate-x-1 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex h-full items-start gap-3 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </span>
                <span className="min-w-0 space-y-1">
                  <span className="block font-medium leading-tight">{item.label}</span>
                  <span className="block text-sm text-muted-foreground">{item.descricao}</span>
                </span>
              </CardContent>
            </Card>
          )}
        </Link>
      ))}
    </div>
  );
}
