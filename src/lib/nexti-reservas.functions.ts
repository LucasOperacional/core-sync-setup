import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

type Rec = Record<string, unknown>;

const PAGE_SIZE = 200;
const MAX_PAGES = 60;

/** Grupos de reserva exibidos em cards, com as regras de reconhecimento do posto/cargo. */
export const GRUPOS_RESERVA = [
  {
    chave: "inss",
    nome: "INSS",
    inclui: ["inss"],
    ouInclui: [],
    exclui: [],
  },
  {
    chave: "desaparecidos",
    nome: "DESAPARECIDOS",
    inclui: ["desaparecid"],
    ouInclui: [],
    exclui: [],
  },
  {
    chave: "maternidade",
    nome: "MATERNIDADE",
    inclui: ["maternidade"],
    ouInclui: [],
    exclui: [],
  },
  {
    chave: "audiencia",
    nome: "AUDIENCIA",
    inclui: ["audiencia"],
    ouInclui: [],
    exclui: [],
  },
  {
    chave: "reserva-noturno",
    nome: "RESERVA - PORTARIA - NOTURNO",
    inclui: ["reserva"],
    ouInclui: ["noturno", "noturna"],
    exclui: ["ipe", "ipes"],
  },
  {
    chave: "reserva-portaria-diurno",
    nome: "RESERVA - PORTARIA - DIURNO",
    inclui: ["reserva", "portaria"],
    ouInclui: [],
    exclui: ["noturno", "noturna"],
  },
  {
    chave: "reserva-asg-tektron",
    nome: "RESERVA - ASG - TEKTRON",
    inclui: ["reserva", "asg"],
    ouInclui: [],
    exclui: [],
    empresaContem: "tektron",
  },
  {
    chave: "reserva-encarregados",
    nome: "RESERVA ENCARREGADOS",
    inclui: ["reserva"],
    ouInclui: ["encarregad"],
    exclui: [],
  },
  {
    chave: "jatista",
    nome: "JATISTA",
    inclui: ["jatista"],
    ouInclui: [],
    exclui: [],
  },
] as const;

export type GrupoReservaResultado = {
  chave: string;
  nome: string;
  total: number;
  pessoas: Array<{ nome: string; cargo: string; empresa: string; posto: string }>;
};

export type ReservasNextiResultado = {
  ok: boolean;
  grupos: GrupoReservaResultado[];
  totalAnalisado: number;
  erro?: string;
};

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

/** Minúsculas, sem acentos, para comparar postos e cargos. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function buscarTudo(
  config: Awaited<ReturnType<typeof loadConfig>>,
  candidatos: string[],
): Promise<Rec[]> {
  let ultimoErro = "Nenhum endpoint disponível.";
  for (const endpoint of candidatos) {
    try {
      const todos: Rec[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const resposta = await requestNexti({
          config,
          endpoint,
          method: "GET",
          query: { page, size: PAGE_SIZE },
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

type Grupo = (typeof GRUPOS_RESERVA)[number];

function pertence(grupo: Grupo, alvo: string, empresa: string): boolean {
  if (!grupo.inclui.every((t) => alvo.includes(t))) return false;
  if (grupo.ouInclui.length > 0 && !grupo.ouInclui.some((t) => alvo.includes(t))) return false;
  if (grupo.exclui.some((t) => alvo.includes(t))) return false;
  const empresaContem = "empresaContem" in grupo ? grupo.empresaContem : undefined;
  if (empresaContem && !empresa.includes(empresaContem) && !alvo.includes(empresaContem))
    return false;
  return true;
}

/**
 * Conta, direto na API da NEXTI, quantas pessoas trabalhando estão lotadas em
 * cada grupo de reserva (noturno, portaria diurno, ASG Tektron e encarregados).
 */
export const contarReservasNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReservasNextiResultado> => {
    const ctx = context as { supabase: unknown };
    const vazio = GRUPOS_RESERVA.map((g) => ({
      chave: g.chave,
      nome: g.nome,
      total: 0,
      pessoas: [] as GrupoReservaResultado["pessoas"],
    }));

    try {
      const bruta = await loadConfig(ctx.supabase);
      const config = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };

      const pessoas = await buscarTudo(config, [
        "/api/persons/all",
        "/persons/all",
        "/api/person/all",
      ]);

      const postos = new Map<number, string>();
      const cargos = new Map<number, string>();
      const empresas = new Map<number, string>();
      try {
        for (const w of await buscarTudo(config, ["/api/workplaces/all", "/workplaces/all"])) {
          const id = num(pick(w, ["id", "nextiId"]));
          const nome = str(pick(w, ["name", "nome", "description"]));
          if (id !== null && nome) postos.set(id, nome);
        }
      } catch {
        /* segue com o que vier na própria pessoa */
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
      try {
        for (const c of await buscarTudo(config, ["/api/companies/all", "/companies/all"])) {
          const id = num(pick(c, ["id", "nextiId"]));
          const nome = str(pick(c, ["fantasyName", "companyName", "name", "razaoSocial"]));
          if (id !== null && nome) empresas.set(id, nome);
        }
      } catch {
        /* idem */
      }

      const grupos = vazio.map((g) => ({ ...g, pessoas: [] as GrupoReservaResultado["pessoas"] }));
      const vistos = GRUPOS_RESERVA.map(() => new Set<string>());
      let totalAnalisado = 0;

      for (const p of pessoas) {
        if (str(pick(p, ["demissionDate", "dataDemissao"]))) continue;
        const situacao = normalizar(str(pick(p, ["situation", "status", "situacao"])));
        const situacaoId = num(pick(p, ["personSituationId", "situationId", "situacaoId"]));
        const trabalhando = situacao ? situacao.startsWith("trabalhando") : situacaoId !== 2;
        if (!trabalhando) continue;

        const nome = str(pick(p, ["name", "nome", "personName", "fullName"]));
        if (!nome) continue;
        totalAnalisado += 1;

        const workplaceId = num(pick(p, ["workplaceId", "workplace"]));
        const posto =
          str(pick(p, ["workplaceName", "posto", "workplaceDescription"])) ||
          (workplaceId !== null ? (postos.get(workplaceId) ?? "") : "");
        const careerId = num(pick(p, ["careerId", "career"]));
        const cargo =
          str(pick(p, ["careerName", "cargo", "roleName"])) ||
          (careerId !== null ? (cargos.get(careerId) ?? "") : "");
        const companyId = num(pick(p, ["companyId", "company"]));
        const empresa =
          str(pick(p, ["companyName", "empresa", "companyFantasyName"])) ||
          (companyId !== null ? (empresas.get(companyId) ?? "") : "");

        const alvo = `${normalizar(posto)} ${normalizar(cargo)}`;
        const empresaNorm = normalizar(empresa);

        GRUPOS_RESERVA.forEach((grupo, i) => {
          if (!pertence(grupo, alvo, empresaNorm)) return;
          const chave = `${normalizar(nome)}|${empresaNorm}`;
          const set = vistos[i]!;
          if (set.has(chave)) return;
          set.add(chave);
          const alvoGrupo = grupos[i]!;
          alvoGrupo.total += 1;
          alvoGrupo.pessoas.push({ nome, cargo, empresa, posto });
        });
      }

      for (const g of grupos) g.pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      return { ok: true, grupos, totalAnalisado };
    } catch (error) {
      return {
        ok: false,
        grupos: vazio,
        totalAnalisado: 0,
        erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
      };
    }
  });
