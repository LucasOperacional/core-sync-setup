import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehGerenteAreaA } from "@/lib/gerentes-area-a";
import {
  loadConfig,
  normalizeBaseUrl,
  requestNexti,
  type NextiConfig,
} from "@/lib/nexti.functions";

export type NextiModulo =
  | "companies"
  | "workplaces"
  | "careers"
  | "areas"
  | "persons"
  | "absences"
  | "clockings"
  | "documents";

export const NEXTI_MODULOS: NextiModulo[] = [
  "companies",
  "workplaces",
  "careers",
  "areas",
  "persons",
  "absences",
  "clockings",
  "documents",
];

export type NextiModuloResultado = {
  modulo: NextiModulo;
  ok: boolean;
  registros: number;
  paginas: number;
  endpoint?: string;
  erro?: string;
};

export type NextiSyncResultado = {
  ok: boolean;
  runId?: string;
  iniciadoEm: string;
  finalizadoEm: string;
  totalRegistros: number;
  modulos: NextiModuloResultado[];
  erro?: string;
};

const ENDPOINTS: Record<NextiModulo, string[]> = {
  companies: ["/api/companies/all", "/companies/all", "/api/company/all"],
  workplaces: ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"],
  careers: ["/api/careers/all", "/careers/all", "/api/career/all"],
  areas: ["/api/areas/all", "/areas/all", "/api/area/all"],
  persons: ["/api/persons/all", "/persons/all", "/api/person/all"],
  absences: ["/api/absences/lastupdate/start/{start}/finish/{finish}"],
  clockings: ["/api/clockings/lastupdate/start/{start}/finish/{finish}/types"],
  documents: [
    "/api/documents/all",
    "/documents/all",
    "/api/document/all",
    "/api/personDocuments/all",
  ],
};

const TABELAS: Record<NextiModulo, string> = {
  companies: "nexti_companies",
  workplaces: "nexti_workplaces",
  careers: "nexti_careers",
  areas: "nexti_areas",
  persons: "nexti_persons",
  absences: "nexti_absences",
  clockings: "nexti_clockings",
  documents: "nexti_documents",
};

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(obj: Rec, keys: string[]): unknown {
  for (const key of keys) {
    const direto = obj[key];
    if (direto !== undefined && direto !== null && direto !== "") return direto;
  }
  // busca case-insensitive
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

function str(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRec(value)) {
    const nome = pick(value, ["name", "nome", "description", "descricao", "fantasyName"]);
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

function iso(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const nexti = raw.match(/^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})$/);
  if (nexti) {
    const [, d, m, y, hh, mm, ss] = nexti;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const [, d, m, y, hh = "00", mm = "00", ss = "00"] = brMatch;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`).toISOString();
  }
  if (typeof value === "number") return new Date(value).toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dateOnly(value: unknown): string | null {
  const timestamp = iso(value);
  return timestamp ? (timestamp.slice(0, 10) as string) : null;
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

function mapear(modulo: NextiModulo, item: Rec, agora: string): Rec | null {
  const nextiId = num(pick(item, ["id", "nextiId", "codigo", "code"]));
  if (nextiId === null) return null;

  const base = {
    nexti_id: nextiId,
    raw_payload: item,
    updated_at: agora,
    last_synced_at: agora,
  };

  switch (modulo) {
    case "companies":
      return {
        ...base,
        external_id: str(pick(item, ["externalId", "external_id", "codigoExterno"])),
        company_name: str(pick(item, ["companyName", "name", "razaoSocial", "nome"])),
        fantasy_name: str(pick(item, ["fantasyName", "nomeFantasia"])),
        company_number: str(pick(item, ["companyNumber", "cnpj", "documento"])),
        active: bool(pick(item, ["active", "ativo"])),
      };
    case "workplaces":
      return {
        ...base,
        external_id: str(pick(item, ["externalId", "external_id"])),
        name: str(pick(item, ["name", "nome", "description"])),
        company_id: num(pick(item, ["companyId", "company"])),
        company_name: str(pick(item, ["companyName", "company"])),
        client_name: str(pick(item, ["clientName", "cliente"])),
        city: str(pick(item, ["city", "cidade"])),
        state: str(pick(item, ["state", "uf", "estado"])),
        department: str(pick(item, ["department", "departamento", "areaName"])),
        cost_center: str(pick(item, ["costCenter", "centroCusto"])),
        active: bool(pick(item, ["active", "ativo"])),
      };
    case "careers":
      return {
        ...base,
        external_id: str(pick(item, ["externalId", "external_id"])),
        name: str(pick(item, ["name", "nome", "description"])),
        career_group_name: str(pick(item, ["careerGroupName", "grupo", "careerGroup"])),
      };
    case "areas":
      return {
        ...base,
        external_id: str(pick(item, ["externalId", "external_id"])),
        name: str(pick(item, ["name", "nome", "description"])),
      };
    case "persons":
      return {
        ...base,
        external_id: str(pick(item, ["externalId", "external_id", "matricula"])),
        nome: str(pick(item, ["name", "nome", "personName", "fullName"])),
        matricula: str(pick(item, ["registration", "matricula", "externalId", "code"])),
        situacao_id: num(pick(item, ["situationId", "statusId", "situacaoId"])),
        situacao: str(pick(item, ["situation", "status", "situacao"])),
        company_id: num(pick(item, ["companyId", "company"])),
        workplace_id: num(pick(item, ["workplaceId", "workplace"])),
        career_id: num(pick(item, ["careerId", "career"])),
        workplace_name: str(pick(item, ["workplaceName", "workplace", "posto"])),
        career_name: str(pick(item, ["careerName", "career", "cargo"])),
        admission_date: dateOnly(pick(item, ["admissionDate", "dataAdmissao"])),
        demission_date: dateOnly(pick(item, ["demissionDate", "dataDemissao"])),
      };
    case "absences":
      return {
        ...base,
        person_id: num(pick(item, ["personId", "person", "idPerson"])),
        person_external_id: str(pick(item, ["personExternalId", "externalPersonId", "matricula"])),
        absence_situation_id: num(pick(item, ["absenceSituationId", "situationId", "motivoId"])),
        absence_situation_external_id: str(
          pick(item, ["absenceSituationExternalId", "situationExternalId", "motivoExterno"]),
        ),
        start_date_time: iso(pick(item, ["startDateTime", "startDate", "dataInicio", "inicio"])),
        finish_date_time: iso(pick(item, ["finishDateTime", "endDate", "dataFim", "fim"])),
        note: str(
          pick(item, [
            "note",
            "observacao",
            "obs",
            "description",
            "motivo",
            "absenceSituationName",
          ]),
        ),
        medical_doctor_name: str(pick(item, ["medicalDoctorName", "doctorName", "medico"])),
        medical_doctor_crm: str(pick(item, ["medicalDoctorCrm", "crm"])),
        cid_code: str(pick(item, ["cidCode", "cid", "codigoCid"])),
        cid_description: str(pick(item, ["cidDescription", "cidDescricao", "descricaoCid"])),
        removed: bool(pick(item, ["removed", "deleted"])) ?? false,
        last_update: iso(pick(item, ["lastUpdate", "updatedAt", "dataAtualizacao"])),
      };
    case "clockings":
      return {
        ...base,
        person_id: num(pick(item, ["personId", "person", "idPerson"])),
        external_person_id: str(pick(item, ["externalPersonId", "personExternalId", "matricula"])),
        person_name: str(pick(item, ["personName", "name", "nome"])),
        clocking_date: iso(pick(item, ["clockingDate", "date", "dataMarcacao", "dateTime"])),
        reference_date: dateOnly(
          pick(item, ["referenceDate", "clockingDate", "date", "dataMarcacao"]),
        ),
        clocking_type_id: num(pick(item, ["clockingTypeId", "typeId"])),
        clocking_type_name: str(pick(item, ["clockingTypeName", "typeName", "tipo"])),
        workplace_id: num(pick(item, ["workplaceId", "workplace"])),
        external_workplace_id: str(pick(item, ["externalWorkplaceId", "workplaceExternalId"])),
        clocking_collector_name: str(
          pick(item, ["clockingCollectorName", "collectorName", "coletor"]),
        ),
        last_update: iso(pick(item, ["lastUpdate", "updatedAt"])),
        removed: bool(pick(item, ["removed", "deleted"])) ?? false,
      };
    case "documents":
      return {
        ...base,
        person_id: num(pick(item, ["personId", "person", "idPerson"])),
        workplace_id: num(pick(item, ["workplaceId", "workplace"])),
        document_type_customer_id: num(
          pick(item, ["documentTypeCustomerId", "documentTypeId", "typeId"]),
        ),
        document_type_customer_name: str(
          pick(item, ["documentTypeCustomerName", "documentTypeName", "typeName", "tipo"]),
        ),
        issue_date: dateOnly(pick(item, ["issueDate", "dataEmissao", "date"])),
        due_date: dateOnly(pick(item, ["dueDate", "dataValidade", "validade"])),
        note: str(pick(item, ["note", "observacao", "description"])),
        document_url: str(pick(item, ["documentUrl", "url", "link", "fileUrl"])),
      };
    default:
      return null;
  }
}

function fmtNexti(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getUTCDate())}${p(date.getUTCMonth() + 1)}${date.getUTCFullYear()}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

/** Janelas de data exigidas pela NEXTI (ausências: máx. 30 dias; marcações: máx. 1 dia). */
function janelas(modulo: NextiModulo): Array<{ start: string; finish: string }> {
  const agora = new Date();
  const lista: Array<{ start: string; finish: string }> = [];
  if (modulo === "absences") {
    for (let i = 0; i < 3; i++) {
      const fim = new Date(agora.getTime() - i * 29 * 86400000);
      const inicio = new Date(fim.getTime() - 29 * 86400000);
      lista.push({ start: fmtNexti(inicio), finish: fmtNexti(fim) });
    }
  } else if (modulo === "clockings") {
    for (let i = 0; i < 7; i++) {
      const fim = new Date(agora.getTime() - i * 86400000);
      const inicio = new Date(fim.getTime() - 86400000 + 1000);
      lista.push({ start: fmtNexti(inicio), finish: fmtNexti(fim) });
    }
  } else {
    lista.push({ start: "", finish: "" });
  }
  return lista;
}

let situacoesCache: Map<number, string> | null = null;

async function carregarSituacoes(config: NextiConfig): Promise<Map<number, string>> {
  if (situacoesCache) return situacoesCache;
  const mapa = new Map<number, string>();
  try {
    const resposta = await requestNexti({
      config,
      endpoint: "/api/absencesituations/all",
      method: "GET",
      query: { page: 0, size: 500 },
    });
    for (const item of extrairLista(resposta.data)) {
      const id = num(pick(item, ["id", "nextiId"]));
      const nome = str(pick(item, ["name", "description", "nome"]));
      if (id !== null && nome) mapa.set(id, nome);
    }
  } catch {
    /* segue sem nomes de situação */
  }
  situacoesCache = mapa;
  return mapa;
}

/**
 * REGRA DO PROJETO: só importamos atividades ligadas aos Gerentes de Área A
 * (lista única em src/lib/gerentes-area-a.ts). O escopo é formado pelos postos
 * supervisionados por eles (relatórios do NEXTI Control 2.0) e pelos
 * colaboradores desses postos. Quando o escopo ainda não é conhecido
 * (primeira sincronização, sem relatórios), nada é bloqueado.
 */
type EscopoGerentes = { postos: Set<number>; pessoas: Set<number>; conhecido: boolean };

async function carregarEscopoGerentes(supabaseAdmin: any): Promise<EscopoGerentes> {
  const postos = new Set<number>();
  const pessoas = new Set<number>();

  const { data: respostas } = await supabaseAdmin
    .from("nexti_checklist_answers")
    .select("supervisor_nome, workplace_id")
    .not("workplace_id", "is", null)
    .limit(20000);

  for (const r of (respostas ?? []) as Array<{
    supervisor_nome: string | null;
    workplace_id: number | null;
  }>) {
    if (!ehGerenteAreaA(r.supervisor_nome ?? "")) continue;
    const id = Number(r.workplace_id);
    if (Number.isFinite(id)) postos.add(id);
  }

  if (postos.size === 0) return { postos, pessoas, conhecido: false };

  const { data: pes } = await supabaseAdmin
    .from("nexti_persons")
    .select("nexti_id, workplace_id")
    .in("workplace_id", [...postos])
    .limit(20000);
  for (const p of (pes ?? []) as Array<{ nexti_id: number }>) {
    const id = Number(p.nexti_id);
    if (Number.isFinite(id)) pessoas.add(id);
  }

  return { postos, pessoas, conhecido: true };
}

function dentroDoEscopo(modulo: NextiModulo, linha: Rec, escopo: EscopoGerentes): boolean {
  if (!escopo.conhecido) return true;
  const posto = Number(linha["workplace_id"]);
  const pessoa = Number(linha["person_id"]);
  switch (modulo) {
    case "workplaces":
      return escopo.postos.has(Number(linha["nexti_id"]));
    case "persons":
      return escopo.postos.has(posto);
    case "absences":
      return escopo.pessoas.has(pessoa);
    case "clockings":
    case "documents":
      return escopo.pessoas.has(pessoa) || escopo.postos.has(posto);
    default:
      // companies, careers, areas: dados de referência, sempre importados.
      return true;
  }
}

async function sincronizarModulo(
  modulo: NextiModulo,
  config: NextiConfig,
  supabaseAdmin: any,
  escopo: EscopoGerentes,
): Promise<NextiModuloResultado> {
  const candidatos = ENDPOINTS[modulo];
  let ultimoErro = "Nenhum endpoint disponível.";
  const situacoes = modulo === "absences" ? await carregarSituacoes(config) : null;

  for (const modelo of candidatos) {
    let registros = 0;
    let paginas = 0;
    try {
      for (const janela of janelas(modulo)) {
        const endpoint = modelo.replace("{start}", janela.start).replace("{finish}", janela.finish);

        for (let page = 0; page < MAX_PAGES; page++) {
          const resposta = await requestNexti({
            config,
            endpoint,
            method: "GET",
            query: { page, size: PAGE_SIZE },
          });
          const lista = extrairLista(resposta.data);
          paginas += 1;
          if (lista.length === 0) break;

          const agora = new Date().toISOString();
          const linhas = lista
            .map((item) => mapear(modulo, item, agora))
            .filter((linha): linha is Rec => linha !== null)
            .map((linha) => {
              if (!situacoes) return linha;
              const nome = situacoes.get(Number(linha["absence_situation_id"]));
              if (nome) linha["note"] = [linha["note"], nome].filter(Boolean).join(" - ");
              return linha;
            })
            // REGRA: apenas atividades dos Gerentes de Área A.
            .filter((linha) => dentroDoEscopo(modulo, linha, escopo));

          if (linhas.length > 0) {
            const { error } = await supabaseAdmin
              .from(TABELAS[modulo])
              .upsert(linhas, { onConflict: "nexti_id" });
            if (error) throw new Error(error.message);
            registros += linhas.length;
          }

          if (lista.length < PAGE_SIZE) break;
        }
      }

      return { modulo, ok: true, registros, paginas, endpoint: modelo };
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : String(error);
    }
  }

  return { modulo, ok: false, registros: 0, paginas: 0, erro: ultimoErro };
}

export const syncNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { modulos?: NextiModulo[]; modo?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<NextiSyncResultado> => {
    const iniciadoEm = new Date().toISOString();
    const modulos = (data.modulos && data.modulos.length > 0 ? data.modulos : NEXTI_MODULOS).filter(
      (m) => NEXTI_MODULOS.includes(m),
    );
    const modo = data.modo === "manual" ? "manual" : "automatico";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let runId: string | undefined;
    try {
      const { data: run } = await supabaseAdmin
        .from("nexti_sync_runs")
        .insert({
          modulo: modulos.join(","),
          modo,
          status: "executando",
          iniciado_em: iniciadoEm,
          usuario_id: (context as { userId?: string }).userId ?? null,
        } as never)
        .select("id")
        .maybeSingle();
      runId = (run as { id?: string } | null)?.id;
    } catch {
      runId = undefined;
    }

    try {
      const config = await loadConfig((context as { supabase: unknown }).supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      const resultados: NextiModuloResultado[] = [];
      const escopo = await carregarEscopoGerentes(supabaseAdmin);
      for (const modulo of modulos) {
        resultados.push(await sincronizarModulo(modulo, config, supabaseAdmin, escopo));
      }

      const totalRegistros = resultados.reduce((acc, r) => acc + r.registros, 0);
      const comErro = resultados.filter((r) => !r.ok);
      const finalizadoEm = new Date().toISOString();

      if (runId) {
        await supabaseAdmin
          .from("nexti_sync_runs")
          .update({
            status:
              comErro.length === resultados.length
                ? "erro"
                : comErro.length > 0
                  ? "parcial"
                  : "sucesso",
            finalizado_em: finalizadoEm,
            importados: totalRegistros,
            paginas: resultados.reduce((acc, r) => acc + r.paginas, 0),
            com_erro: comErro.length,
            mensagem:
              comErro.length > 0
                ? comErro
                    .map((r) => `${r.modulo}: ${r.erro ?? "erro"}`)
                    .join(" | ")
                    .slice(0, 500)
                : `${totalRegistros} registro(s) sincronizado(s).`,
            updated_at: finalizadoEm,
          } as never)
          .eq("id", runId);

        if (comErro.length > 0) {
          await supabaseAdmin.from("nexti_sync_errors").insert(
            comErro.map((r) => ({
              run_id: runId,
              modulo: r.modulo,
              etapa: "fetch",
              mensagem: (r.erro ?? "Erro desconhecido").slice(0, 500),
            })) as never,
          );
        }
      }

      return {
        ok: comErro.length < resultados.length,
        ...(runId ? { runId } : {}),
        iniciadoEm,
        finalizadoEm,
        totalRegistros,
        modulos: resultados,
      };
    } catch (error) {
      const finalizadoEm = new Date().toISOString();
      const mensagem =
        error instanceof Error ? error.message : "Erro desconhecido na sincronização.";
      if (runId) {
        await supabaseAdmin
          .from("nexti_sync_runs")
          .update({
            status: "erro",
            finalizado_em: finalizadoEm,
            mensagem: mensagem.slice(0, 500),
            com_erro: 1,
            updated_at: finalizadoEm,
          } as never)
          .eq("id", runId);
      }
      return {
        ok: false,
        ...(runId ? { runId } : {}),
        iniciadoEm,
        finalizadoEm,
        totalRegistros: 0,
        modulos: [],
        erro: mensagem,
      };
    }
  });
