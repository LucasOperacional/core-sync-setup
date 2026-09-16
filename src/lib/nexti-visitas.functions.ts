import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadConfig,
  normalizeBaseUrl,
  requestNexti,
  type NextiConfig,
} from "@/lib/nexti.functions";
import { GERENTES_AREA_A, gerenteAreaACanonico } from "@/lib/gerentes-area-a";

export type NextiVisitasSyncResultado = {
  ok: boolean;
  iniciadoEm: string;
  finalizadoEm: string;
  postosVarridos: number;
  checklists: number;
  respostas: number;
  /** Total de relatórios por realizador da tarefa (Gerente de Área / supervisor). */
  porRealizador?: { nome: string; relatorios: number }[];
  /** Gerentes de Área autorizados que não retornaram nenhum relatório. */
  semRelatorios?: string[];
  /** Falhas isoladas de postos/checklists durante a varredura. */
  falhas?: string[];
  erro?: string;
};

const CONCORRENCIA = 12;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Formato exigido pela NEXTI: ddMMyyyyHHmmss */
function nextiDate(d: Date) {
  return `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function parseNextiDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function conteudo(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const c = (data as { content?: unknown }).content;
    if (Array.isArray(c)) return c as Record<string, unknown>[];
  }
  return [];
}

async function emLotes<T>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<void>,
  falhas?: string[],
) {
  const fila = [...itens];
  const workers = Array.from({ length: Math.min(limite, fila.length || 1) }, async () => {
    for (;;) {
      const item = fila.shift();
      if (item === undefined) return;
      try {
        await fn(item);
      } catch (e) {
        // Falha isolada de posto/checklist não interrompe a varredura.
        if (falhas && falhas.length < 5) {
          falhas.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  });
  await Promise.all(workers);
}

type QuestionInfo = {
  nome: string;
  /** true quando a pergunta define alguma alternativa como esperada. */
  temEsperado: boolean;
  alternativas: Map<number, { nome: string; esperado: boolean; exigeObs: boolean }>;
};

/**
 * Alguns checklists da NEXTI (ex.: "CHECK LIST - SUPERVISÃO (novo)") não marcam
 * nenhuma alternativa como `expected`. Nesses casos, usar `expected` puro
 * classificaria 100% das respostas como não conformes. O fallback abaixo
 * classifica pelo texto da alternativa (e por exigir observação).
 */
function conformePorTexto(texto: string, exigeObs: boolean): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (/^nao\b/.test(t) || /^n\/?a\b/.test(t)) return false;
  if (exigeObs) return false;
  return true;
}

type ChecklistInfo = {
  id: number;
  nome: string;
  tipo: number | null;
  perguntas: Map<number, QuestionInfo>;
};

function mapearChecklist(raw: Record<string, unknown>): ChecklistInfo {
  const perguntas = new Map<number, QuestionInfo>();
  const questions = Array.isArray(raw["questions"])
    ? (raw["questions"] as Record<string, unknown>[])
    : [];
  for (const q of questions) {
    const qid = Number(q["id"]);
    if (!Number.isFinite(qid)) continue;
    const alternativas = new Map<number, { nome: string; esperado: boolean; exigeObs: boolean }>();
    const alts = Array.isArray(q["alternatives"])
      ? (q["alternatives"] as Record<string, unknown>[])
      : [];
    for (const a of alts) {
      const aid = Number(a["id"]);
      if (!Number.isFinite(aid)) continue;
      alternativas.set(aid, {
        nome: String(a["name"] ?? ""),
        esperado: a["expected"] === true,
        exigeObs: a["requireObservation"] === true,
      });
    }
    const temEsperado = [...alternativas.values()].some((a) => a.esperado);
    perguntas.set(qid, { nome: String(q["name"] ?? ""), temEsperado, alternativas });
  }
  return {
    id: Number(raw["id"]),
    nome: String(raw["name"] ?? "Checklist"),
    tipo: Number.isFinite(Number(raw["checklistTypeId"])) ? Number(raw["checklistTypeId"]) : null,
    perguntas,
  };
}

/**
 * Os relatórios só podem ser varridos se os postos já estiverem no banco.
 * Quando a tabela está vazia (ou o módulo de postos nunca rodou), buscamos
 * os postos direto na API da NEXTI antes de procurar os checklists.
 */
/** Converte latitude/longitude da NEXTI, tratando vazio/nulo/0 como ausente. */
function coordenada(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Converte data da NEXTI (ddMMyyyyHHmmss) em ISO (yyyy-mm-dd). */
function dataNexti(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!/^\d{8}/.test(texto)) return null;
  return `${texto.slice(4, 8)}-${texto.slice(2, 4)}-${texto.slice(0, 2)}`;
}

export async function garantirPostos(
  config: NextiConfig,
  supabaseAdmin: { from: (t: string) => any },
): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  const agora = new Date().toISOString();
  // A NEXTI só devolve o `companyId` no posto; o nome da empresa vem da lista
  // de empresas. Sem esse mapa a coluna company_name ficava sempre nula.
  const empresasPorId = new Map<number, string>();
  for (const rota of ["/api/companies/all", "/companies/all", "/api/company/all"]) {
    try {
      for (let page = 0; page < 20; page++) {
        const res = await requestNexti({
          config,
          method: "GET",
          endpoint: rota,
          query: { page: String(page), size: "200" },
        });
        if (res.status !== 200) break;
        const itens = conteudo(res.data);
        if (itens.length === 0) break;
        for (const c of itens) {
          const cid = Number(c["id"]);
          const nome = ["companyName", "name", "razaoSocial", "fantasyName"]
            .map((k) => (typeof c[k] === "string" ? String(c[k]).trim() : ""))
            .find((v) => v.length > 0);
          if (Number.isFinite(cid) && nome) empresasPorId.set(cid, nome);
        }
        if (itens.length < 200) break;
      }
    } catch {
      // sem a lista de empresas seguimos com o que vier no próprio posto
    }
    if (empresasPorId.size > 0) break;
  }
  for (const base of ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"]) {
    try {
      for (let page = 0; page < 40; page++) {
        const res = await requestNexti({
          config,
          method: "GET",
          endpoint: base,
          query: { page: String(page), size: "200" },
        });
        if (res.status !== 200) break;
        const itens = conteudo(res.data);
        if (itens.length === 0) break;
        for (const item of itens) {
          const id = Number(item["id"]);
          if (!Number.isFinite(id)) continue;
          const empresa = item["company"] as Record<string, unknown> | undefined;
          const companyId = Number.isFinite(Number(item["companyId"]))
            ? Number(item["companyId"])
            : null;
          linhas.push({
            nexti_id: id,
            external_id: item["externalId"] ? String(item["externalId"]) : null,
            name: item["name"] ? String(item["name"]) : null,
            company_id: companyId,
            company_name:
              (companyId !== null ? empresasPorId.get(companyId) : null) ??
              (empresa && typeof empresa["name"] === "string" ? String(empresa["name"]) : null),

            client_name: item["clientName"] ? String(item["clientName"]) : null,
            city: item["city"]
              ? String(item["city"])
              : item["cityName"]
                ? String(item["cityName"])
                : null,
            state: item["state"] ? String(item["state"]) : null,
            department: item["department"] ? String(item["department"]) : null,
            cost_center: item["costCenter"] ? String(item["costCenter"]) : null,
            active: item["active"] === undefined ? null : item["active"] === true,
            // Encerramento do posto (a NEXTI usa ddMMyyyyHHmmss em finishDate).
            finish_date: dataNexti(item["finishDate"]),
            closing_reason:
              typeof item["workplaceClosingReasonName"] === "string" &&
              String(item["workplaceClosingReasonName"]).trim().length > 0
                ? String(item["workplaceClosingReasonName"]).trim()
                : null,
            // Endereço completo e coordenadas para o mapa de postos de serviço.
            address: item["address"] ? String(item["address"]) : null,
            address_number: item["addressNumber"] ? String(item["addressNumber"]) : null,
            district: item["district"] ? String(item["district"]) : null,
            zip_code: item["zipCode"] ? String(item["zipCode"]) : null,
            phone: item["phone"] ? String(item["phone"]) : null,
            manager_name: item["managerName"] ? String(item["managerName"]) : null,
            latitude: coordenada(item["latitude"]),
            longitude: coordenada(item["longitude"]),
            raw_payload: item,
            last_synced_at: agora,
          });
        }
        if (itens.length < 200) break;
      }
    } catch {
      // tenta o próximo caminho de endpoint
    }
    if (linhas.length > 0) break;
  }
  for (let i = 0; i < linhas.length; i += 200) {
    await supabaseAdmin
      .from("nexti_workplaces")
      .upsert(linhas.slice(i, i + 200), { onConflict: "nexti_id" });
  }
  return linhas;
}

export async function varrerChecklists(
  config: NextiConfig,
  workplaceIds: number[],
  start: Date,
  finish: Date,
) {
  const encontrados = new Map<number, { raw: Record<string, unknown>; postos: Set<number> }>();
  await emLotes(workplaceIds, CONCORRENCIA, async (wid) => {
    // Percorre TODAS as páginas de checklists do posto.
    for (let page = 0; ; page++) {
      const res = await requestNexti({
        config,
        method: "GET",
        endpoint: `/api/checklists/workplace/${wid}/start/${nextiDate(start)}/finish/${nextiDate(finish)}`,
        query: { page: String(page), size: "200" },
      });
      if (res.status !== 200) return;
      const itens = conteudo(res.data);
      if (itens.length === 0) return;
      for (const item of itens) {
        const id = Number(item["id"]);
        if (!Number.isFinite(id)) continue;
        const atual = encontrados.get(id) ?? { raw: item, postos: new Set<number>() };
        atual.postos.add(wid);
        encontrados.set(id, atual);
      }
      if (itens.length < 200) return;
      if (page > 200) return;
    }
  });
  return encontrados;
}

export async function executarImportacaoVisitas(
  config: NextiConfig,
  supabaseAdmin: { from: (t: string) => any },
  data: { dias?: number; completo?: boolean; inicio?: string; fim?: string },
): Promise<NextiVisitasSyncResultado> {
  const iniciadoEm = new Date().toISOString();
  try {
    // A URL salva pode conter o caminho do token; normaliza para a raiz da API.
    const dias = Math.min(Math.max(data.dias ?? 540, 1), 1095);
    const inicioPedido = data.inicio ? new Date(`${data.inicio}T00:00:00Z`) : null;
    const fimPedido = data.fim ? new Date(`${data.fim}T23:59:59Z`) : null;
    const finish = fimPedido && !Number.isNaN(fimPedido.getTime()) ? fimPedido : new Date();
    const start =
      inicioPedido && !Number.isNaN(inicioPedido.getTime())
        ? inicioPedido
        : new Date(finish.getTime() - dias * 86400000);
    // A descoberta dos checklists usa uma janela ainda maior: a vigência
    // do checklist pode ter começado bem antes das respostas recentes.
    const startChecklists = new Date(start.getTime() - 730 * 86400000);

    // Dicionários locais para enriquecer as respostas.
    const [{ data: postos }, { data: pessoas }, { data: checklistsSalvos }] = await Promise.all([
      supabaseAdmin
        .from("nexti_workplaces")
        .select("nexti_id,name,client_name,city,state")
        .limit(5000),
      supabaseAdmin
        .from("nexti_persons")
        .select("nexti_id,nome,workplace_id,workplace_name,career_name")
        .limit(20000),
      supabaseAdmin.from("nexti_checklists").select("nexti_id,raw_payload").limit(2000),
    ]);

    const mapaPostos = new Map<
      number,
      { name: string | null; cliente: string | null; cidade: string | null; uf: string | null }
    >();
    for (const p of postos ?? []) {
      mapaPostos.set(Number(p.nexti_id), {
        name: p.name ?? null,
        cliente: p.client_name ?? null,
        cidade: p.city ?? null,
        uf: p.state ?? null,
      });
    }

    // Sem postos no banco não existe como varrer relatórios: busca na API.
    if (mapaPostos.size === 0) {
      const novos = await garantirPostos(config, supabaseAdmin as never);
      for (const linha of novos) {
        mapaPostos.set(Number(linha["nexti_id"]), {
          name: (linha["name"] as string) ?? null,
          cliente: (linha["client_name"] as string) ?? null,
          cidade: (linha["city"] as string) ?? null,
          uf: (linha["state"] as string) ?? null,
        });
      }
    }

    const mapaPessoas = new Map<number, string>();
    /** Posto/cargo do supervisor: usado quando a resposta não traz o posto. */
    const postoDaPessoa = new Map<
      number,
      { workplaceId: number | null; workplaceName: string | null }
    >();
    for (const p of pessoas ?? []) {
      if (p.nome) mapaPessoas.set(Number(p.nexti_id), p.nome);
      postoDaPessoa.set(Number(p.nexti_id), {
        workplaceId: Number.isFinite(Number(p.workplace_id)) ? Number(p.workplace_id) : null,
        workplaceName: p.workplace_name ?? null,
      });
    }

    const workplaceIds = [...mapaPostos.keys()];

    let checklists = new Map<number, { raw: Record<string, unknown>; postos: Set<number> }>();
    let postosVarridos = 0;

    const precisaVarrer =
      data.completo === true ||
      Boolean(data.inicio) ||
      !checklistsSalvos ||
      checklistsSalvos.length === 0;

    if (precisaVarrer) {
      checklists = await varrerChecklists(config, workplaceIds, startChecklists, finish);
      postosVarridos = workplaceIds.length;
    } else {
      for (const c of checklistsSalvos) {
        const raw = (c.raw_payload ?? {}) as Record<string, unknown>;
        if (raw["id"]) checklists.set(Number(c.nexti_id), { raw, postos: new Set<number>() });
      }
    }

    if (checklists.size > 0) {
      const linhas = [...checklists.entries()].map(([id, { raw, postos: ps }]) => ({
        nexti_id: id,
        name: String(raw["name"] ?? "Checklist"),
        checklist_type_id: Number.isFinite(Number(raw["checklistTypeId"]))
          ? Number(raw["checklistTypeId"])
          : null,
        status_id: Number.isFinite(Number(raw["statusId"])) ? Number(raw["statusId"]) : null,
        start_date_time: parseNextiDate(raw["startDateTime"]),
        finish_date_time: parseNextiDate(raw["finishDateTime"]),
        questions: (raw["questions"] ?? []) as never,
        workplace_ids: [...ps],
        raw_payload: raw as never,
        last_synced_at: new Date().toISOString(),
      }));
      for (let i = 0; i < linhas.length; i += 200) {
        await supabaseAdmin
          .from("nexti_checklists")
          .upsert(linhas.slice(i, i + 200) as never, { onConflict: "nexti_id" });
      }
    }

    // Respostas por checklist.
    const infos = [...checklists.values()]
      .map((c) => mapearChecklist(c.raw))
      .filter((c) => Number.isFinite(c.id));
    const respostasLinhas: Record<string, unknown>[] = [];

    const falhasRespostas: string[] = [];
    await emLotes(
      infos,
      CONCORRENCIA,
      async (info) => {
        for (let page = 0; page < 400; page++) {
          const res = await requestNexti({
            config,
            method: "GET",
            endpoint: `/api/checklists/answer/checklist/${info.id}/start/${nextiDate(start)}/finish/${nextiDate(finish)}`,
            query: { page: String(page), size: "200" },
          });
          if (res.status !== 200) return;
          const itens = conteudo(res.data);
          if (itens.length === 0) return;

          for (const item of itens) {
            const nextiId = Number(item["id"]);
            if (!Number.isFinite(nextiId)) continue;
            const personId = Number(item["personId"]);
            // A API não devolve o posto na resposta do checklist: quando faltar,
            // usamos o posto cadastrado para o supervisor que respondeu.
            const doSupervisor = postoDaPessoa.get(personId) ?? null;
            const workplaceId = Number.isFinite(Number(item["workplaceId"]))
              ? Number(item["workplaceId"])
              : (doSupervisor?.workplaceId ?? NaN);
            const posto = mapaPostos.get(workplaceId) ?? null;
            const answers = Array.isArray(item["answers"])
              ? (item["answers"] as Record<string, unknown>[])
              : [];

            let conformes = 0;
            let naoConformes = 0;
            const itensDetalhe: {
              pergunta: string;
              resposta: string;
              conforme: boolean;
              observacao: string | null;
            }[] = [];

            for (const ans of answers) {
              const qid = Number(ans["questionId"]);
              const pergunta = info.perguntas.get(qid);
              const alts = Array.isArray(ans["alternatives"])
                ? (ans["alternatives"] as Record<string, unknown>[])
                : [];
              const escolhida = alts[0];
              const altId = escolhida ? Number(escolhida["alternativeId"]) : NaN;
              const alt = pergunta?.alternativas.get(altId);
              const conforme = !alt
                ? true
                : pergunta?.temEsperado
                  ? alt.esperado
                  : conformePorTexto(alt.nome, alt.exigeObs);
              if (conforme) conformes += 1;
              else naoConformes += 1;
              itensDetalhe.push({
                pergunta: pergunta?.nome ?? `Pergunta ${qid}`,
                resposta: alt?.nome ?? "—",
                conforme,
                observacao:
                  typeof ans["observation"] === "string" && ans["observation"].trim()
                    ? String(ans["observation"]).trim()
                    : null,
              });
            }

            // REALIZADOR DA TAREFA: pessoa que respondeu o checklist na NEXTI.
            // Importamos todos os relatórios; a separação por visita usa o
            // realizador junto com o LOCAL do relatório.
            const supervisorBruto =
              mapaPessoas.get(personId) ??
              (Number.isFinite(personId) ? `Realizador ${personId}` : "Realizador não informado");

            const answerDate = parseNextiDate(item["answerDate"]);
            respostasLinhas.push({
              nexti_id: nextiId,
              checklist_id: info.id,
              checklist_name: info.nome,
              checklist_type_id: info.tipo,
              person_id: Number.isFinite(personId) ? personId : null,
              supervisor_nome: gerenteAreaACanonico(supervisorBruto) ?? supervisorBruto,
              workplace_id: Number.isFinite(workplaceId) ? workplaceId : null,
              workplace_name: posto?.name ?? doSupervisor?.workplaceName ?? null,
              cliente: posto?.cliente ?? null,
              cidade: posto?.cidade ?? null,
              uf: posto?.uf ?? null,
              answer_date: answerDate,
              reference_date: answerDate ? answerDate.slice(0, 10) : null,
              register_date: parseNextiDate(item["registerDate"]),
              total_perguntas: itensDetalhe.length,
              conformes,
              nao_conformes: naoConformes,
              itens: itensDetalhe,
              raw_payload: item,
              last_synced_at: new Date().toISOString(),
            });
          }

          if (itens.length < 200) return;
        }
      },
      falhasRespostas,
    );

    // Deduplica por nexti_id antes do upsert.
    const unicas = new Map<number, Record<string, unknown>>();
    for (const linha of respostasLinhas) unicas.set(Number(linha["nexti_id"]), linha);
    const finais = [...unicas.values()];
    for (let i = 0; i < finais.length; i += 300) {
      await supabaseAdmin
        .from("nexti_checklist_answers")
        .upsert(finais.slice(i, i + 300) as never, { onConflict: "nexti_id" });
    }

    const contagem = new Map<string, number>();
    for (const linha of finais) {
      const nome = String(linha["supervisor_nome"] ?? "Realizador não informado");
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }
    const porRealizador = [...contagem.entries()]
      .map(([nome, relatorios]) => ({ nome, relatorios }))
      .sort((a, b) => b.relatorios - a.relatorios || a.nome.localeCompare(b.nome, "pt-BR"));
    const presentes = new Set(
      [...contagem.keys()].map((n) => gerenteAreaACanonico(n) ?? n.toUpperCase()),
    );
    const semRelatorios = GERENTES_AREA_A.filter((g) => !presentes.has(g));

    return {
      ok: true,
      iniciadoEm,
      finalizadoEm: new Date().toISOString(),
      postosVarridos,
      checklists: checklists.size,
      respostas: finais.length,
      porRealizador,
      semRelatorios,
      ...(falhasRespostas.length > 0 ? { falhas: falhasRespostas } : {}),
      ...(finais.length === 0 && falhasRespostas.length > 0
        ? { erro: `Sem respostas retornadas: ${falhasRespostas[0]}` }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      iniciadoEm,
      finalizadoEm: new Date().toISOString(),
      postosVarridos: 0,
      checklists: 0,
      respostas: 0,
      erro: error instanceof Error ? error.message : "Falha ao sincronizar visitas da NEXTI.",
    };
  }
}

export const syncNextiVisitas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dias?: number; completo?: boolean; inicio?: string; fim?: string } | undefined) =>
      input ?? {},
  )
  .handler(async ({ data, context }): Promise<NextiVisitasSyncResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bruta = await loadConfig((context as { supabase: unknown }).supabase);
    const config: NextiConfig = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
    return executarImportacaoVisitas(config, supabaseAdmin as never, data);
  });
