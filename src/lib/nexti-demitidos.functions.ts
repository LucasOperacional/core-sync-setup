import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

export type DemitidoNexti = {
  id: number;
  nome: string;
  cargo: string;
  posto: string;
  situacao: string;
  matricula: string | null;
  dataDemissao: string | null;
};

export type DemitidosResultado = {
  ok: boolean;
  total: number;
  demitidos: DemitidoNexti[];
  erro?: string;
};

type Rec = Record<string, unknown>;

const PAGE_SIZE = 200;
const MAX_PAGES = 30;

/** Situacao 3 da NEXTI = colaborador demitido/desligado. */
const SITUACAO_DEMITIDO = 3;

/**
 * Postos ignorados na listagem de demitidos: TS, CARGILL e FGR.
 * "TS" e aceito como palavra isolada (evita bater em nomes que apenas
 * contenham as letras "ts" no meio de uma palavra).
 */
const POSTOS_IGNORADOS: RegExp[] = [/\bTS\b/i, /CARGILL/i, /\bFGR\b/i];

function postoIgnorado(posto: string): boolean {
  if (!posto.trim()) return false;
  const normalizado = posto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return POSTOS_IGNORADOS.some((rx) => rx.test(normalizado));
}

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (isRec(v)) return numero(v["id"]);
  return null;
}

/** Converte data ddMMyyyyHHmmss (padrao NEXTI) para AAAA-MM-DD. */
function dataNextiParaIso(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const v = valor.trim();
  const compacta = v.match(/^(\d{2})(\d{2})(\d{4})\d{6}$/);
  if (compacta) return `${compacta[3]}-${compacta[2]}-${compacta[1]}`;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

async function buscarPaginado(
  config: Awaited<ReturnType<typeof loadConfig>>,
  endpoint: string,
): Promise<Rec[]> {
  const acumulado: Rec[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const resposta = await requestNexti({
      config,
      endpoint,
      method: "GET",
      query: { page, size: PAGE_SIZE },
    });
    const lista = extrairLista(resposta.data);
    acumulado.push(...lista);
    if (lista.length < PAGE_SIZE) break;
  }
  return acumulado;
}

/** Monta um mapa id -> nome a partir de uma lista paginada da NEXTI. */
function mapaPorId(lista: Rec[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const item of lista) {
    const id = numero(item["id"]);
    const nome = typeof item["name"] === "string" ? item["name"].trim() : "";
    if (id !== null && nome) mapa.set(id, nome);
  }
  return mapa;
}

/**
 * Busca na API da NEXTI todos os colaboradores em situacao de DEMITIDO
 * (personSituationId = 3), ja com matricula, cargo, posto e data de demissao.
 */
export const listarDemitidosNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DemitidosResultado> => {
    try {
      const bruto = await loadConfig((context as { supabase: unknown }).supabase);
      const config = { ...bruto, baseUrl: normalizeBaseUrl(bruto.baseUrl) };

      const [pessoas, cargos, postos] = await Promise.all([
        buscarPaginado(config, "/api/persons/all"),
        buscarPaginado(config, "/api/careers/all").catch(() => [] as Rec[]),
        buscarPaginado(config, "/api/workplaces/all").catch(() => [] as Rec[]),
      ]);
      const cargoPorId = mapaPorId(cargos);
      const postoPorId = mapaPorId(postos);

      const demitidos: DemitidoNexti[] = [];
      for (const p of pessoas) {
        if (numero(p["personSituationId"]) !== SITUACAO_DEMITIDO) continue;
        const id = numero(p["id"]);
        const nome = typeof p["name"] === "string" ? p["name"].trim() : "";
        if (id === null || !nome) continue;
        const careerId = numero(p["careerId"]);
        const workplaceId = numero(p["workplaceId"]);
        const matricula =
          (typeof p["enrolment"] === "string" && p["enrolment"].trim()) ||
          (typeof p["registerNumber"] === "string" && p["registerNumber"].trim()) ||
          "";
        const posto = (workplaceId !== null && postoPorId.get(workplaceId)) || "";
        if (postoIgnorado(posto)) continue;
        demitidos.push({
          id,
          nome,
          cargo: (careerId !== null && cargoPorId.get(careerId)) || "",
          posto,
          situacao: "Demitido",
          matricula: matricula || null,
          dataDemissao: dataNextiParaIso(p["demissionDate"]),
        });
      }

      demitidos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      return { ok: true, total: demitidos.length, demitidos };
    } catch (error) {
      return {
        ok: false,
        total: 0,
        demitidos: [],
        erro: error instanceof Error ? error.message : "Erro ao consultar demitidos na NEXTI.",
      };
    }
  });
