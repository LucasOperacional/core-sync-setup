import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Download, LogOut, MapPin, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { operacionalNavItems, rhNavItems } from "@/components/FloatingNav";
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
  const { podeVer, podeVerCategoria } = useMinhasPermissoes();
  const { user } = useSessao();
  const [menuMobile, setMenuMobile] = useState(false);
  const [recolhida, setRecolhida] = useState(false);
  const [operacionalAberta, setOperacionalAberta] = useState(false);
  const [rhAberta, setRhAberta] = useState(false);
  const [dpAberta, setDpAberta] = useState(false);
  const [comercialAberta, setComercialAberta] = useState(false);
  const [financeiroAberta, setFinanceiroAberta] = useState(false);
  const [suprimentosAberta, setSuprimentosAberta] = useState(false);



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
  const itensOperacional = operacionalNavItems.filter((item) => item.to !== "/" && podeVer(item.to));
  const itensRh = rhNavItems.filter((item) => podeVer(item.to));
  const ativo = (to: string) => (to === "/" ? caminho === "/" : caminho.startsWith(to));

  const sair = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  };

  const navigation = (
    <>
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="NXS — página inicial">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground shadow-xs">N</span>
          {!recolhida && <span className="truncate font-display text-base font-bold text-sidebar-foreground">NXS SISTEMAS</span>}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
        {!recolhida && <p className="px-3 pb-2 text-[10px] font-semibold uppercase text-sidebar-foreground/45">Menu principal</p>}
        {inicioItem && (
          <Link
            to="/"
            title={recolhida ? inicioItem.label : undefined}
            aria-current={ativo("/") ? "page" : undefined}
            className={cn(
              "group flex h-10 min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
              ativo("/")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
          >
            <inicioItem.icon className={cn("size-4 shrink-0", ativo("/") && "text-primary")} />
            {!recolhida && <span className="truncate">{inicioItem.label}</span>}
            {ativo("/") && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
          </Link>
        )}

        {podeVerCategoria("categoria-comercial") && (
          <button
            type="button"
            onClick={() => setComercialAberta((v) => !v)}
            aria-expanded={comercialAberta}
             className="mt-3 flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            title={recolhida ? "COM" : undefined}
          >
            <span className="truncate">{recolhida ? "COM" : "Comercial"}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", comercialAberta && "rotate-180")} />
          </button>
        )}

        {podeVerCategoria("categoria-comercial") && comercialAberta && (
          <ul className="mt-1 space-y-0.5">
            <li>
              <Link
                to="/prospeccao-maps"
                title={recolhida ? "Prospecção Google Maps" : undefined}
                aria-current={ativo("/prospeccao-maps") ? "page" : undefined}
                className={cn(
                  "group flex h-10 min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                  ativo("/prospeccao-maps")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <MapPin className={cn("size-4 shrink-0", ativo("/prospeccao-maps") && "text-primary")} />
                {!recolhida && <span className="truncate">Prospecção Google Maps</span>}
                {ativo("/prospeccao-maps") && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
              </Link>
            </li>
          </ul>
        )}

        {podeVerCategoria("categoria-departamento-pessoal") && (
          <button
            type="button"
            onClick={() => setDpAberta((v) => !v)}
            aria-expanded={dpAberta}
            className="flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            title={recolhida ? "DP" : undefined}
          >
            <span className="truncate">{recolhida ? "DP" : "Departamento pessoal"}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", dpAberta && "rotate-180")} />
          </button>
        )}

        {podeVerCategoria("categoria-financeiro") && (
          <button
            type="button"
            onClick={() => setFinanceiroAberta((v) => !v)}
            aria-expanded={financeiroAberta}
            className="flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            title={recolhida ? "FIN" : undefined}
          >
            <span className="truncate">{recolhida ? "FIN" : "Financeiro"}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", financeiroAberta && "rotate-180")} />
          </button>
        )}

        {podeVerCategoria("categoria-operacional") && (
          <>
          <button
            type="button"
            onClick={() => setOperacionalAberta((v) => !v)}
            aria-expanded={operacionalAberta}
            className="flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            title={recolhida ? "OP" : undefined}
          >
            <span className="truncate">{recolhida ? "OP" : "Operacional"}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", operacionalAberta && "rotate-180")} />
          </button>
          {operacionalAberta && (
            <ul className="mt-1 space-y-0.5">
              {itensOperacional.map((item) => {
                const selecionado = ativo(item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      title={recolhida ? item.label : undefined}
                      aria-current={selecionado ? "page" : undefined}
                      className={cn(
                        "group flex h-10 min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                        selecionado
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
          )}
          </>
        )}

        {podeVerCategoria("categoria-recursos-humanos") && itensRh.length > 0 && (
          (
            <>
              <button
                type="button"
                onClick={() => setRhAberta((v) => !v)}
                aria-expanded={rhAberta}
                className="flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                title={recolhida ? "RH" : undefined}
              >
                <span className="truncate">{recolhida ? "RH" : "Recursos humanos"}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", rhAberta && "rotate-180")} />
              </button>
              {rhAberta && (
                <ul className="mt-1 space-y-0.5">
                  {itensRh.map((item) => {
                    const selecionado = ativo(item.to);
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          title={recolhida ? item.label : undefined}
                          aria-current={selecionado ? "page" : undefined}
                          className={cn(
                              "group flex h-10 min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                            selecionado
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
              )}
            </>
          )
        )}

        {podeVerCategoria("categoria-suprimentos") && (
          <button
            type="button"
            onClick={() => setSuprimentosAberta((v) => !v)}
            aria-expanded={suprimentosAberta}
            className="flex h-9 w-full items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-sidebar-foreground/55 transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            title={recolhida ? "SUP" : undefined}
          >
            <span className="truncate">{recolhida ? "SUP" : "Suprimentos"}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-150", suprimentosAberta && "rotate-180")} />
          </button>
        )}
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
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/95 px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMenuMobile(true)} aria-label="Abrir menu"><Menu /></Button>
          <span className="ml-3 truncate font-display text-sm font-semibold">NXS SISTEMAS</span>
        </div>
        <div className="app-workspace min-w-0">{children}</div>
      </div>
    </div>
  );
}