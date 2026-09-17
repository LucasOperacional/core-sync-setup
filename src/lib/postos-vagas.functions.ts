import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostoVaga = {
  nextiId: number | null;
  nome: string;
  cliente: string | null;
  empresa: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  /** Data de encerramento do posto na NEXTI (null = ativo). */
  encerradoEm: string | null;
  /** Motivo de encerramento do posto na NEXTI (null = sem encerramento). */
  motivoEncerramento: string | null;
  /** Quantidade de vagas disponíveis informada pela NEXTI (campo vacantJob). */
  vagas: number;
};

export type PostosVagasResultado = {
  ok: boolean;
  postos: PostoVaga[];
  atualizadoEm: string | null;
  erro?: string;
};

export type ImportarVagasResultado = {
  ok: boolean;
  lidos: number;
  gravados: number;
  totalVagas: number;
  erro?: string;
};

type Rec = Record<string, unknown>;

function ehRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escolher(obj: Rec, chaves: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const k of chaves) {
    const real = lower.get(k.toLowerCase());
    if (!real) continue;
    const valor = obj[real];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

/** Converte datas da NEXTI (ddMMyyyyHHmmss, ddMMyyyy, dd/MM/yyyy, ISO) para YYYY-MM-DD. */
function normalizarData(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const digitos = s.replace(/\D/g, "");
  if (/^\d{14}$/.test(digitos) || /^\d{8}$/.test(digitos)) {
    const dia = digitos.slice(0, 2);
    const mes = digitos.slice(2, 4);
    const ano = digitos.slice(4, 8);
    const d = Number(dia);
    const m = Number(mes);
    const a = Number(ano);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2200) {
      return `${ano}-${mes}-${dia}`;
    }
    return null;
  }
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}


function texto(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (ehRec(v)) {
    const nome = escolher(v, ["name", "nome", "description", "fantasyName"]);
    if (typeof nome === "string") return nome.trim() || null;
  }
  return null;
}

function inteiro(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function listaDoPayload(payload: unknown): Rec[] {
  if (Array.isArray(payload)) return payload.filter(ehRec);
  if (!ehRec(payload)) return [];
  for (const k of ["content", "data", "items", "list", "records", "result", "results", "rows"]) {
    const v = payload[k];
    if (Array.isArray(v)) return v.filter(ehRec);
    if (ehRec(v)) {
      const aninhado = listaDoPayload(v);
      if (aninhado.length > 0) return aninhado;
    }
  }
  return [];
}

type LinhaBanco = {
  nexti_id: number | null;
  name: string | null;
  client_name: string | null;
  company_name: string | null;
  city: string | null;
  state: string | null;
  active: boolean | null;
  finish_date: string | null;
  closing_reason: string | null;
  raw_payload?: unknown;
  vacant_job: number | null;
  last_synced_at?: string | null;
};

function paraPosto(row: LinhaBanco): PostoVaga {
  const raw = ehRec(row.raw_payload) ? row.raw_payload : {};
  const dataFim = row.finish_date ?? normalizarData(escolher(raw, ["finishDate", "finish_date", "endDate", "dataFim"]));
  const motivoFim =
    row.closing_reason?.trim() ||
    texto(
      escolher(raw, [
        "workplaceClosingReasonName",
        "closingReasonName",
        "closingReason",
        "closing_reason",
        "closingNote",
        "motivoEncerramento",
      ]),
    );
  return {
    nextiId: row.nexti_id ?? null,
    nome: row.name ?? "",
    cliente: row.client_name,
    empresa: row.company_name,
    cidade: row.city,
    uf: row.state,
    ativo: row.active ?? true,
    encerradoEm: dataFim,
    motivoEncerramento: motivoFim,
    vagas: row.vacant_job ?? 0,
  };
}

/** Lista os postos já importados, com a quantidade de vagas de cada um. */
export const listarPostosVagas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostosVagasResultado> => {
    const { data, error } = await context.supabase
      .from("nexti_workplaces")
      .select(
        "nexti_id, name, client_name, company_name, city, state, active, finish_date, closing_reason, vacant_job, last_synced_at, raw_payload",
      )
      .order("name", { ascending: true })
      .limit(5000);

    if (error) return { ok: false, postos: [], atualizadoEm: null, erro: error.message };

    const linhas = (data ?? []) as LinhaBanco[];
    const atualizadoEm = linhas
      .map((l) => l.last_synced_at ?? null)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

    return {
      ok: true,
      atualizadoEm,
      postos: linhas
        .filter((l) => (l.name ?? "").trim().length > 0)
        .map(paraPosto)
        .filter((p) => p.ativo && p.encerradoEm == null && p.motivoEncerramento == null),
    };
  });

export type CargoPosto = { cargo: string; quantidade: number; principal: boolean };
export type CargosPorPostoResultado = {
  ok: boolean;
  /** Chave: nexti_id do posto. */
  porPosto: Record<string, CargoPosto[]>;
  erro?: string;
};

const CARGOS_PRINCIPAIS = new Set([
  "AUXILIAR DE LIMPEZA",
  "PORTEIRO I",
  "PORTEIRO II",
  "VIGIA",
]);

function normalizarCargo(raw: string | null | undefined): string {
  const limpo = (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!limpo) return "Sem cargo informado";

  if (
    (limpo.includes("AUXILIAR") && limpo.includes("LIMPEZA")) ||
    limpo.includes("AUXILIAR DE SERVICOS GERAIS") ||
    limpo.includes("AUXILIAR DE SERVIÇOS GERAIS") ||
    limpo.includes("SERVICOS GERAIS") ||
    limpo.includes("SERVIÇOS GERAIS")
  )
    return "AUXILIAR DE LIMPEZA";
  if (limpo.includes("PORTEIRO") || limpo.includes("PORTA")) {
    if (limpo.includes("II") || limpo.includes("2")) return "PORTEIRO II";
    if (limpo.includes("I") || limpo.includes("1") || limpo.includes("PRIMEIRO"))
      return "PORTEIRO I";
    return "PORTEIRO I";
  }
  if (limpo.includes("VIGIA") || limpo.includes("VIGILANTE")) return "VIGIA";

  return raw?.trim() || "Sem cargo informado";
}

function cargoPrincipal(cargo: string): boolean {
  return CARGOS_PRINCIPAIS.has(cargo.toUpperCase());
}

/** Lista os cargos lotados em cada posto, a partir dos colaboradores ativos da NEXTI. */
export const listarCargosPorPosto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CargosPorPostoResultado> => {
    const porPosto: Record<string, Map<string, number>> = {};
    const tamanho = 1000;

    // O cadastro de pessoas traz apenas o código do cargo; resolve o nome em nexti_careers.
    const { data: careers, error: erroCareers } = await context.supabase
      .from("nexti_careers")
      .select("nexti_id, name");
    if (erroCareers) return { ok: false, porPosto: {}, erro: erroCareers.message };
    const nomeCargo = new Map<number, string>();
    for (const c of careers ?? []) {
      if (c.nexti_id != null && c.name) nomeCargo.set(Number(c.nexti_id), c.name);
    }

    for (let pagina = 0; pagina < 20; pagina++) {
      const { data, error } = await context.supabase
        .from("nexti_persons")
        .select("workplace_id, career_id, career_name, demission_date")
        .range(pagina * tamanho, pagina * tamanho + tamanho - 1);

      if (error) return { ok: false, porPosto: {}, erro: error.message };
      const linhas = data ?? [];
      for (const l of linhas) {
        if (l.demission_date) continue;
        if (l.workplace_id == null) continue;
        const nome =
          l.career_name ||
          (l.career_id != null ? nomeCargo.get(Number(l.career_id)) : undefined);
        const cargo = normalizarCargo(nome);
        const chave = String(l.workplace_id);
        const mapa = (porPosto[chave] ??= new Map());
        mapa.set(cargo, (mapa.get(cargo) ?? 0) + 1);
      }
      if (linhas.length < tamanho) break;
    }

    return {
      ok: true,
      porPosto: Object.fromEntries(
        Object.entries(porPosto).map(([k, m]) => {
          const lista = [...m.entries()]
            .map(([cargo, quantidade]) => ({ cargo, quantidade, principal: cargoPrincipal(cargo) }))
            .sort((a, b) => {
              if (a.principal !== b.principal) return a.principal ? -1 : 1;
              return b.quantidade - a.quantidade || a.cargo.localeCompare(b.cargo);
            });
          return [k, lista];
        }),
      ),
    };
  });

/**
 * Importa automaticamente os postos da NEXTI, reconhecendo a quantidade de
 * vagas disponíveis de cada posto (campo `vacantJob` da API).
 */
export const importarPostosVagasNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportarVagasResultado> => {
    const { loadConfig, normalizeBaseUrl, requestNexti } = await import("@/lib/nexti.functions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let config;
    try {
      const bruta = await loadConfig(context.supabase as never);
      config = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
    } catch (e) {
      return {
        ok: false,
        lidos: 0,
        gravados: 0,
        totalVagas: 0,
        erro: e instanceof Error ? e.message : "Configuração da NEXTI indisponível.",
      };
    }

    const coletados: Rec[] = [];
    let erro: string | undefined;

    for (const endpoint of ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"]) {
      try {
        const parcial: Rec[] = [];
        for (let page = 0; page < 40; page++) {
          const resposta = await requestNexti({
            config,
            endpoint,
            method: "GET",
            query: { page, size: 200 },
          });
          const lista = listaDoPayload(resposta.data);
          if (lista.length === 0) break;
          parcial.push(...lista);
          if (lista.length < 200) break;
        }
        if (parcial.length > 0) {
          coletados.push(...parcial);
          break;
        }
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
    }

    if (coletados.length === 0) {
      return {
        ok: false,
        lidos: 0,
        gravados: 0,
        totalVagas: 0,
        erro: erro ?? "A API da NEXTI não retornou postos de serviço.",
      };
    }

    const agora = new Date().toISOString();
    const porId = new Map<number, LinhaBanco & { updated_at: string; raw_payload: unknown }>();
    let totalVagas = 0;

    for (const item of coletados) {
      const id = Number(escolher(item, ["id", "nextiId", "workplaceId"]));
      const nome = texto(escolher(item, ["name", "nome", "description", "workplaceName"]));
      if (!Number.isFinite(id) || !nome) continue;
      const nomeLimpo = nome.toUpperCase().trim();
      // Postos administrativos que não devem ser listados como postos de serviço.
      if (nomeLimpo === "CIOP" || nomeLimpo.startsWith("CIOP ") || nomeLimpo.startsWith("CIOP-")) continue;
      if (nomeLimpo === "CARGILL" || nomeLimpo.startsWith("CARGILL ") || nomeLimpo.startsWith("CARGILL-")) continue;
      if (nomeLimpo === "FERISTA" || nomeLimpo.startsWith("FERISTA ") || nomeLimpo.startsWith("FERISTA-")) continue;
      if (nomeLimpo === "JOVEM APRENDIZ" || nomeLimpo.startsWith("JOVEM APRENDIZ ") || nomeLimpo.startsWith("JOVEM APRENDIZ-")) continue;
      if (nomeLimpo.startsWith("RESERVA -")) continue;
      const vagas = inteiro(
        escolher(item, ["vacantJob", "vacantJobs", "vagas", "vacancy", "vacancies"]),
      );
      totalVagas += vagas;
      const finishDateRaw = escolher(item, ["finishDate", "finish_date", "encerramento"]);
      const finishDate = normalizarData(finishDateRaw);

      const motivoEncerramentoRaw = escolher(item, [
        "workplaceClosingReasonName",
        "workplaceClosingReasonId",
        "closingReason",
        "closing_reason",
        "closingReasonName",
        "closingNote",
        "motivoEncerramento",
        "motivo_encerramento",
      ]);
      const motivoEncerramento = texto(motivoEncerramentoRaw);
      porId.set(id, {
        nexti_id: id,
        name: nome,
        client_name: texto(escolher(item, ["clientName", "cliente", "customerName"])),
        company_name: texto(escolher(item, ["companyName", "empresa"])),
        city: texto(escolher(item, ["cityName", "city", "cidade"])),
        state: texto(escolher(item, ["federatedUnitInitials", "state", "uf", "estado"])),
        active: escolher(item, ["active"]) !== false && finishDate == null && motivoEncerramento == null,
        finish_date: finishDate,
        closing_reason: motivoEncerramento,
        vacant_job: vagas,
        last_synced_at: agora,
        updated_at: agora,
        raw_payload: item,
      });
    }

    const linhas = [...porId.values()];
    let gravados = 0;

    for (let i = 0; i < linhas.length; i += 250) {
      const bloco = linhas.slice(i, i + 250);
      const { error } = await supabaseAdmin
        .from("nexti_workplaces")
        .upsert(bloco as never, { onConflict: "nexti_id" });
      if (error) {
        return { ok: false, lidos: coletados.length, gravados, totalVagas, erro: error.message };
      }
      gravados += bloco.length;
    }

    return { ok: true, lidos: coletados.length, gravados, totalVagas };
  });
