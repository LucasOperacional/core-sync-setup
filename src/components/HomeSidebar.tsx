import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, LogOut, Menu, PanelLeftClose, X, MapPin } from "lucide-react";

import { allNavItems } from "@/components/FloatingNav";
import { ThemeToggle } from "@/components/ThemeToggle";

import { useMinhasPermissoes } from "@/hooks/use-minhas-permissoes";
import { nomeDoUsuario, useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";

const CHAVE_ABERTO = "home-sidebar-aberta";

/**
 * Menu lateral da página inicial. Funciona em conjunto com o menu flutuante:
 * o usuário pode usar os dois.
 */
export function HomeSidebar() {
  const router = useRouter();
  const { podeVer } = useMinhasPermissoes();
  const [aberta, setAberta] = useState(false);

  const currentPath = router.state.location.pathname;
  const itens = allNavItems.filter((item) => item.to === "/" || podeVer(item.to));

  const navigate = useNavigate();
  const { user } = useSessao();
  const [accessTime, setAccessTime] = useState("");

  useEffect(() => {
    const now = new Date();
    setAccessTime(
      now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) +
        " " +
        now.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  useEffect(() => {
    try {
      setAberta(localStorage.getItem(CHAVE_ABERTO) === "1");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const alternar = () => {
    setAberta((v) => {
      const proximo = !v;
      try {
        localStorage.setItem(CHAVE_ABERTO, proximo ? "1" : "0");
      } catch {
        /* armazenamento indisponível */
      }
      return proximo;
    });
  };

  const ativo = (to: string) => (to === "/" ? currentPath === "/" : currentPath.startsWith(to));

  return (
    <>
      {/* Botão para abrir o menu lateral */}
      {!aberta && (
        <button
          onClick={alternar}
          className="fixed left-4 top-4 z-[60] flex items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-foreground shadow-lg backdrop-blur-xl transition-colors hover:bg-accent hover:text-accent-foreground sm:min-w-[220px] sm:px-5"
          aria-label="Abrir menu lateral"
          aria-expanded={false}
        >
          <Menu className="size-4 shrink-0" strokeWidth={2.5} />
          <span className="hidden sm:inline">Menu</span>
        </button>
      )}

      {/* Fundo escuro no celular */}
      {aberta && (
        <button
          className="fixed inset-0 z-[55] bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={alternar}
          aria-label="Fechar menu lateral"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[60] flex w-64 flex-col border-r border-border bg-background/95 shadow-2xl backdrop-blur-xl transition-transform duration-300
          ${aberta ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Menu lateral"
        aria-hidden={!aberta}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-foreground">Páginas</p>
          <button
            onClick={alternar}
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Fechar menu lateral"
          >
            <span className="lg:hidden">
              <X className="size-5" />
            </span>
            <span className="hidden lg:inline">
              <PanelLeftClose className="size-5" />
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="flex flex-col gap-1">
            {itens.map((item) => {
              const estaAtivo = ativo(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium uppercase tracking-wide transition-colors
                      ${estaAtivo ? `${item.activeBg} ${item.activeColor}` : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                    aria-current={estaAtivo ? "page" : undefined}
                  >
                    <item.icon className="size-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link
            to="/instalar"
            className="mt-3 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="size-5 shrink-0" />
            <span className="truncate">Instalar app</span>
          </Link>
        </nav>

        <div className="border-t border-border px-4 py-3">
          <ThemeToggle className="w-full justify-center" />
        </div>

        <div className="border-t border-border px-4 py-4">
          {user ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Usuário
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {nomeDoUsuario(user)}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Acesso
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{accessTime}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 hover:text-destructive"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Carregando usuário...</p>
          )}
        </div>
      </aside>
    </>
  );
}
