import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";
import { AREAS_GERENTES } from "@/lib/areas-gerentes";
import { normalizarNome } from "@/lib/gerentes-area-a";

export type ImportarPostosResultado = {
  ok: boolean;
  postosLidos: number;
  postosSalvos: number;
  vinculosCriados: number;
  semGerente: number;
  endpoint?: string;
  erro?: string;
};

type Rec = Record<string, unknown>;

const ENDPOINTS = ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"];
const PAGE_SIZE = 200;
const MAX_PAGES = 60;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(obj: Rec, keys: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const real = lower.get(key.toLowerCase());
    if (!real) continue;
    const value = obj[real];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRec(value)) {
    const nome = pick(value, ["name", "nome", "description", "fantasyName"]);
    if (typeof nome === "string") return nome.trim() || null;
  }
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  if (isRec(value)) return num(pick(value, ["id", "nextiId", "code"]));
  return null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "sim", "s", "1", "ativo"].includes(v)) return true;
    if (["false", "nao", "não", "n", "0", "inativo"].includes(v)) return false;
  }
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

/** Campos do payload da NEXTI que podem trazer o gerente/responsável do posto. */
const CAMPOS_GERENTE = [
  "managerName",
  "manager",
  "responsibleName",
  "responsible",
  "supervisorName",
  "supervisor",
  "coordinatorName",
  "coordinator",
  "areaManager",
  "areaManagerName",
  "gerente",
  "responsavel",
];

function gerenteDoPayload(item: Rec): string | null {
  for (const campo of CAMPOS_GERENTE) {
    const valor = str(pick(item, [campo]));
    if (!valor) continue;
    const alvo = normalizarNome(valor);
    const achado = AREAS_GERENTES.find((g) => {
      const n = normalizarNome(g);
      return n === alvo || n.includes(alvo) || alvo.includes(n);
    });
    if (achado) return achado;
  }
  return null;
}

function localidade(item: Rec): string | null {
  const cidade = str(pick(item, ["city", "cidade"]));
  const uf = str(pick(item, ["state", "uf", "estado"]));
  const cliente = str(pick(item, ["clientName", "cliente"]));
  const partes = [cidade, uf].filter(Boolean).join(" / ");
  return [partes || null, cliente].filter(Boolean).join(" · ") || null;
}

/**
 * Importa todos os postos (workplaces) direto da API da NEXTI, grava em
 * `nexti_workplaces` e vincula cada posto ao gerente de área correspondente
 * em `areas_gerentes_postos`, usando o responsável informado pela NEXTI ou,
 * na falta dele, os relatórios de supervisão já importados.
 */
export const importarPostosNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportarPostosResultado> => {
    const ctx = context as { supabase: any; userId: string };

    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return {
        ok: false,
        postosLidos: 0,
        postosSalvos: 0,
        vinculosCriados: 0,
        semGerente: 0,
        erro: "Apenas administradores podem importar os postos.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let config;
    try {
      config = await loadConfig(ctx.supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
    } catch (error) {
      return {
        ok: false,
        postosLidos: 0,
        postosSalvos: 0,
        vinculosCriados: 0,
        semGerente: 0,
        erro: error instanceof Error ? error.message : "Configuração da NEXTI inválida.",
      };
    }

    // 1) Lê todos os postos da NEXTI.
    let itens: Rec[] = [];
    let endpointUsado: string | undefined;
    let ultimoErro = "Nenhum endpoint de postos respondeu.";

    for (const endpoint of ENDPOINTS) {
      const coletados: Rec[] = [];
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const resposta = await requestNexti({
            config,
            endpoint,
            method: "GET",
            query: { page, size: PAGE_SIZE },
          });
          const lista = extrairLista(resposta.data);
          if (lista.length === 0) break;
          coletados.push(...lista);
          if (lista.length < PAGE_SIZE) break;
        }
        endpointUsado = endpoint;
        itens = coletados;
        break;
      } catch (error) {
        ultimoErro = error instanceof Error ? error.message : String(error);
      }
    }

    if (!endpointUsado) {
      return {
        ok: false,
        postosLidos: 0,
        postosSalvos: 0,
        vinculosCriados: 0,
        semGerente: 0,
        erro: `Não foi possível ler os postos na NEXTI. ${ultimoErro}`,
      };
    }

    // 2) Grava os postos completos em nexti_workplaces.
    const agora = new Date().toISOString();
    const linhas = itens
      .map((item) => {
        const nextiId = num(pick(item, ["id", "nextiId", "codigo", "code"]));
        if (nextiId === null) return null;
        return {
          nexti_id: nextiId,
          external_id: str(pick(item, ["externalId", "external_id"])),
          name: str(pick(item, ["name", "nome", "description"])),
          company_id: num(pick(item, ["companyId", "company"])),
          company_name: str(pick(item, ["companyName", "company"])),
          client_name: str(pick(item, ["clientName", "cliente"])),
          city: str(pick(item, ["city", "cidade"])),
          state: str(pick(item, ["state", "uf", "estado"])),
          department: str(pick(item, ["department", "departamento", "areaName"])),
          cost_center: str(pick(item, ["costCenter", "centroCusto"])),
          latitude: num(pick(item, ["latitude", "lat"])),
          longitude: num(pick(item, ["longitude", "lng", "long"])),
          active: bool(pick(item, ["active", "ativo"])),
          raw_payload: item,
          updated_at: agora,
          last_synced_at: agora,
        };
      })
      .filter((linha): linha is NonNullable<typeof linha> => linha !== null);

    let postosSalvos = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("nexti_workplaces")
        .upsert(lote as never, { onConflict: "nexti_id" });
      if (error) {
        return {
          ok: false,
          postosLidos: itens.length,
          postosSalvos,
          vinculosCriados: 0,
          semGerente: 0,
          endpoint: endpointUsado,
          erro: error.message,
        };
      }
      postosSalvos += lote.length;
    }

    // 3) Mapa posto -> gerente, a partir dos relatórios de supervisão.
    const porRelatorio = new Map<number, string>();
    const { data: respostas } = await supabaseAdmin
      .from("nexti_checklist_answers")
      .select("supervisor_nome, workplace_id")
      .not("workplace_id", "is", null)
      .limit(20000);
    for (const r of (respostas ?? []) as Array<{
      supervisor_nome: string | null;
      workplace_id: number | null;
    }>) {
      const alvo = normalizarNome(r.supervisor_nome ?? "");
      if (!alvo) continue;
      const gerente = AREAS_GERENTES.find((g) => {
        const n = normalizarNome(g);
        return n === alvo || n.includes(alvo) || alvo.includes(n);
      });
      const id = Number(r.workplace_id);
      if (gerente && Number.isFinite(id)) porRelatorio.set(id, gerente);
    }

    // 4) Vincula os postos às áreas dos gerentes.
    const { data: existentes } = await supabaseAdmin
      .from("areas_gerentes_postos")
      .select("gerente_nome, posto_nome")
      .limit(50000);
    const chaves = new Set(
      ((existentes ?? []) as Array<{ gerente_nome: string; posto_nome: string }>).map(
        (r) => `${normalizarNome(r.gerente_nome)}|${normalizarNome(r.posto_nome)}`,
      ),
    );

    const novos: Array<{
      gerente_nome: string;
      posto_nome: string;
      posto_localidade: string | null;
    }> = [];
    let semGerente = 0;

    for (const item of itens) {
      const nome = str(pick(item, ["name", "nome", "description"]));
      if (!nome) continue;
      const nextiId = num(pick(item, ["id", "nextiId"]));
      const gerente =
        gerenteDoPayload(item) ?? (nextiId !== null ? (porRelatorio.get(nextiId) ?? null) : null);
      if (!gerente) {
        semGerente += 1;
        continue;
      }
      const chave = `${normalizarNome(gerente)}|${normalizarNome(nome)}`;
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      novos.push({
        gerente_nome: gerente,
        posto_nome: nome,
        posto_localidade: localidade(item),
      });
    }

    let vinculosCriados = 0;
    for (let i = 0; i < novos.length; i += 500) {
      const lote = novos.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("areas_gerentes_postos").insert(lote as never);
      if (error) {
        return {
          ok: false,
          postosLidos: itens.length,
          postosSalvos,
          vinculosCriados,
          semGerente,
          endpoint: endpointUsado,
          erro: error.message,
        };
      }
      vinculosCriados += lote.length;
    }

    return {
      ok: true,
      postosLidos: itens.length,
      postosSalvos,
      vinculosCriados,
      semGerente,
      endpoint: endpointUsado,
    };
  });
