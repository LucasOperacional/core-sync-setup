/**
 * Quantidade de visitas de cada posto, acessível pelo NOME do posto.
 *
 * As telas que mostram listas de postos (cards de gerente, painel de áreas,
 * dashboard do supervisor) guardam apenas o nome do posto, enquanto a tabela
 * de ajustes guarda o id. Este hook faz a ponte: lê os mesmos dados da página
 * "Quantidade de visitas por posto" (mesmas chaves de consulta, então nada é
 * baixado duas vezes) e devolve uma busca por nome.
 *
 * A busca aceita nomes abreviados: "CDL" encontra "CDL - GOIANIA" e
 * "APC DO BRASIL / NOTURNO" encontra "APC DO BRASIL-NOTURNO", porque a
 * comparação ignora acentos e símbolos e procura um nome dentro do outro.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listarPostosMapa, type PostoMapa } from "@/lib/nexti-postos-mapa.functions";
import { semaforoDe, type Semaforo } from "@/lib/visitas-semaforo";

/** Só letras e números, sem acentos e em maiúsculas: "CDL - GOIÂNIA" vira "CDL GOIANIA". */
export const normalizarNomePosto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
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

  const indice = useMemo(() => {
    const m = new Map<string, VisitaPorNome>();
    const aj = ajustesQ.data ?? {};
    for (const p of (postosQ.data ?? []) as PostoMapa[]) {
      const total = aj[String(p.id)] ?? p.visitasRealizadas ?? 0;
      m.set(normalizarNomePosto(p.nome), { qtd: total, cor: semaforoDe(total) });
    }
    return { m, chaves: [...m.keys()] };
  }, [postosQ.data, ajustesQ.data]);

  /**
   * Procura a quantidade de visitas de um posto pelo nome, aceitando nomes
   * abreviados ou escritos com símbolos diferentes. Quando mais de um posto
   * "contém" o nome digitado, vale o mais parecido (o menor).
   */
  const buscar = useCallback(
    (nome: string): VisitaPorNome | undefined => {
      const alvo = normalizarNomePosto(nome);
      if (!alvo) return undefined;
      const exato = indice.m.get(alvo);
      if (exato) return exato;
      let melhor: { chave: string; valor: VisitaPorNome } | undefined;
      for (const chave of indice.chaves) {
        const menor = Math.min(chave.length, alvo.length);
        if (menor < 3) continue;
        if (chave.includes(alvo) || alvo.includes(chave)) {
          if (!melhor || chave.length < melhor.chave.length) melhor = { chave, valor: indice.m.get(chave)! };
        }
      }
      return melhor?.valor;
    },
    [indice],
  );

  return {
    porNome: indice.m,
    buscar,
    carregando: postosQ.isLoading || ajustesQ.isLoading,
  };
}

/** Resumo por cor de uma lista de nomes de posto. */
export function resumirPorCor(
  nomes: string[],
  buscar: (nome: string) => VisitaPorNome | undefined,
) {
  const c = { verde: 0, amarelo: 0, vermelho: 0, sem: 0 };
  for (const n of nomes) {
    const v = buscar(n);
    if (!v) c.sem++;
    else c[v.cor]++;
  }
  return c;
}
