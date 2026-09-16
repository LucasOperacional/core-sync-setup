import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizar, type AtivoImportado } from "@/lib/ativos-planilha";
import { filtrarFuncionariosExcluidos } from "@/lib/funcionarios-excluidos";

export type FuncionarioAtivo = {
  id: string;
  nome: string;
  nome_normalizado: string;
  empresa: string;
  empresa_normalizada: string;
  matricula: string;
  cargo: string;
  /** Posto vindo da importação (planilha ou API da NEXTI), quando disponível. */
  posto?: string | null;
};

/** FuncionarioAtivo com informação de posto vinda das folhas protocoladas (opcional). */
export type FuncionarioAtivoComPosto = FuncionarioAtivo & {
  posto?: string | null;
};

export type LinhaAtivoBanco = {
  nome: string;
  nome_normalizado: string;
  empresa: string;
  empresa_normalizada: string;
  matricula: string;
  cargo: string;
  created_by: string | null;
};

/** Resultado detalhado da importação para exibição ao usuário. */
export type ResultadoImportacao = {
  importados: number;
  atualizados: number;
  ignorados: number;
  rejeitados: number;
  total: number;
};

/** Converte os registros lidos da planilha em linhas prontas para o banco (mantém todas as linhas). */
export function paraLinhasBanco(
  ativos: AtivoImportado[],
  criadoPor: string | null,
): LinhaAtivoBanco[] {
  const linhas: LinhaAtivoBanco[] = [];
  for (const a of ativos) {
    const nome = a.nome.trim();
    if (!nome) continue;
    const empresa = a.empresa.trim();
    linhas.push({
      nome,
      nome_normalizado: normalizar(nome),
      empresa,
      empresa_normalizada: normalizar(empresa),
      matricula: a.matricula.trim(),
      cargo: (a.cargo ?? "").trim(),
      created_by: criadoPor,
    });
  }
  return linhas;
}

/**
 * Deduplica linhas pelo par (nome_normalizado + empresa_normalizada) e também
 * pelo par (empresa + matrícula) quando a matrícula está preenchida — esse é o
 * par com restrição de unicidade no banco.
 */
function deduplicarLinhas(linhas: LinhaAtivoBanco[]): LinhaAtivoBanco[] {
  const vistos = new Set<string>();
  const matriculas = new Set<string>();
  const resultado: LinhaAtivoBanco[] = [];
  for (const linha of linhas) {
    const chave = `${linha.nome_normalizado}|||${linha.empresa_normalizada}`;
    if (vistos.has(chave)) continue;
    const matricula = linha.matricula.trim();
    if (matricula && matricula !== "Não identificado") {
      const chaveMatricula = `${linha.empresa.trim().toUpperCase()}|||${matricula.toUpperCase()}`;
      if (matriculas.has(chaveMatricula)) continue;
      matriculas.add(chaveMatricula);
    }
    vistos.add(chave);
    resultado.push(linha);
  }
  return resultado;
}

/** Substitui a lista de ativos pelo conteúdo da planilha, inserindo TODAS as linhas.
 *  Retorna um objeto detalhado com a contagem de importados, atualizados, ignorados e rejeitados.
 */
export async function importarAtivosNoBanco(
  ativos: AtivoImportado[],
  criadoPor: string | null,
): Promise<ResultadoImportacao> {
  // Garantia final: funcionários da lista de exclusão nunca chegam ao banco.
  const { mantidos } = filtrarFuncionariosExcluidos(ativos);
  const linhasBrutas = paraLinhasBanco(mantidos, criadoPor);
  if (!linhasBrutas.length) throw new Error("Nenhuma linha válida encontrada na planilha.");

  // Deduplica para evitar conflitos de constraint ao inserir
  const linhas = deduplicarLinhas(linhasBrutas);

  // A planilha é a fonte da verdade: limpa a lista antes para o total bater exatamente.
  await limparAtivosDoBanco();

  const TAMANHO = 500;
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += TAMANHO) {
    const lote = linhas.slice(i, i + TAMANHO);
    const { data, error } = await supabase.from("funcionarios_ativos").insert(lote).select("id");
    if (error) {
      throw new Error(
        `Falha ao gravar lote ${Math.floor(i / TAMANHO) + 1}: ${error.message || "Erro desconhecido no banco."}`,
      );
    }
    gravados += data?.length ?? lote.length;
  }

  return {
    importados: gravados,
    atualizados: 0,
    ignorados: linhasBrutas.length - linhas.length,
    rejeitados: 0,
    total: gravados,
  };
}

/** Consulta a contagem real de funcionários ativos no banco. */
export async function contarAtivosNoBanco(): Promise<number> {
  const { count, error } = await supabase
    .from("funcionarios_ativos")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function limparAtivosDoBanco(): Promise<number> {
  let apagados = 0;
  // Apaga em rodadas por lote de ids: garante progresso mesmo com limite de linhas do PostgREST.
  for (let tentativa = 0; tentativa < 200; tentativa += 1) {
    const { data: ids, error: erroBusca } = await supabase
      .from("funcionarios_ativos")
      .select("id")
      .limit(500);
    if (erroBusca) throw new Error(erroBusca.message || "Falha ao ler a lista para apagar.");
    const lote = (ids ?? []).map((r) => (r as { id: string }).id);
    if (lote.length === 0) break;

    const { data, error } = await supabase
      .from("funcionarios_ativos")
      .delete()
      .in("id", lote)
      .select("id");
    if (error) throw new Error(error.message || "Falha ao apagar a lista.");
    const removidos = data?.length ?? 0;
    if (removidos === 0) {
      throw new Error(
        "Nenhum registro pôde ser apagado. Faça login novamente com uma conta de administrador e tente de novo.",
      );
    }
    apagados += removidos;
  }

  const { count, error: erroContagem } = await supabase
    .from("funcionarios_ativos")
    .select("id", { count: "exact", head: true });
  if (!erroContagem && (count ?? 0) > 0) {
    throw new Error(`Ainda restam ${count} registros que não puderam ser apagados.`);
  }
  return apagados;
}

export function useAtivosBanco() {
  return useQuery({
    queryKey: ["funcionarios-ativos"],
    queryFn: async () => {
      // Busca paginada: o PostgREST devolve no máximo 1000 linhas por requisição.
      const PAGINA = 1000;
      const todos: FuncionarioAtivo[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from("funcionarios_ativos")
          .select(
            "id, nome, nome_normalizado, empresa, empresa_normalizada, matricula, cargo, posto",
          )
          .order("empresa", { ascending: true })
          .order("nome", { ascending: true })
          .range(inicio, inicio + PAGINA - 1);
        if (error) throw error;
        const lote = (data ?? []) as FuncionarioAtivo[];
        todos.push(...lote);
        if (lote.length < PAGINA) break;
      }
      return todos;
    },
  });
}

export type FolhaProtocolada = {
  colaborador: string;
  empresa: string;
  cargo: string;
  posto: string;
};

export function useFolhasProtocoladas() {
  return useQuery({
    queryKey: ["folhas-protocoladas"],
    queryFn: async () => {
      const PAGINA = 1000;
      const todas: FolhaProtocolada[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from("protocolo_folhas")
          .select("colaborador, empresa, cargo, posto")
          .order("id", { ascending: true })
          .range(inicio, inicio + PAGINA - 1);
        if (error) throw error;
        const lote = (data ?? []) as FolhaProtocolada[];
        todas.push(...lote);
        if (lote.length < PAGINA) break;
      }
      return todas;
    },
  });
}

/** Folha protocolada com informação do protocolo pai (id, titulo, empresa). */
export type FolhaProtocoladaComProtocolo = {
  colaborador: string;
  empresa: string;
  cargo: string;
  posto: string;
  ordem: number;
  pagina: number | null;
  protocolo_id: string;
  protocolo_titulo: string;
  protocolo_empresa: string | null;
};

/** Busca todas as folhas protocoladas com join no protocolo pai para agrupar por protocolo. */
export function useFolhasProtocoladasComProtocolo() {
  return useQuery({
    queryKey: ["folhas-protocoladas-com-protocolo"],
    queryFn: async () => {
      const PAGINA = 1000;
      const todas: FolhaProtocoladaComProtocolo[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from("protocolo_folhas")
          .select(
            "colaborador, empresa, cargo, posto, ordem, pagina, protocolo_id, protocolos(titulo, empresa)",
          )
          .order("protocolo_id", { ascending: true })
          .order("ordem", { ascending: true })
          .range(inicio, inicio + PAGINA - 1);
        if (error) throw error;
        const lote = (data ?? []) as Array<{
          colaborador: string;
          empresa: string;
          cargo: string;
          posto: string;
          ordem: number;
          pagina: number | null;
          protocolo_id: string;
          protocolos: { titulo: string; empresa: string | null } | null;
        }>;
        for (const row of lote) {
          todas.push({
            colaborador: row.colaborador,
            empresa: row.empresa,
            cargo: row.cargo,
            posto: row.posto,
            ordem: row.ordem,
            pagina: row.pagina,
            protocolo_id: row.protocolo_id,
            protocolo_titulo: row.protocolos?.titulo || "Protocolo sem título",
            protocolo_empresa: row.protocolos?.empresa || null,
          });
        }
        if (lote.length < PAGINA) break;
      }
      return todas;
    },
  });
}

export type PendenciaEmpresa = {
  empresa: string;
  total: number;
  protocolados: number;
  faltantes: FuncionarioAtivoComPosto[];
  /** Funcionários da empresa que já constam em protocolos salvos. */
  listaProtocolados: FuncionarioAtivoComPosto[];
};

/** Retorna true se o posto (em maiúsculas) é "desaparecido" em qualquer variação. */
function isDesaparecido(posto: string): boolean {
  return posto === "DESAPARECIDO" || posto === "DESAPARECIDOS";
}

/**
 * Cria um mapa de nome_normalizado -> posto a partir das folhas protocoladas.
 * Prioridade: pega o posto mais "significativo" (INSS/AFASTADO/DESAPARECIDO/AUDIÊNCIA) se houver múltiplas folhas.
 */
function buildPostoMap(folhas: FolhaProtocolada[]): Map<string, string> {
  const POSTOS_ESPECIAIS = new Set([
    "INSS",
    "AFASTADO POR INSS",
    "AFASTADO INSS",
    "DESAPARECIDO",
    "DESAPARECIDOS",
    "AUDIENCIA",
    "AUDIÊNCIA",
  ]);
  const mapa = new Map<string, string>();
  for (const f of folhas) {
    const nome = normalizar(f.colaborador);
    if (!nome) continue;
    const postoAtual = (f.posto ?? "").trim().toUpperCase();
    if (!postoAtual) continue;
    const existente = mapa.get(nome);
    // Se já tem um posto especial gravado, não sobrescreve com um normal
    if (existente && POSTOS_ESPECIAIS.has(existente) && !POSTOS_ESPECIAIS.has(postoAtual)) continue;
    mapa.set(nome, postoAtual);
  }
  return mapa;
}

/**
 * Posto final do funcionário: o posto importado (planilha/NEXTI) tem prioridade;
 * quando ele não existe, usa o posto encontrado nas folhas protocoladas.
 */
function postoDoAtivo(ativo: FuncionarioAtivo, postoMap: Map<string, string>): string | null {
  const importado = (ativo.posto ?? "").trim();
  if (importado) return importado.toUpperCase();
  return postoMap.get(ativo.nome_normalizado) ?? null;
}

/** Cruza os ativos do banco com as folhas já protocoladas, agrupando por empresa. */
export function pendenciasPorEmpresa(
  ativos: FuncionarioAtivo[],
  folhas: FolhaProtocolada[],
): PendenciaEmpresa[] {
  const postoMap = buildPostoMap(folhas);

  const porEmpresa = new Map<string, Set<string>>();
  const globais = new Set<string>();
  for (const f of folhas) {
    const nome = normalizar(f.colaborador);
    if (!nome) continue;
    globais.add(nome);
    const chave = normalizar(f.empresa);
    const set = porEmpresa.get(chave) ?? new Set<string>();
    set.add(nome);
    porEmpresa.set(chave, set);
  }

  const grupos = new Map<string, FuncionarioAtivo[]>();
  for (const a of ativos) {
    const chave = a.empresa.trim() || "Sem empresa informada";
    const lista = grupos.get(chave) ?? [];
    lista.push(a);
    grupos.set(chave, lista);
  }

  return Array.from(grupos.entries())
    .map(([empresa, lista]) => {
      const doGrupo = porEmpresa.get(normalizar(empresa));
      const estaProtocolado = (a: FuncionarioAtivo) =>
        doGrupo ? doGrupo.has(a.nome_normalizado) : globais.has(a.nome_normalizado);
      const faltantes: FuncionarioAtivoComPosto[] = lista
        .filter((a) => !estaProtocolado(a))
        .map((a) => ({ ...a, posto: postoDoAtivo(a, postoMap) }));
      const listaProtocolados: FuncionarioAtivoComPosto[] = lista
        .filter(estaProtocolado)
        .map((a) => ({ ...a, posto: postoDoAtivo(a, postoMap) }));
      return {
        empresa,
        total: lista.length,
        protocolados: listaProtocolados.length,
        faltantes,
        listaProtocolados,
      };
    })
    .sort((a, b) => b.faltantes.length - a.faltantes.length);
}

/** Conjunto de nomes normalizados já protocolados (para marcar folhas do PDF). */
export function nomesProtocolados(folhas: { colaborador: string }[]): Set<string> {
  const set = new Set<string>();
  for (const f of folhas) {
    const nome = normalizar(f.colaborador);
    if (nome) set.add(nome);
  }
  return set;
}
