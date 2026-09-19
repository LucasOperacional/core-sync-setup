import type React from "react";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarX2,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  Gauge,
  Home,
  LayoutGrid,
  MapPin,
  PenLine,
  Scale,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";

export interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  color: string;
  activeColor: string;
  activeBg: string;
}

export const allNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Início", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/control", icon: BarChart3, label: "ISO", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/faltas", icon: CalendarX2, label: "Faltas", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/atestados", icon: ClipboardCheck, label: "Atestados", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/protocolo-folhas-ponto", icon: FileSignature, label: "Folhas", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/assinatura-documentos", icon: PenLine, label: "Assinaturas", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/chat-interno", icon: Users, label: "Chat interno", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/admin", icon: ShieldCheck, label: "Administração", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/lgpd", icon: Scale, label: "LGPD", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/ia-operacional", icon: Zap, label: "IA operacional", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/coordenacao", icon: Briefcase, label: "Coordenação", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/supervisor", icon: MapPin, label: "Supervisão", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/gps", icon: MapPin, label: "GPS", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/rh", icon: Building2, label: "Recursos humanos", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/areas", icon: LayoutGrid, label: "Áreas", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/mesa-operacional", icon: ClipboardList, label: "Mesa operacional", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/postos", icon: Building2, label: "Postos", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
  { to: "/indicadores", icon: Gauge, label: "Indicadores", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
];

export const operacionalNavItems: NavItem[] = allNavItems.filter(
  (item) => item.to !== "/rh",
);

export const rhNavItems: NavItem[] = [
  ...allNavItems.filter((item) => item.to === "/rh"),
  { to: "/vagas-aprovadas", icon: BarChart3, label: "Vagas aprovadas", color: "text-muted-foreground", activeColor: "text-primary", activeBg: "bg-accent" },
];

/** A navegação passou a ser fornecida pelo AppShell autenticado. */
export function FloatingNav() {
  return null;
}