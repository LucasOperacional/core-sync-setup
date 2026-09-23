import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { minhasPermissoes } from "@/lib/user-permissions";

/**
 * Carrega as permissões de páginas do usuário logado.
 * Superadmin e administradores recebem acesso total pelo servidor.
 */
export function useMinhasPermissoes() {
  const carregar = useServerFn(minhasPermissoes);

  const query = useQuery({
    queryKey: ["minhas-permissoes"],
    staleTime: 60_000,
    queryFn: () => carregar(),
  });

  // O conjunto e as funções são reaproveitados entre renderizações: o menu e a
  // lista de módulos deixam de ser recalculados a cada clique na tela.
  const permitidas = useMemo(
    () => new Set((query.data ?? []).filter((p) => p.allowed).map((p) => p.pageKey)),
    [query.data],
  );

  const podeVer = useMemo(() => {
    const pronto = !query.isLoading && !!query.data;
    return (to: string) => {
      const key = pageKeyDaRota(to);
      if (!key) return true;
      if (!pronto) return false;
      return permitidas.has(key);
    };
  }, [permitidas, query.isLoading, query.data]);

  // Categorias do menu lateral: só ficam ocultas quando existe um registro
  // marcado como não permitido. Usuários antigos (sem registro) seguem vendo.
  const podeVerCategoria = useMemo(() => {
    const registros = query.data ?? [];
    return (chave: string) => {
      const encontrado = registros.find((p) => p.pageKey === chave);
      return encontrado ? encontrado.allowed : true;
    };
  }, [query.data]);

  return {
    carregando: query.isLoading,
    permitidas,
    /** A rota "/" (início) é sempre liberada. */
    podeVer,
    podeVerCategoria,
  };
}

/** Rotas renomeadas que continuam usando a chave de permissão antiga. */
const ALIASES: Record<string, string> = {
  coordenacao: "vagas",
  "aprovacao-de-vagas": "vagas",
  "vagas-aprovadas": "vagas",
  "movimentacao-posto": "supervisor",
  "coordenacao-movimentacoes": "vagas",
  "coordenacao-crt": "vagas",
  "comercial-clientes": "comercial",
  "comercial-funil": "comercial",
  "comercial-propostas": "comercial",
  "comercial-agenda": "comercial",
  "comercial-contratos": "comercial",
  "comercial-relatorios": "comercial",
  "ponto-espelho": "ponto",
  "ponto-ajustes": "ponto",
  "ponto-painel": "ponto",
  "ponto-funcionarios": "ponto",
  "ponto-empresas": "ponto",
  "ponto-escalas": "ponto",
  "ponto-banco-horas": "ponto",
  "ponto-faltas": "ponto",
  "ponto-aprovacoes": "ponto",
  "ponto-fechamento": "ponto",
  "ponto-relatorios": "ponto",
  "ponto-configuracoes": "ponto",
  "ponto-auditoria": "ponto",
};

/** Converte um caminho de rota ("/control") na chave da página ("control"). */
function pageKeyDaRota(to: string) {
  const bruta = to.replace(/^\/+/, "").split("/")[0] ?? "";
  return ALIASES[bruta] ?? bruta;
}
