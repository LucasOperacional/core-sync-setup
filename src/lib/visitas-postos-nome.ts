/**
 * Quantidade de visitas de cada posto, acessível pelo NOME do posto.
 *
 * As telas que mostram listas de postos (cards de gerente, painel de áreas,
 * dashboard do supervisor) guardam apenas o nome do posto, enquanto a tabela
 * de ajustes guarda o id. Este hook faz a ponte: lê os mesmos dados da página
 * "Quantidade de visitas por posto" (mesmas chaves de consulta, então nada é
 * baixado duas vezes) e devolve um mapa nome -> quantidade + cor.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listarPostosMapa, type PostoMapa } from "@/lib/nexti-postos-mapa.functions";
import { semaforoDe, type Semaforo } from "@/lib/visitas-semaforo";

/** Mesmo jeito de comparar nomes usado na atribuição em massa (sem acentos, maiúsculas). */
export const normalizarNomePosto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export type VisitaPorNome = { qtd: number; cor: Semaforo };

export function useVisitasPorNomePosto(enabled = true) {
  const listar = useServerFn(listarPostosMapa);

  const postosQ = useQuery({
    queryKey: ["visitas-por-posto"],
    queryFn: () => listar(),
    staleTime: 10 * 60_000,
    enabled,
  });

  const ajustesQ = useQuery({
    queryKey: ["postos-visitas-ajuste"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("postos_visitas_ajuste")
        .select("posto_id, quantidade");
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.posto_id] = r.quantidade;
      return m;
    },
    staleTime: 10 * 60_000,
    enabled,
  });

  const porNome = useMemo(() => {
    const m = new Map<string, VisitaPorNome>();
    const aj = ajustesQ.data ?? {};
    for (const p of (postosQ.data ?? []) as PostoMapa[]) {
      const total = aj[String(p.id)] ?? p.visitasRealizadas ?? 0;
      m.set(normalizarNomePosto(p.nome), { qtd: total, cor: semaforoDe(total) });
    }
    return m;
  }, [postosQ.data, ajustesQ.data]);

  return {
    porNome,
    carregando: postosQ.isLoading || ajustesQ.isLoading,
  };
}

/** Resumo por cor de uma lista de nomes de posto. */
export function resumirPorCor(nomes: string[], porNome: Map<string, VisitaPorNome>) {
  const c = { verde: 0, amarelo: 0, vermelho: 0, sem: 0 };
  for (const n of nomes) {
    const v = porNome.get(normalizarNomePosto(n));
    if (!v) c.sem++;
    else c[v.cor]++;
  }
  return c;
}
