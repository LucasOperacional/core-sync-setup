import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Download, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { operacionalNavItems } from "@/components/FloatingNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useMinhasPermissoes } from "@/hooks/use-minhas-permissoes";
import { nomeDoUsuario, useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ciop:navegacao-recolhida";

/** Categorias do menu: o clique abre a página de cards da área (em vez de expandir o menu). */
const CATEGORIAS_SIDEBAR = [
  { slug: "comercial", categoria: "categoria-comercial", label: "Comercial", sigla: "COM" },
  { slug: "departamento-pessoal", categoria: "categoria-departamento-pessoal", label: "Departamento pessoal", sigla: "DP" },
  { slug: "financeiro", categoria: "categoria-financeiro", label: "Financeiro", sigla: "FIN" },
  { slug: "operacional", categoria: "categoria-operacional", label: "Operacional", sigla: "OP" },
  { slug: "recursos-humanos", categoria: "categoria-recursos-humanos", label: "Recursos humanos", sigla: "RH" },
  { slug: "suprimentos", categoria: "categoria-suprimentos", label: "Suprimentos", sigla: "SUP" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const caminho = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { podeVerCategoria } = useMinhasPermissoes();
  const { user } = useSessao();
  const [menuMobile, setMenuMobile] = useState(false);
  const [recolhida, setRecolhida] = useState(false);

  useEffect(() => {
    try {
      setRecolhida(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setRecolhida(false);
    }
  }, []);

  useEffect(() => setMenuMobile(false), [caminho]);

  const alternar = () => {
    setRecolhida((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(STORAGE_KEY, proximo ? "1" : "0");
      } catch {
        // A navegação continua funcional sem persistência local.
      }
      return proximo;
    });
  };

  const inicioItem = operacionalNavItems.find((item) => item.to === "/");

  const sair = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  };

  const navigation = (
    <>
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="NXS — página inicial">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary font-display text-xs text-sidebar-primary-foreground shadow-xs">N</span>
          {!recolhida && <span className="truncate font-display text-sm text-sidebar-foreground">NXS</span>}
          {!recolhida && <span className="border-l border-sidebar-border pl-3 text-[10px] font-semibold uppercase text-sidebar-foreground/55">Sistemas</span>}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegação principal">
        {!recolhida && <p className="px-3 pb-3 text-[10px] font-semibold uppercase text-sidebar-foreground/45">Índice de áreas</p>}
        {inicioItem && (
          <Link
            to="/"
            title={recolhida ? inicioItem.label : undefined}
            aria-current={caminho === "/" ? "page" : undefined}
            className={cn(
              "group flex h-10 min-w-0 items-center gap-3 rounded-md border-l-2 px-3 text-sm font-medium transition-colors duration-150",
              caminho === "/"
                ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                : "border-transparent text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
          >
            <inicioItem.icon className={cn("size-4 shrink-0", caminho === "/" && "text-primary")} />
            {!recolhida && <span className="truncate">{inicioItem.label}</span>}
            {caminho === "/" && <span className="ml-auto text-[9px] font-semibold text-sidebar-foreground/55">01</span>}
          </Link>
        )}

        {CATEGORIAS_SIDEBAR.map((cat) => {
          if (!podeVerCategoria(cat.categoria)) return null;
          const selecionada = caminho === `/categoria/${cat.slug}`;
          return (
            <Link
              key={cat.categoria}
              to="/categoria/$cat"
              params={{ cat: cat.slug }}
              title={recolhida ? cat.sigla : undefined}
              aria-current={selecionada ? "page" : undefined}
              className={cn(
                "mt-3 flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                selecionada
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/55",
              )}
            >
              <span className="truncate">{recolhida ? cat.sigla : cat.label}</span>
              {!recolhida && <ChevronRight className="size-4 shrink-0 opacity-60" />}
            </Link>
          );
        })}
      </nav>


      <div className="space-y-2 border-t border-sidebar-border p-2">
        <Button
          asChild
          variant="ghost"
          size={recolhida ? "icon" : "sm"}
          className={cn(
            "w-full border border-sidebar-border bg-sidebar-accent/55 text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            !recolhida && "justify-start",
          )}
        >
          <Link to="/instalar" title="Instalar aplicativo"><Download />{!recolhida && "Instalar aplicativo"}</Link>
        </Button>
        {!recolhida && (
          <ThemeToggle className="h-9 w-full justify-start border-sidebar-border bg-sidebar-accent/55 px-3 text-xs text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        )}
        <Button variant="ghost" size={recolhida ? "icon" : "sm"} className={cn("w-full text-destructive hover:bg-destructive/10 hover:text-destructive", !recolhida && "justify-start")} onClick={sair} title="Sair">
          <LogOut />{!recolhida && "Sair"}
        </Button>
      </div>
      {!recolhida && user && (
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="truncate text-xs font-medium text-sidebar-foreground">{nomeDoUsuario(user)}</p>
          <p className="truncate text-[11px] text-sidebar-foreground/50">Sessão ativa</p>
        </div>
      )}
    </>
  );

  return (
    <div className={cn("app-shell min-h-screen", recolhida ? "lg:pl-16" : "lg:pl-64")}>
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar shadow-panel lg:flex", recolhida ? "w-16" : "w-64")}>
        {navigation}
        <Button variant="ghost" size="icon" onClick={alternar} className="absolute -right-4 top-16 size-8 rounded-full border bg-background shadow-xs" title={recolhida ? "Expandir menu" : "Recolher menu"}>
          {recolhida ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </aside>

      {menuMobile && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button className="absolute inset-0 bg-background/80" onClick={() => setMenuMobile(false)} aria-label="Fechar menu" />
          <aside className="relative flex h-full w-[min(19rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-panel">
            {navigation}
            <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => setMenuMobile(false)} aria-label="Fechar menu"><X /></Button>
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMenuMobile(true)} aria-label="Abrir menu"><Menu /></Button>
          <span className="ml-3 grid size-8 place-items-center rounded-md bg-primary font-display text-xs text-primary-foreground">N</span>
          <span className="ml-2 truncate font-display text-sm">NXS</span>
          <span className="ml-2 border-l border-border pl-2 text-[10px] font-semibold uppercase text-muted-foreground">Sistemas</span>
        </div>
        <div className="app-workspace min-w-0">{children}</div>
      </div>
    </div>
  );
}
