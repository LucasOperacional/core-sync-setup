import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";
import { ehGerenteAreaA, gerenteAreaACanonico } from "@/lib/gerentes-area-a";

export type GerenteNexti = {
  id: string;
  nome: string;
  cargo: string;
  email: string | null;
};

export type ImportGerentesResultado = {
  ok: boolean;
  cargosEncontrados: string[];
  pessoasEncontradas: number;
  importados: number;
  erro?: string;
};

type Rec = Record<string, unknown>;

const PAGE_SIZE = 200;
const MAX_PAGES = 30;

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

function texto(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/** Reconhece cargos de gerência de área (gerente de área, gerente regional, etc.). */
function ehGerenteDeArea(cargo: string): boolean {
  const c = semAcento(cargo);
  if (!c.includes("GERENTE")) return false;
  return c.includes("AREA") || c.includes("REGIONAL") || /^GERENTE$/.test(c.trim());
}

async function buscarTodos(
  config: Awaited<ReturnType<typeof loadConfig>>,
  candidatos: string[],
): Promise<Rec[]> {
  let ultimoErro = "Nenhum endpoint respondeu.";
  for (const endpoint of candidatos) {
    const acumulado: Rec[] = [];
    try {
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
      if (acumulado.length > 0) return acumulado;
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : String(err);
    }
  }
  if (ultimoErro) console.warn("[gerentes-nexti]", ultimoErro);
  return [];
}

/**
 * Importa da API da NEXTI todos os colaboradores cadastrados com cargo de
 * gerente de área e grava/atualiza na tabela de gerentes.
 */
export const importarGerentesNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportGerentesResultado> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return {
        ok: false,
        cargosEncontrados: [],
        pessoasEncontradas: 0,
        importados: 0,
        erro: "Apenas administradores podem importar gerentes.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let config;
    try {
      const bruto = await loadConfig(supabaseAdmin);
      config = { ...bruto, baseUrl: normalizeBaseUrl(bruto.baseUrl) };
    } catch (err) {
      return {
        ok: false,
        cargosEncontrados: [],
        pessoasEncontradas: 0,
        importados: 0,
        erro: err instanceof Error ? err.message : "Configuração da NEXTI indisponível.",
      };
    }

    // 1) Cargos (careers) — nome do cargo não vem no cadastro de pessoas.
    const cargos = await buscarTodos(config, [
      "/api/careers/all",
      "/careers/all",
      "/api/career/all",
    ]);
    if (cargos.length === 0) {
      return {
        ok: false,
        cargosEncontrados: [],
        pessoasEncontradas: 0,
        importados: 0,
        erro: "Não foi possível carregar os cargos na API da NEXTI.",
      };
    }

    const agora = new Date().toISOString();
    await supabaseAdmin.from("nexti_careers").upsert(
      cargos
        .map((c) => {
          const id = Number(c["id"] ?? c["nextiId"]);
          if (!Number.isFinite(id)) return null;
          return {
            nexti_id: id,
            external_id: texto(c["externalId"]) || null,
            name: texto(c["name"] ?? c["nome"] ?? c["description"]) || null,
            career_group_name: texto(c["careerGroupName"] ?? c["careerGroup"]) || null,
            raw_payload: c as unknown as never,
            updated_at: agora,
            last_synced_at: agora,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
      { onConflict: "nexti_id" },
    );

    const cargosGerencia = new Map<number, string>();
    for (const c of cargos) {
      const id = Number(c["id"] ?? c["nextiId"]);
      const nome = texto(c["name"] ?? c["nome"] ?? c["description"]);
      if (Number.isFinite(id) && nome && ehGerenteDeArea(nome)) cargosGerencia.set(id, nome);
    }

    if (cargosGerencia.size === 0) {
      return {
        ok: false,
        cargosEncontrados: [],
        pessoasEncontradas: 0,
        importados: 0,
        erro: "Nenhum cargo de gerente de área encontrado no cadastro da NEXTI.",
      };
    }

    // 2) Pessoas — busca na API e complementa com o que já está sincronizado.
    const pessoasApi = await buscarTodos(config, [
      "/api/persons/all",
      "/persons/all",
      "/api/person/all",
    ]);

    const pessoas: Array<{ nome: string; email: string | null; careerId: number }> = [];
    for (const p of pessoasApi) {
      const careerId = Number(p["careerId"] ?? p["career"]);
      const nome = texto(p["name"] ?? p["nome"] ?? p["fullName"]);
      if (Number.isFinite(careerId) && nome) {
        pessoas.push({ nome, email: texto(p["email"]) || null, careerId });
      }
    }

    if (pessoas.length === 0) {
      const { data: salvos } = await supabaseAdmin
        .from("nexti_persons")
        .select("nome, career_id, raw_payload")
        .limit(10000);
      for (const p of salvos ?? []) {
        const raw = isRec(p.raw_payload) ? p.raw_payload : {};
        const careerId = Number(p.career_id ?? raw["careerId"]);
        const nome = texto(p.nome ?? raw["name"]);
        if (Number.isFinite(careerId) && nome) {
          pessoas.push({ nome, email: texto(raw["email"]) || null, careerId });
        }
      }
    }

    const selecionados = new Map<string, { nome: string; cargo: string; email: string | null }>();
    for (const p of pessoas) {
      const cargo = cargosGerencia.get(p.careerId);
      if (!cargo) continue;
      const bruto = p.nome.replace(/\s+/g, " ").trim().toUpperCase();
      if (!bruto) continue;
      // Somente os Gerentes de Área A ativos autorizados no projeto.
      if (!ehGerenteAreaA(bruto)) continue;
      const nome = gerenteAreaACanonico(bruto) ?? bruto;
      const atual = selecionados.get(nome);
      selecionados.set(nome, { nome, cargo, email: p.email ?? atual?.email ?? null });
    }

    if (selecionados.size === 0) {
      return {
        ok: false,
        cargosEncontrados: [...cargosGerencia.values()],
        pessoasEncontradas: 0,
        importados: 0,
        erro: "Nenhum colaborador com cargo de gerente de área foi encontrado.",
      };
    }

    const { error } = await supabaseAdmin
      .from("gerentes")
      .upsert([...selecionados.values()], { onConflict: "nome" });

    if (error) {
      return {
        ok: false,
        cargosEncontrados: [...cargosGerencia.values()],
        pessoasEncontradas: selecionados.size,
        importados: 0,
        erro: error.message,
      };
    }

    return {
      ok: true,
      cargosEncontrados: [...cargosGerencia.values()],
      pessoasEncontradas: selecionados.size,
      importados: selecionados.size,
    };
  });

/** Lista os gerentes cadastrados. */
export const listarGerentesNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GerenteNexti[]> => {
    const { data } = await context.supabase
      .from("gerentes")
      .select("id, nome, cargo, email")
      .order("nome");
    return ((data ?? []) as GerenteNexti[]).filter((g) => ehGerenteAreaA(g.nome));
  });
