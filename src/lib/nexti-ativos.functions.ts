import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";
import { nomeEstaExcluido } from "@/lib/funcionarios-excluidos";

export type ColaboradorNexti = {
  personId: number;
  personExternalId: string;
  colaborador: string;
  cargo: string;
  empresa: string;
  posto: string;
  matricula: string;
};

export type CadastroAusenciaNextiResultado = {
  ok: boolean;
  endpoint: string;
  httpStatus?: number;
  erro?: string;
};

export type ImportacaoNextiResultado = {
  ok: boolean;
  total: number;
  ignorados: number;
  duplicados: number;
  colaboradores: ColaboradorNexti[];
  erro?: string;
};

type Rec = Record<string, unknown>;

const PAGE_SIZE = 200;
const MAX_PAGES = 60;

/** Situações consideradas "trabalhando" (única situação sincronizada). */
const SITUACAO_TRABALHANDO = "TRABALHANDO";

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(obj: Rec, keys: string[]): unknown {
  for (const key of keys) {
    const direto = obj[key];
    if (direto !== undefined && direto !== null && direto !== "") return direto;
  }
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const real = lower.get(key.toLowerCase());
    if (real) {
      const value = obj[real];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function str(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRec(value)) {
    const nome = pick(value, ["name", "nome", "companyName", "fantasyName", "description"]);
    if (typeof nome === "string") return nome.trim();
  }
  return "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  if (isRec(value)) return num(pick(value, ["id", "nextiId", "code"]));
  return null;
}

function extrairLista(payload: unknown): Rec[] {
  if (Array.isArray(payload)) return payload.filter(isRec);
  if (!isRec(payload)) return [];
  for (const key of ["content", "data", "items", "list", "records", "result", "results", "rows"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRec);
    if (isRec(value)) {
      const nested = extrairLista(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/** Remove acentos e normaliza para comparação/dedupe. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Empresas autorizadas: somente colaboradores destas empresas são importados.
 * Qualquer outra empresa é ignorada.
 */
export const EMPRESAS_PERMITIDAS = [
  "GYN CONSERVAÇÃO E LIMPEZA LTDA",
  "PLANALTO CENTRAL LIMPEZA E CONSERVAÇÃO LTDA",
  "TEKTRON ADMINISTRAÇÃO E SERVICOS LTDA",
  "TEKTRON CONSERVACAO E LIMPEZA LTDA",
  "TEKTRON SERVICOS LIMPEZA E CONSERVACAO LTDA",
] as const;

/** Assinaturas mínimas para reconhecer cada empresa, mesmo com grafia diferente. */
const ASSINATURAS_EMPRESAS = [
  ["GYN", "CONSERVACAO"],
  ["PLANALTO", "CENTRAL"],
  ["TEKTRON", "ADMINISTRACAO"],
  ["TEKTRON", "CONSERVACAO"],
  ["TEKTRON", "SERVICOS"],
];

export function empresaPermitida(nome: string): boolean {
  const n = normalizar(nome);
  if (!n) return false;
  return ASSINATURAS_EMPRESAS.some((tokens) => tokens.every((t) => n.includes(t)));
}

/** Postos com a sigla FGR são ignorados na importação de ativos. */
export function postoBloqueado(posto: string): boolean {
  const n = normalizar(posto).replace(/[^A-Z0-9 ]/g, " ");
  return /(^| )FGR($| )/.test(n) || n.includes("FGR");
}

/** Busca todas as páginas de um recurso da NEXTI, tentando endpoints alternativos. */
async function buscarTudo(
  config: Awaited<ReturnType<typeof loadConfig>>,
  candidatos: string[],
  extraQuery?: Record<string, string | number | boolean>,
): Promise<Rec[]> {
  let ultimoErro = "Nenhum endpoint disponível.";
  for (const endpoint of candidatos) {
    try {
      const todos: Rec[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const query: Record<string, string | number | boolean> = { page, size: PAGE_SIZE };
        if (extraQuery) Object.assign(query, extraQuery);

        const resposta = await requestNexti({
          config,
          endpoint,
          method: "GET",
          query,
        });
        const lista = extrairLista(resposta.data);
        todos.push(...lista);
        if (lista.length < PAGE_SIZE) break;
      }
      return todos;
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(ultimoErro);
}

/**
 * Importa da API da NEXTI todos os colaboradores em situação TRABALHANDO
 * e substitui a lista de funcionários ativos por eles.
 * Somente as informações COLABORADOR, CARGO, EMPRESA e POSTO são consideradas.
 */
export const importarAtivosDaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportacaoNextiResultado> => {
    const ctx = context as { supabase: unknown; userId?: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      const config = await loadConfig(ctx.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      const pessoas = await buscarTudo(config, [
        "/api/persons/all",
        "/persons/all",
        "/api/person/all",
      ]);

      // Mapas de apoio: a NEXTI devolve na pessoa apenas os ids de empresa, posto e cargo.
      const empresas = new Map<number, string>();
      const postos = new Map<number, string>();
      const cargos = new Map<number, string>();
      const situacoes = new Map<number, string>();
      try {
        for (const c of await buscarTudo(config, ["/api/companies/all", "/companies/all"])) {
          const id = num(pick(c, ["id", "nextiId"]));
          const nome = str(pick(c, ["fantasyName", "companyName", "name", "razaoSocial"]));
          if (id !== null && nome) empresas.set(id, nome);
        }
      } catch {
        // Sem a lista de empresas seguimos com o que vier na própria pessoa.
      }
      try {
        for (const w of await buscarTudo(config, ["/api/workplaces/all", "/workplaces/all"])) {
          const id = num(pick(w, ["id", "nextiId"]));
          const nome = str(pick(w, ["name", "nome", "description"]));
          if (id !== null && nome) postos.set(id, nome);
        }
      } catch {
        // idem
      }
      try {
        for (const c of await buscarTudo(config, ["/api/careers/all", "/careers/all"])) {
          const id = num(pick(c, ["id", "nextiId"]));
          const nome = str(pick(c, ["name", "nome", "description"]));
          if (id !== null && nome) cargos.set(id, nome);
        }
      } catch {
        // idem
      }
      try {
        for (const s of await buscarTudo(config, [
          "/api/personSituations/all",
          "/personSituations/all",
          "/api/personSituation/all",
          "/api/situations/all",
        ])) {
          const id = num(pick(s, ["id", "nextiId"]));
          const nome = str(pick(s, ["name", "nome", "description", "descricao"]));
          if (id !== null && nome) situacoes.set(id, nome);
        }
      } catch {
        // Sem a tabela de situações usamos o id padrão de "Trabalhando" (1).
      }

      /** Descobre quais ids de situação correspondem a "Trabalhando". */
      const idsTrabalhando = new Set<number>();
      for (const [id, nome] of situacoes) {
        if (normalizar(nome).startsWith(SITUACAO_TRABALHANDO)) idsTrabalhando.add(id);
      }
      if (idsTrabalhando.size === 0) idsTrabalhando.add(1);

      let ignorados = 0;
      const vistos = new Set<string>();
      const matriculasVistas = new Set<string>();
      let duplicados = 0;
      const colaboradores: ColaboradorNexti[] = [];

      for (const p of pessoas) {
        // A situação pode vir como texto ou como id (personSituationId).
        const situacaoTexto = normalizar(str(pick(p, ["situation", "status", "situacao"])));
        const situacaoId = num(pick(p, ["personSituationId", "situationId", "situacaoId"]));
        const trabalhando = situacaoTexto
          ? situacaoTexto.startsWith(SITUACAO_TRABALHANDO)
          : situacaoId !== null && idsTrabalhando.has(situacaoId);

        // Sincroniza apenas quem está TRABALHANDO; todo o resto é ignorado.
        if (!trabalhando) {
          ignorados += 1;
          continue;
        }

        // Demitidos nunca entram, mesmo que a situação venha desatualizada.
        if (str(pick(p, ["demissionDate", "dataDemissao"]))) {
          ignorados += 1;
          continue;
        }

        const colaborador = str(pick(p, ["name", "nome", "personName", "fullName"]));
        if (!colaborador) {
          ignorados += 1;
          continue;
        }

        const careerId = num(pick(p, ["careerId", "career"]));
        const cargo =
          str(pick(p, ["careerName", "cargo", "roleName"])) ||
          (careerId !== null ? (cargos.get(careerId) ?? "") : "");
        const companyId = num(pick(p, ["companyId", "company"]));
        const empresa =
          str(pick(p, ["companyName", "empresa", "companyFantasyName"])) ||
          (companyId !== null ? (empresas.get(companyId) ?? "") : "");
        // Regra: apenas as empresas autorizadas entram na lista de ativos.
        if (!empresaPermitida(empresa)) {
          ignorados += 1;
          continue;
        }
        const workplaceId = num(pick(p, ["workplaceId", "workplace"]));

        const posto =
          str(pick(p, ["workplaceName", "posto", "workplaceDescription"])) ||
          (workplaceId !== null ? (postos.get(workplaceId) ?? "") : "");
        // Regra: postos FGR nunca entram na lista de ativos.
        if (postoBloqueado(posto)) {
          ignorados += 1;
          continue;
        }
        // Regra: colaboradores da lista de exclusão nunca são importados.
        if (nomeEstaExcluido(colaborador)) {
          ignorados += 1;
          continue;
        }
        const matricula = str(pick(p, ["enrolment", "registration", "matricula", "code"]));

        const chave = `${normalizar(colaborador)}|||${normalizar(empresa)}`;
        if (vistos.has(chave)) {
          duplicados += 1;
          continue;
        }
        if (matricula) {
          const chaveMatricula = `${normalizar(empresa)}|||${matricula.toUpperCase()}`;
          if (matriculasVistas.has(chaveMatricula)) {
            duplicados += 1;
            continue;
          }
          matriculasVistas.add(chaveMatricula);
        }
        vistos.add(chave);

        const personId = num(pick(p, ["id", "nextiId"]));
        if (personId === null) continue;
        colaboradores.push({
          personId,
          personExternalId: str(pick(p, ["externalId", "personExternalId"])),
          colaborador,
          cargo,
          empresa,
          posto,
          matricula,
        });
      }

      if (colaboradores.length === 0) {
        return {
          ok: false,
          total: 0,
          ignorados,
          duplicados,
          colaboradores: [],
          erro: "A NEXTI não retornou colaboradores em situação TRABALHANDO nas empresas autorizadas.",
        };
      }

      // A NEXTI passa a ser a fonte da verdade: limpa e regrava a lista.
      await supabaseAdmin.from("funcionarios_ativos").delete().not("id", "is", null);

      const agora = new Date().toISOString();
      const linhas = colaboradores.map((c) => ({
        nome: c.colaborador,
        nome_normalizado: normalizar(c.colaborador),
        empresa: c.empresa,
        empresa_normalizada: normalizar(c.empresa),
        cargo: c.cargo,
        posto: c.posto,
        matricula: c.matricula,
        ativo: true,
        revisar: false,
        created_by: ctx.userId ?? null,
        updated_at: agora,
      }));

      const TAMANHO = 500;
      let gravados = 0;
      for (let i = 0; i < linhas.length; i += TAMANHO) {
        const lote = linhas.slice(i, i + TAMANHO);
        const { data, error } = await supabaseAdmin
          .from("funcionarios_ativos")
          .insert(lote as never)
          .select("id");
        if (error) throw new Error(error.message);
        gravados += (data as unknown[] | null)?.length ?? lote.length;
      }

      return { ok: true, total: gravados, ignorados, duplicados, colaboradores };
    } catch (error) {
      return {
        ok: false,
        total: 0,
        ignorados: 0,
        duplicados: 0,
        colaboradores: [],
        erro: error instanceof Error ? error.message : "Falha ao importar da NEXTI.",
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Busca de colaboradores diretamente na NEXTI (sem gravar no banco)   */
/* ------------------------------------------------------------------ */

export type BuscaColaboradoresResultado = {
  ok: boolean;
  colaboradores: ColaboradorNexti[];
  total: number;
  sincronizadoEm: string | null;
  erro?: string;
};

/** Cache curto em memória para não refazer a varredura em cada tecla digitada. */
let cacheColaboradores: { lista: ColaboradorNexti[]; em: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function carregarColaboradoresNexti(
  supabaseClient: unknown,
): Promise<{ lista: ColaboradorNexti[]; em: number }> {
  if (cacheColaboradores && Date.now() - cacheColaboradores.em < CACHE_MS) {
    return cacheColaboradores;
  }

  const config = await loadConfig(supabaseClient);
  config.baseUrl = normalizeBaseUrl(config.baseUrl);

  const pessoas = await buscarTudo(config, ["/api/persons/all", "/persons/all", "/api/person/all"]);

  const empresas = new Map<number, string>();
  const postos = new Map<number, string>();
  const cargos = new Map<number, string>();
  try {
    for (const c of await buscarTudo(config, ["/api/companies/all", "/companies/all"])) {
      const id = num(pick(c, ["id", "nextiId"]));
      const nome = str(pick(c, ["fantasyName", "companyName", "name", "razaoSocial"]));
      if (id !== null && nome) empresas.set(id, nome);
    }
  } catch {
    /* segue com o que vier na pessoa */
  }
  try {
    for (const w of await buscarTudo(config, ["/api/workplaces/all", "/workplaces/all"])) {
      const id = num(pick(w, ["id", "nextiId"]));
      const nome = str(pick(w, ["name", "nome", "description"]));
      if (id !== null && nome) postos.set(id, nome);
    }
  } catch {
    /* idem */
  }
  try {
    for (const c of await buscarTudo(config, ["/api/careers/all", "/careers/all"])) {
      const id = num(pick(c, ["id", "nextiId"]));
      const nome = str(pick(c, ["name", "nome", "description"]));
      if (id !== null && nome) cargos.set(id, nome);
    }
  } catch {
    /* idem */
  }

  const vistos = new Set<string>();
  const lista: ColaboradorNexti[] = [];

  for (const p of pessoas) {
    if (str(pick(p, ["demissionDate", "dataDemissao"]))) continue;
    const colaborador = str(pick(p, ["name", "nome", "personName", "fullName"]));
    if (!colaborador) continue;

    const careerId = num(pick(p, ["careerId", "career"]));
    const cargo =
      str(pick(p, ["careerName", "cargo", "roleName"])) ||
      (careerId !== null ? (cargos.get(careerId) ?? "") : "");
    const companyId = num(pick(p, ["companyId", "company"]));
    const empresa =
      str(pick(p, ["companyName", "empresa", "companyFantasyName"])) ||
      (companyId !== null ? (empresas.get(companyId) ?? "") : "");
    const workplaceId = num(pick(p, ["workplaceId", "workplace"]));
    const posto =
      str(pick(p, ["workplaceName", "posto", "workplaceDescription"])) ||
      (workplaceId !== null ? (postos.get(workplaceId) ?? "") : "");
    const matricula = str(pick(p, ["enrolment", "registration", "matricula", "code"]));

    const chave = `${normalizar(colaborador)}|||${normalizar(empresa)}|||${matricula}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const personId = num(pick(p, ["id", "nextiId"]));
    if (personId === null) continue;
    lista.push({
      personId,
      personExternalId: str(pick(p, ["externalId", "personExternalId"])),
      colaborador,
      cargo,
      empresa,
      posto,
      matricula,
    });
  }

  lista.sort((a, b) => a.colaborador.localeCompare(b.colaborador, "pt-BR"));
  cacheColaboradores = { lista, em: Date.now() };
  return cacheColaboradores;
}

/**
 * Pesquisa colaboradores por nome direto na API da NEXTI, devolvendo
 * COLABORADOR, CARGO, POSTO e EMPRESA.
 */
export const pesquisarColaboradoresNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string; forcarSincronizar?: boolean }) => ({
    termo: typeof input?.termo === "string" ? input.termo.slice(0, 120) : "",
    forcarSincronizar: input?.forcarSincronizar === true,
  }))
  .handler(async ({ data, context }): Promise<BuscaColaboradoresResultado> => {
    const ctx = context as { supabase: unknown };
    try {
      if (data.forcarSincronizar) cacheColaboradores = null;
      const { lista, em } = await carregarColaboradoresNexti(ctx.supabase);
      const termo = normalizar(data.termo);
      const filtrados = termo
        ? lista.filter((c) => {
            const alvo = `${normalizar(c.colaborador)} ${normalizar(c.cargo)} ${normalizar(c.posto)} ${normalizar(c.empresa)} ${c.matricula}`;
            return termo.split(/\s+/).every((parte) => alvo.includes(parte));
          })
        : [];
      return {
        ok: true,
        colaboradores: filtrados,
        total: filtrados.length,
        sincronizadoEm: new Date(em).toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        colaboradores: [],
        total: 0,
        sincronizadoEm: null,
        erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Busca leve: somente o NOME do colaborador (sem cargo/posto/empresa) */
/* ------------------------------------------------------------------ */

export type NomeColaboradorNexti = {
  personId: number;
  personExternalId: string;
  colaborador: string;
  careerId: number | null;
  cargo: string;
  workplaceId: number | null;
  postoAtual: string;
};

export type BuscaNomeColaboradoresResultado = {
  ok: boolean;
  colaboradores: NomeColaboradorNexti[];
  total: number;
  sincronizadoEm: string | null;
  erro?: string;
};

/**
 * Pesquisa SOMENTE o nome do colaborador direto na API da NEXTI,
 * usando o filtro nativo da API para não precisar carregar toda a base.
 */
export const pesquisarNomeColaboradorNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string; forcarSincronizar?: boolean }) => ({
    termo: typeof input?.termo === "string" ? input.termo.slice(0, 120) : "",
    forcarSincronizar: input?.forcarSincronizar === true,
  }))
  .handler(async ({ data, context }): Promise<BuscaNomeColaboradoresResultado> => {
    const ctx = context as { supabase: unknown };
    try {
      const config = await loadConfig(ctx.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      const resposta = await requestNexti({
        config,
        endpoint: "/persons/all",
        method: "GET",
        query: { page: 0, size: 100, ...(data.termo.trim() ? { filter: data.termo.trim() } : {}) },
      });
      const pessoas = extrairLista(resposta.data);
      const pessoasAtivas = pessoas.filter(
        (pessoa) => !str(pick(pessoa, ["demissionDate", "dataDemissao"])),
      );
      const detalhes = await Promise.all(
        pessoasAtivas.map(async (pessoa) => {
          const personId = num(pick(pessoa, ["id", "nextiId"]));
          const externalId = str(pick(pessoa, ["externalId", "personExternalId"]));
          const careerId = num(pick(pessoa, ["careerId", "career"]));
          const workplaceId = num(pick(pessoa, ["workplaceId", "workplace"]));
          if (personId === null || (externalId && careerId !== null && workplaceId !== null))
            return pessoa;
          try {
            const detalhe = await requestNexti({
              config,
              endpoint: `/persons/${personId}`,
              method: "GET",
            });
            const payload =
              isRec(detalhe.data) && isRec(detalhe.data["value"])
                ? detalhe.data["value"]
                : detalhe.data;
            return isRec(payload) ? { ...pessoa, ...payload } : pessoa;
          } catch {
            return pessoa;
          }
        }),
      );

      // O detalhe da pessoa traz apenas careerId/workplaceId. Resolve os nomes
      // nos cadastros oficiais da NEXTI antes de devolver o colaborador à tela.
      const [listaCargos, listaPostos] = await Promise.all([
        buscarTudo(config, ["/api/careers/all", "/careers/all"]).catch(() => []),
        buscarTudo(config, ["/api/workplaces/all", "/workplaces/all"]).catch(() => []),
      ]);
      const cargos = new Map<number, string>();
      const postos = new Map<number, string>();
      for (const cargo of listaCargos) {
        const id = num(pick(cargo, ["id", "nextiId"]));
        const nome = str(pick(cargo, ["name", "nome", "description"]));
        if (id !== null && nome) cargos.set(id, nome);
      }
      for (const posto of listaPostos) {
        const id = num(pick(posto, ["id", "nextiId"]));
        const nome = str(pick(posto, ["name", "nome", "description"]));
        if (id !== null && nome) postos.set(id, nome);
      }

      const vistos = new Set<number>();
      const filtrados: NomeColaboradorNexti[] = [];
      for (const pessoa of detalhes) {
        const colaborador = str(pick(pessoa, ["name", "nome", "personName", "fullName"]));
        const personId = num(pick(pessoa, ["id", "nextiId"]));
        const personExternalId = str(
          pick(pessoa, ["externalId", "personExternalId", "enrolment", "registerNumber"]),
        );
        if (!colaborador || personId === null || !personExternalId || vistos.has(personId))
          continue;
        vistos.add(personId);
        const careerId = num(pick(pessoa, ["careerId", "career"]));
        const workplaceId = num(pick(pessoa, ["workplaceId", "workplace"]));
        filtrados.push({
          personId,
          personExternalId,
          colaborador,
          careerId,
          cargo:
            str(pick(pessoa, ["nameCareer", "careerName", "cargo", "roleName"])) ||
            (careerId !== null ? (cargos.get(careerId) ?? "") : ""),
          workplaceId,
          postoAtual:
            str(pick(pessoa, ["workplaceName", "postoAtual", "posto", "workplaceDescription"])) ||
            (workplaceId !== null ? (postos.get(workplaceId) ?? "") : ""),
        });
      }
      filtrados.sort((a, b) => a.colaborador.localeCompare(b.colaborador, "pt-BR"));
      const consultadoEm = new Date().toISOString();

      return {
        ok: true,
        colaboradores: filtrados,
        total: filtrados.length,
        sincronizadoEm: consultadoEm,
      };
    } catch (error) {
      return {
        ok: false,
        colaboradores: [],
        total: 0,
        sincronizadoEm: null,
        erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Busca de postos de serviço diretamente na NEXTI                     */
/* ------------------------------------------------------------------ */

export type PostoNexti = {
  id: number;
  nome: string;
  externalId: string;
};

export type BuscaPostosResultado = {
  ok: boolean;
  postos: PostoNexti[];
  total: number;
  sincronizadoEm: string | null;
  erro?: string;
};

let cachePostos: { lista: PostoNexti[]; em: number } | null = null;

/**
 * Pesquisa postos de serviço por nome direto na API da NEXTI.
 * Não grava no banco; apenas consulta o endpoint /workplaces/all.
 */
export const pesquisarPostosNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string; forcarSincronizar?: boolean }) => ({
    termo: typeof input?.termo === "string" ? input.termo.slice(0, 120) : "",
    forcarSincronizar: input?.forcarSincronizar === true,
  }))
  .handler(async ({ data, context }): Promise<BuscaPostosResultado> => {
    const ctx = context as { supabase: unknown };
    try {
      if (data.forcarSincronizar) cachePostos = null;

      let lista: PostoNexti[];
      let em: number;

      if (cachePostos && Date.now() - cachePostos.em < CACHE_MS) {
        lista = cachePostos.lista;
        em = cachePostos.em;
      } else {
        const config = await loadConfig(ctx.supabase);
        config.baseUrl = normalizeBaseUrl(config.baseUrl);

        const workplaces = await buscarTudo(config, ["/api/workplaces/all", "/workplaces/all"]);

        const vistos = new Set<string>();
        lista = [];
        for (const w of workplaces) {
          const id = num(pick(w, ["id", "nextiId"]));
          const nome = str(pick(w, ["name", "nome", "description"]));
          const externalId = str(pick(w, ["externalId", "externalCode", "codigoExterno"]));
          if (id === null || !nome) continue;
          const chave = String(id);
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          lista.push({ id, nome, externalId });
        }
        lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        cachePostos = { lista, em: Date.now() };
        em = cachePostos.em;
      }

      const termo = normalizar(data.termo);
      const filtrados = termo ? lista.filter((p) => normalizar(p.nome).includes(termo)) : lista;

      return {
        ok: true,
        postos: filtrados,
        total: filtrados.length,
        sincronizadoEm: new Date(em).toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        postos: [],
        total: 0,
        sincronizadoEm: null,
        erro: error instanceof Error ? error.message : "Falha ao consultar postos na NEXTI.",
      };
    }
  });

function dataHoraNexti(data: string, fimDoDia: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!match) throw new Error("Informe uma data válida para a ausência.");
  return `${match[3]}${match[2]}${match[1]}${fimDoDia ? "235959" : "000000"}`;
}

/** Cadastra férias diretamente no registro do colaborador na NEXTI. */
export const cadastrarAusenciaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      personId: number;
      personExternalId?: string;
      inicio: string;
      fim: string;
      observacao?: string;
    }) => {
      const personId = Number(input?.personId);
      if (!Number.isInteger(personId) || personId <= 0) {
        throw new Error("Colaborador sem identificador válido na NEXTI.");
      }
      if (input.inicio > input.fim) throw new Error("A data final deve ser posterior à inicial.");
      return {
        personId,
        personExternalId: String(input.personExternalId ?? "").trim(),
        inicio: String(input.inicio ?? ""),
        fim: String(input.fim ?? ""),
        observacao: String(input.observacao ?? "")
          .trim()
          .slice(0, 500),
      };
    },
  )
  .handler(async ({ data, context }): Promise<CadastroAusenciaNextiResultado> => {
    const endpoint = "/absences";
    try {
      const config = await loadConfig((context as { supabase: unknown }).supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      // O filtro textual da NEXTI é sensível à acentuação em alguns ambientes.
      // Carregar a lista completa evita que "FÉRIAS" seja descartada ao buscar "FERIAS".
      const situacoes = await buscarTudo(config, [
        "/absencesituations/all",
        "/api/absencesituations/all",
      ]);
      const situacoesAtivas = situacoes.filter(
        (situacao) => pick(situacao, ["active", "ativo"]) !== false,
      );
      const correspondeFerias = (situacao: Rec) => {
        const alvo = normalizar(
          `${str(pick(situacao, ["name", "description", "nome"]))} ${str(
            pick(situacao, ["externalId", "absenceSituationExternalId", "codigoExterno"]),
          )}`,
        );
        return alvo;
      };
      const ferias =
        situacoesAtivas.find((situacao) => correspondeFerias(situacao) === "FERIAS") ??
        situacoesAtivas.find((situacao) => correspondeFerias(situacao).includes("FERIAS"));
      const absenceSituationId = ferias ? num(pick(ferias, ["id", "nextiId"])) : null;
      const absenceSituationExternalId = ferias
        ? str(
            pick(ferias, [
              "externalId",
              "absenceSituationExternalId",
              "codigoExterno",
              "externalCode",
            ]),
          )
        : "";

      if (!ferias) {
        return {
          ok: false,
          endpoint,
          erro: "A situação de ausência FÉRIAS não foi encontrada entre as situações ativas da NEXTI.",
        };
      }
      if (absenceSituationId === null) {
        return {
          ok: false,
          endpoint,
          erro: "A situação FÉRIAS foi encontrada, mas está sem identificador interno na NEXTI.",
        };
      }

      const resposta = await requestNexti({
        config,
        endpoint,
        method: "POST",
        query: { shouldOverlapAll: false },
        body: {
          personId: data.personId,
          ...(data.personExternalId ? { personExternalId: data.personExternalId } : {}),
          absenceSituationId,
          // Situações criadas diretamente na NEXTI podem não ter código externo.
          // Nesses casos, o identificador interno é suficiente para vinculá-las.
          ...(absenceSituationExternalId ? { absenceSituationExternalId } : {}),
          startDateTime: dataHoraNexti(data.inicio, false),
          finishDateTime: dataHoraNexti(data.fim, true),
          note: data.observacao || "Férias programadas via sistema",
        },
      });

      return { ok: true, endpoint, httpStatus: resposta.status };
    } catch (error) {
      const err = error as Error & { httpStatus?: number; nextiResponse?: string };
      const comentario = err.nextiResponse ? ` Comentário da API: ${err.nextiResponse}` : "";
      return {
        ok: false,
        endpoint,
        ...(err.httpStatus ? { httpStatus: err.httpStatus } : {}),
        erro: `${err.message || "Falha ao cadastrar ausência na NEXTI."}${comentario}`,
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Busca de faltas diretamente na NEXTI (sem gravar no banco)         */
/* ------------------------------------------------------------------ */

export type FaltaNextiItem = {
  colaborador: string;
  cargo: string;
  periodo: string;
  tipo: string;
  posto: string;
  matricula: string;
};

let cacheFaltas: {
  lista: FaltaNextiItem[];
  em: number;
} | null = null;


function dataHoraConsultaNexti(data: Date): string {
  const dois = (valor: number) => String(valor).padStart(2, "0");
  return `${dois(data.getUTCDate())}${dois(data.getUTCMonth() + 1)}${data.getUTCFullYear()}${dois(data.getUTCHours())}${dois(data.getUTCMinutes())}${dois(data.getUTCSeconds())}`;
}

function janelasAusenciasNexti(): Array<{ inicio: Date; fim: Date }> {
  const fimPeriodo = new Date();
  const inicioPeriodo = new Date(
    Date.UTC(fimPeriodo.getUTCFullYear(), fimPeriodo.getUTCMonth() - 2, 1, 0, 0, 0),
  );
  const janelas: Array<{ inicio: Date; fim: Date }> = [];
  let inicio = inicioPeriodo;

  while (inicio.getTime() <= fimPeriodo.getTime()) {
    const limite = new Date(inicio.getTime() + 29 * 24 * 60 * 60 * 1000);
    const fim = limite.getTime() < fimPeriodo.getTime() ? limite : fimPeriodo;
    janelas.push({ inicio, fim });
    inicio = new Date(fim.getTime() + 1000);
  }

  return janelas;
}

function extrairTipoOcorrencia(f: Rec): string {
  const typeObj = f["occurrenceType"] || f["type"] || f["tipoOcorrencia"] || f["tipo"];
  if (isRec(typeObj)) {
    const s = str(pick(typeObj, ["name", "nome", "description", "descricao"]));
    if (s) return s;
  }
  return (
    str(
      pick(f, [
        "occurrenceTypeName",
        "typeName",
        "type",
        "tipo",
        "name",
        "nome",
        "description",
        "descricao",
      ]),
    ) || "Sem Classificação"
  );
}

function extrairColaborador(f: Rec): string {
  const direto = str(
    pick(f, ["colaborador", "personName", "employeeName", "nome", "fullName", "name"]),
  );
  if (direto) return direto;

  const pObj = f["person"] || f["colaborador"] || f["employee"] || f["funcionario"];
  if (isRec(pObj)) {
    return str(pick(pObj, ["name", "nome", "personName", "fullName", "employeeName"])) || "";
  }
  return "";
}

function extrairCargo(f: Rec): string {
  const direto = str(pick(f, ["cargo", "careerName", "roleName", "jobName", "funcao"]));
  if (direto) return direto;

  const cObj = f["career"] || f["cargo"] || f["role"] || f["job"];
  if (isRec(cObj)) {
    return str(pick(cObj, ["name", "nome", "careerName", "description", "descricao"])) || "";
  }

  const pObj = f["person"] || f["employee"] || f["funcionario"];
  if (isRec(pObj)) {
    const cargoNested = pObj["career"] || pObj["cargo"] || pObj["role"];
    if (isRec(cargoNested)) {
      return str(pick(cargoNested, ["name", "nome", "description"])) || "";
    }
    return str(pick(pObj, ["careerName", "cargo", "roleName"])) || "";
  }
  return "";
}

function formatarDataBR(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  if (/^\d{14}$/.test(s)) return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`;
  const limpo = s.split("T")[0]?.split(" ")[0] ?? "";
  if (limpo.includes("-")) {
    const partes = limpo.split("-");
    if (partes.length === 3 && partes[0]!.length === 4) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
  }
  return limpo;
}

function extrairPeriodo(f: Rec): string {
  const vInicio = pick(f, [
    "startDateTime",
    "startDate",
    "initialDate",
    "dataInicio",
    "inicio",
    "absenceDate",
    "occurrenceDate",
    "date",
    "data",
    "eventDate",
  ]);
  const vFim = pick(f, [
    "finishDateTime",
    "endDate",
    "finalDate",
    "dataFim",
    "fim",
    "termino",
    "returnDate",
  ]);

  const ini = formatarDataBR(vInicio);
  const fim = formatarDataBR(vFim);

  if (ini && fim && ini !== fim) {
    return `${ini} — ${fim}`;
  }
  if (ini) return ini;
  if (fim) return fim;

  const pStr = str(pick(f, ["period", "periodo", "description", "descricao"]));
  return pStr || "Período não informado";
}

async function carregarFaltasNexti(supabaseClient: unknown): Promise<{
  lista: FaltaNextiItem[];
  em: number;
}> {

  if (cacheFaltas && Date.now() - cacheFaltas.em < CACHE_MS) {
    return cacheFaltas;
  }

  const config = await loadConfig(supabaseClient);
  config.baseUrl = normalizeBaseUrl(config.baseUrl);

  const faltasRaw: Rec[] = [];
  for (const janela of janelasAusenciasNexti()) {
    const inicio = dataHoraConsultaNexti(janela.inicio);
    const fim = dataHoraConsultaNexti(janela.fim);
    const endpoint = `/api/absences/lastupdate/start/${inicio}/finish/${fim}`;
    faltasRaw.push(...(await buscarTudo(config, [endpoint])));
  }

  const [colaboradores, situacoes] = await Promise.all([
    carregarColaboradoresNexti(supabaseClient),
    buscarTudo(config, ["/api/absencesituations/all", "/absencesituations/all"]),
  ]);
  const pessoasPorId = new Map(colaboradores.lista.map((pessoa) => [pessoa.personId, pessoa]));
  const pessoasPorCodigo = new Map(
    colaboradores.lista
      .filter((pessoa) => pessoa.personExternalId)
      .map((pessoa) => [normalizar(pessoa.personExternalId), pessoa]),
  );
  const situacoesPorId = new Map<number, string>();
  for (const situacao of situacoes) {
    const id = num(pick(situacao, ["id", "nextiId"]));
    const nome = str(pick(situacao, ["name", "nome", "description", "descricao"]));
    if (id !== null && nome) situacoesPorId.set(id, nome);
  }

  const lista: FaltaNextiItem[] = [];
  const vistos = new Set<string>();

  for (const f of faltasRaw) {
    const personId = num(pick(f, ["personId", "person", "idPerson"]));
    const personExternalId = str(pick(f, ["personExternalId", "externalPersonId", "matricula"]));
    const pessoa =
      personId !== null
        ? pessoasPorId.get(personId)
        : pessoasPorCodigo.get(normalizar(personExternalId));
    const colaborador = extrairColaborador(f) || pessoa?.colaborador || "";
    if (!colaborador) continue;

    const cargo = extrairCargo(f) || pessoa?.cargo || "";
    const periodo = extrairPeriodo(f);
    const situacaoId = num(pick(f, ["absenceSituationId", "situationId", "motivoId"]));
    const tipoExtraido = extrairTipoOcorrencia(f);
    const tipo =
      (tipoExtraido !== "Sem Classificação" ? tipoExtraido : undefined) ||
      (situacaoId !== null ? situacoesPorId.get(situacaoId) : undefined) ||
      "Ausência";
    const chave = `${personId ?? personExternalId}|${periodo}|${normalizar(tipo)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    lista.push({ colaborador, cargo, periodo, tipo });
  }

  lista.sort((a, b) => b.periodo.localeCompare(a.periodo, "pt-BR"));

  cacheFaltas = { lista, em: Date.now() };
  return cacheFaltas;
}

export const pesquisarFaltasNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { termo?: string; forcarSincronizar?: boolean; apenasFaltas?: boolean }) => ({
      termo: typeof input?.termo === "string" ? input.termo : "",
      forcarSincronizar: input?.forcarSincronizar === true,
      apenasFaltas: input?.apenasFaltas === true,
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      faltas: Array<{ colaborador: string; cargo: string; periodo: string; tipo: string }>;
      erro?: string;
    }> => {
      const ctx = context as { supabase: unknown };
      try {
        if (data.forcarSincronizar) {
          cacheFaltas = null;
        }
        const { lista } = await carregarFaltasNexti(ctx.supabase);

        const filtrados = lista.filter((f) => {
          let isMatch = true;

          if (data.apenasFaltas) {
            const normTipo = normalizar(f.tipo);
            if (!normTipo.includes("FALTA") && !normTipo.includes("AUSENCIA")) {
              isMatch = false;
            }
          }

          if (isMatch && data.termo) {
            const termo = normalizar(data.termo);
            const alvo = `${normalizar(f.colaborador)} ${normalizar(f.cargo)} ${normalizar(f.periodo)} ${normalizar(f.tipo)}`;
            isMatch = termo.split(/\s+/).every((parte) => alvo.includes(parte));
          }

          return isMatch;
        });

        return { ok: true, faltas: filtrados };
      } catch (error) {
        return {
          ok: false,
          faltas: [],
          erro: error instanceof Error ? error.message : "Falha ao consultar faltas na API NEXTI.",
        };
      }
    },
  );
