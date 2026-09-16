import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Download, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { allNavItems } from "@/components/FloatingNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useMinhasPermissoes } from "@/hooks/use-minhas-permissoes";
import { nomeDoUsuario, useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ciop:navegacao-recolhida";

export function AppShell({ children }: { children: ReactNode }) {
  const caminho = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { podeVer } = useMinhasPermissoes();
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

  const itens = allNavItems.filter((item) => item.to === "/" || podeVer(item.to));
  const ativo = (to: string) => (to === "/" ? caminho === "/" : caminho.startsWith(to));
  const sair = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  };

  const navigation = (
    <>
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="CIOP — página inicial">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-display text-xs font-bold text-primary-foreground">CP</span>
          {!recolhida && <span className="truncate font-display text-sm font-semibold text-sidebar-foreground">CIOP Operacional</span>}
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        <ul className="space-y-0.5">
          {itens.map((item) => {
            const selecionado = ativo(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  title={recolhida ? item.label : undefined}
                  aria-current={selecionado ? "page" : undefined}
                  className={cn(
                    "group flex h-9 min-w-0 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors duration-150",
                    selecionado
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", selecionado && "text-primary")} />
                  {!recolhida && <span className="truncate">{item.label}</span>}
                  {selecionado && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-2">
        <Button asChild variant="ghost" size={recolhida ? "icon" : "sm"} className={cn("w-full", !recolhida && "justify-start")}>
          <Link to="/instalar" title="Instalar aplicativo"><Download />{!recolhida && "Instalar aplicativo"}</Link>
        </Button>
        {!recolhida && <ThemeToggle className="h-8 w-full justify-start border-0 bg-transparent px-3 text-xs shadow-none" />}
        <Button variant="ghost" size={recolhida ? "icon" : "sm"} className={cn("w-full text-destructive hover:bg-destructive/10 hover:text-destructive", !recolhida && "justify-start")} onClick={sair} title="Sair">
          <LogOut />{!recolhida && "Sair"}
        </Button>
      </div>
      {!recolhida && user && (
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="truncate text-xs font-medium text-sidebar-foreground">{nomeDoUsuario(user)}</p>
          <p className="truncate text-[11px] text-muted-foreground">Sessão ativa</p>
        </div>
      )}
    </>
  );

  return (
    <div className={cn("app-shell min-h-screen", recolhida ? "lg:pl-16" : "lg:pl-60")}>
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex", recolhida ? "w-16" : "w-60")}>
        {navigation}
        <Button variant="ghost" size="icon" onClick={alternar} className="absolute -right-4 top-20 size-8 rounded-full border bg-background shadow-xs" title={recolhida ? "Expandir menu" : "Recolher menu"}>
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
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/95 px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMenuMobile(true)} aria-label="Abrir menu"><Menu /></Button>
          <span className="ml-3 truncate font-display text-sm font-semibold">CIOP Operacional</span>
        </div>
        <div className="app-workspace min-w-0">{children}</div>
      </div>
    </div>
  );
}