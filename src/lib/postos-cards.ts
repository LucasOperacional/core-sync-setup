/**
 * Fonte ÚNICA dos cards de posto da página de Protocolo de Folhas de Ponto.
 *
 * Junta tudo o que o sistema sabe sobre a lotação de cada pessoa:
 *  - folhas já protocoladas (protocolo_folhas)
 *  - funcionários ativos importados (funcionarios_ativos)
 *  - pessoas sincronizadas da NEXTI (nexti_persons + empresas/postos)
 *
 * Assim os contadores do topo da página e os contadores por lotação mostram
 * exatamente os mesmos números, sem depender de qual importação foi feita.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { normalizarTextoProtocolo, protocoloFolhasQueryKeys } from "@/lib/protocolo-folhas-sync";
import { contarReservasNexti } from "@/lib/nexti-reservas.functions";

export type OrigemPessoaPosto = "folha" | "ativo" | "nexti";

export type PessoaPosto = {
  nome: string;
  empresa: string;
  cargo: string;
  posto: string;
  origem: OrigemPessoaPosto;
};

export const POSTOS_CARDS_QUERY_KEY = protocoloFolhasQueryKeys.postosCards;

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function normalizar(valor: string): string {
  return normalizarTextoProtocolo(valor).toLowerCase();
}

/** Chave usada para não contar a mesma pessoa duas vezes entre as três origens. */
function chavePessoa(p: PessoaPosto): string {
  return `${normalizar(p.nome)}|${normalizar(p.empresa)}`;
}

async function paginado<T>(
  consulta: (inicio: number, fim: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000;
  const todos: T[] = [];
  for (let inicio = 0; inicio < 50_000; inicio += PAGINA) {
    const { data, error } = await consulta(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todos;
}

type LinhaFolha = {
  colaborador: string | null;
  empresa: string | null;
  cargo: string | null;
  posto: string | null;
};
type LinhaAtivo = {
  nome: string | null;
  empresa: string | null;
  cargo: string | null;
  posto: string | null;
};
type LinhaNextiPessoa = {
  nome: string | null;
  situacao: string | null;
  situacao_id: number | null;
  demission_date: string | null;
  company_id: number | null;
  workplace_id: number | null;
  workplace_name: string | null;
  career_name: string | null;
};

/** Considera apenas quem continua trabalhando na NEXTI. */
function trabalhandoNaNexti(p: LinhaNextiPessoa): boolean {
  if (p.demission_date) return false;
  const situacao = normalizar(texto(p.situacao));
  if (situacao) return situacao.startsWith("trabalhando");
  return p.situacao_id !== 2;
}

/** Carrega e unifica as três origens de lotação. */
export async function carregarPessoasPostos(): Promise<PessoaPosto[]> {
  const [folhas, ativos, pessoasNexti, empresasNexti, postosNexti] = await Promise.all([
    paginado<LinhaFolha>(async (i, f) => {
      const { data, error } = await supabase
        .from("protocolo_folhas")
        .select("colaborador, empresa, cargo, posto")
        .range(i, f);
      return { data: (data ?? []) as LinhaFolha[], error };
    }),
    paginado<LinhaAtivo>(async (i, f) => {
      const { data, error } = await supabase
        .from("funcionarios_ativos")
        .select("nome, empresa, cargo, posto")
        .eq("ativo", true)
        .range(i, f);
      return { data: (data ?? []) as LinhaAtivo[], error };
    }),
    paginado<LinhaNextiPessoa>(async (i, f) => {
      const { data, error } = await supabase
        .from("nexti_persons")
        .select(
          "nome, situacao, situacao_id, demission_date, company_id, workplace_id, workplace_name, career_name",
        )
        .range(i, f);
      return { data: (data ?? []) as LinhaNextiPessoa[], error };
    }),
    paginado<{ nexti_id: number; company_name: string | null; fantasy_name: string | null }>(
      async (i, f) => {
        const { data, error } = await supabase
          .from("nexti_companies")
          .select("nexti_id, company_name, fantasy_name")
          .range(i, f);
        return { data: (data ?? []) as never, error };
      },
    ),
    paginado<{ nexti_id: number; name: string | null }>(async (i, f) => {
      const { data, error } = await supabase
        .from("nexti_workplaces")
        .select("nexti_id, name")
        .range(i, f);
      return { data: (data ?? []) as never, error };
    }),
  ]);

  const nomeEmpresa = new Map<number, string>();
  for (const e of empresasNexti) {
    const nome = texto(e.fantasy_name) || texto(e.company_name);
    if (e.nexti_id !== null && nome) nomeEmpresa.set(Number(e.nexti_id), nome);
  }
  const nomePosto = new Map<number, string>();
  for (const w of postosNexti) {
    const nome = texto(w.name);
    if (w.nexti_id !== null && nome) nomePosto.set(Number(w.nexti_id), nome);
  }

  const pessoas: PessoaPosto[] = [];

  for (const f of folhas) {
    const nome = texto(f.colaborador);
    if (!nome) continue;
    pessoas.push({
      nome,
      empresa: texto(f.empresa),
      cargo: texto(f.cargo),
      posto: texto(f.posto),
      origem: "folha",
    });
  }

  for (const a of ativos) {
    const nome = texto(a.nome);
    if (!nome) continue;
    pessoas.push({
      nome,
      empresa: texto(a.empresa),
      cargo: texto(a.cargo),
      posto: texto(a.posto),
      origem: "ativo",
    });
  }

  for (const p of pessoasNexti) {
    const nome = texto(p.nome);
    if (!nome || !trabalhandoNaNexti(p)) continue;
    const posto =
      texto(p.workplace_name) ||
      (p.workplace_id !== null ? (nomePosto.get(Number(p.workplace_id)) ?? "") : "");
    const empresa = p.company_id !== null ? (nomeEmpresa.get(Number(p.company_id)) ?? "") : "";
    pessoas.push({ nome, empresa, cargo: texto(p.career_name), posto, origem: "nexti" });
  }

  // Mantém uma linha por pessoa, preferindo o registro que tem lotação informada.
  const melhor = new Map<string, PessoaPosto>();
  for (const p of pessoas) {
    const chave = chavePessoa(p);
    const atual = melhor.get(chave);
    if (!atual) {
      melhor.set(chave, p);
      continue;
    }
    const ganhouPosto = !atual.posto && !!p.posto;
    const ganhouCargo = !atual.cargo && !!p.cargo;
    if (ganhouPosto || ganhouCargo) {
      melhor.set(chave, {
        nome: atual.nome,
        empresa: atual.empresa || p.empresa,
        cargo: atual.cargo || p.cargo,
        posto: atual.posto || p.posto,
        origem: atual.origem,
      });
    }
  }

  return [...melhor.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Consulta compartilhada pelos dois blocos de cards da página. */
export function usePessoasPostos() {
  return useQuery({
    queryKey: POSTOS_CARDS_QUERY_KEY,
    queryFn: carregarPessoasPostos,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });
}

export type DefinicaoCategoriaPosto = {
  chave: string;
  titulo: string;
  /** Recebe posto e cargo normalizados (minúsculas, sem acento) e a empresa. */
  combina: (posto: string, cargo: string, empresa: string) => boolean;
};

/** Categorias de lotação acompanhadas nos cards (mesmas regras nos dois blocos). */
export const CATEGORIAS_POSTO: DefinicaoCategoriaPosto[] = [
  { chave: "inss", titulo: "INSS", combina: (posto) => posto.includes("inss") },
  {
    chave: "desaparecidos",
    titulo: "DESAPARECIDOS",
    combina: (posto) => posto.includes("desaparecid"),
  },
  {
    chave: "maternidade",
    titulo: "MATERNIDADE",
    combina: (posto) => posto.includes("maternidade"),
  },
  { chave: "audiencia", titulo: "AUDIENCIA", combina: (posto) => posto.includes("audiencia") },
  {
    chave: "jatista",
    titulo: "JATISTA",
    combina: (posto, cargo) => posto.includes("jatista") || cargo.includes("jatista"),
  },
  {
    chave: "reserva-noturno",
    titulo: "RESERVA - PORTARIA - NOTURNO",
    combina: (posto, cargo) => {
      const alvo = `${posto} ${cargo}`;
      if (alvo.includes("ipe")) return false;
      return alvo.includes("reserva") && (alvo.includes("noturno") || alvo.includes("noturna"));
    },
  },
  {
    chave: "reserva-portaria-diurno",
    titulo: "RESERVA - PORTARIA - DIURNO",
    combina: (posto, cargo) => {
      const alvo = `${posto} ${cargo}`;
      return (
        alvo.includes("reserva") &&
        alvo.includes("portaria") &&
        !alvo.includes("noturno") &&
        !alvo.includes("noturna")
      );
    },
  },
  {
    chave: "reserva-asg-tektron",
    titulo: "RESERVA - ASG - TEKTRON",
    combina: (posto, cargo, empresa) => {
      const alvo = `${posto} ${cargo}`;
      return (
        alvo.includes("reserva") &&
        alvo.includes("asg") &&
        (empresa.includes("tektron") || alvo.includes("tektron"))
      );
    },
  },
  {
    chave: "reserva-encarregados",
    titulo: "RESERVA ENCARREGADOS",
    combina: (posto, cargo) => {
      const alvo = `${posto} ${cargo}`;
      return alvo.includes("reserva") && alvo.includes("encarregad");
    },
  },
];

export type PessoaCard = { nome: string; empresa: string; posto: string; cargo: string };

/** Agrupa as pessoas unificadas nas categorias de posto, sem repetir ninguém. */
export function agruparPorCategoria(pessoas: PessoaPosto[]): Record<string, PessoaCard[]> {
  const grupos: Record<string, PessoaCard[]> = {};
  const vistos: Record<string, Set<string>> = {};
  for (const c of CATEGORIAS_POSTO) {
    grupos[c.chave] = [];
    vistos[c.chave] = new Set<string>();
  }

  for (const p of pessoas) {
    const posto = normalizar(p.posto);
    const cargo = normalizar(p.cargo);
    const empresa = normalizar(p.empresa);
    for (const c of CATEGORIAS_POSTO) {
      if (!c.combina(posto, cargo, empresa)) continue;
      const chave = chavePessoa(p);
      if (vistos[c.chave]!.has(chave)) continue;
      vistos[c.chave]!.add(chave);
      grupos[c.chave]!.push({
        nome: p.nome || "Sem nome",
        empresa: p.empresa,
        posto: p.posto,
        cargo: p.cargo,
      });
    }
  }

  for (const lista of Object.values(grupos)) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return grupos;
}

/** Junta as pessoas vindas ao vivo da NEXTI com as do banco, sem duplicar. */
export function mesclarPessoasCard(
  doBanco: PessoaCard[] | undefined,
  daNexti: Array<{ nome: string; empresa: string; posto?: string; cargo?: string }> | undefined,
): PessoaCard[] {
  const mapa = new Map<string, PessoaCard>();
  for (const p of doBanco ?? []) {
    mapa.set(`${normalizar(p.nome)}|${normalizar(p.empresa)}`, p);
  }
  for (const p of daNexti ?? []) {
    const nome = texto(p.nome) || "Sem nome";
    const empresa = texto(p.empresa);
    const chave = `${normalizar(nome)}|${normalizar(empresa)}`;
    if (mapa.has(chave)) continue;
    mapa.set(chave, { nome, empresa, posto: texto(p.posto), cargo: texto(p.cargo) });
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Consulta ao vivo na NEXTI com as pessoas de cada categoria de posto. */
export function useReservasNextiCards() {
  const contarNexti = useServerFn(contarReservasNexti);
  return useQuery({
    queryKey: protocoloFolhasQueryKeys.reservasNexti,
    queryFn: () => contarNexti({ data: {} as never }),
    staleTime: 5 * 60 * 1000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });
}

/**
 * Fonte ÚNICA de TODOS os cards de posto: junta o banco (folhas + ativos +
 * NEXTI sincronizada) com a consulta ao vivo da NEXTI, sem repetir ninguém.
 * Assim todo card mostra a quantidade exata e os nomes exatos do posto.
 */
export function useCategoriasPostos() {
  const pessoasQuery = usePessoasPostos();
  const nextiQuery = useReservasNextiCards();

  const categorias = useMemo(() => {
    const doBanco = agruparPorCategoria(pessoasQuery.data ?? []);
    const aoVivo = new Map((nextiQuery.data?.grupos ?? []).map((g) => [g.chave, g]));
    const resultado: Record<string, PessoaCard[]> = {};
    for (const c of CATEGORIAS_POSTO) {
      resultado[c.chave] = mesclarPessoasCard(
        doBanco[c.chave],
        aoVivo.get(c.chave)?.pessoas.map((p) => ({
          nome: p.nome || "Sem nome",
          empresa: p.empresa || "",
          posto: p.posto,
          cargo: p.cargo,
        })),
      );
    }
    return resultado;
  }, [pessoasQuery.data, nextiQuery.data]);

  return {
    categorias,
    carregando:
      (pessoasQuery.isLoading && !pessoasQuery.data) || (nextiQuery.isLoading && !nextiQuery.data),
    atualizando: pessoasQuery.isFetching || nextiQuery.isFetching,
    erroNexti: nextiQuery.isError || nextiQuery.data?.ok === false,
  };
}
