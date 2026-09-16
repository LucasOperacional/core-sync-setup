import { supabase } from "@/integrations/supabase/client";
import type { ParsedRow } from "@/lib/file-parsers";
import { GERENTES_AREA_A, ehGerenteAreaA, gerenteAreaACanonico } from "@/lib/gerentes-area-a";
import { buscarTudoPaginado } from "@/lib/supabase-paginacao";

export const FALTAS_HEADER = [
  "POSTO",
  "COLABORADOR",
  "CARGO",
  "AREA",
  "DATA INICIO",
  "DATA FIM",
  "FALTAS",
  "TIPO",
];

export const ATESTADOS_HEADER = [
  "COLABORADOR",
  "POSTO",
  "CARGO",
  "CID",
  "MEDICO",
  "DIAS",
  "DATA INICIO",
  "DATA FIM",
];

type AbsenceRow = {
  nexti_id: number;
  person_id: number | null;
  person_external_id: string | null;
  start_date_time: string | null;
  finish_date_time: string | null;
  note: string | null;
  medical_doctor_name: string | null;
  cid_code: string | null;
  cid_description: string | null;
  removed: boolean | null;
};

type PersonRow = {
  nexti_id: number;
  nome: string | null;
  matricula: string | null;
  workplace_id: number | null;
  workplace_name: string | null;
  career_name: string | null;
  situacao: string | null;
  demission_date: string | null;
};

function dataBr(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function diasEntre(inicio: string | null, fim: string | null): number {
  if (!inicio) return 0;
  const a = new Date(inicio);
  const b = fim ? new Date(fim) : a;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : 1;
}

function ehAtestado(row: AbsenceRow): boolean {
  const texto = `${row.note ?? ""} ${row.cid_description ?? ""}`.toLowerCase();
  return (
    Boolean(row.cid_code || row.medical_doctor_name) ||
    /atestado|licen[çc]a m[ée]dica|afastamento m[ée]dico/.test(texto)
  );
}

/**
 * Tipo da ausência conforme a NEXTI grava a observação:
 * "Falta injustificada - FALTA", "ferias - FÉRIAS", "ABONADO PELO CLIENTE - ABONO"...
 */
export function tipoAusenciaNexti(note: string | null): string {
  const bruto = (note ?? "").trim();
  if (!bruto) return "NÃO INFORMADO";
  const partes = bruto.split(" - ");
  const sufixo = (partes.length > 1 ? partes[partes.length - 1] : bruto)?.trim() ?? "";
  const texto = (sufixo || bruto).toUpperCase();
  if (/ATESTADO|LICEN/.test(texto)) return "ATESTADO";
  if (/F[ÉE]RIAS/.test(texto)) return "FÉRIAS";
  if (/DEMISS/.test(texto)) return "DEMISSÃO";
  if (/TROCA/.test(texto)) return "TROCA DE PLANTÃO";
  if (/ABONO|ABONAD/.test(texto)) return "ABONO";
  if (/SUSPENS/.test(texto)) return "SUSPENSÃO";
  if (/FOLGA/.test(texto)) return "FOLGA";
  if (/FALTA/.test(texto)) return "FALTA";
  return texto.slice(0, 40);
}

/** Ausências que contam como falta no dashboard (exclui férias, folga, troca, demissão). */
function contaComoFalta(row: AbsenceRow): boolean {
  if (ehAtestado(row)) return false;
  const tipo = tipoAusenciaNexti(row.note);
  return tipo === "FALTA" || tipo === "ABONO" || tipo === "SUSPENSÃO";
}

/** Mapa posto (workplace_id) -> gerente de área, conforme relatórios de supervisão. */
let cacheGerentesPorPosto: Map<number, string> | null = null;

async function mapaGerentePorPosto(): Promise<Map<number, string>> {
  if (cacheGerentesPorPosto) return cacheGerentesPorPosto;
  const mapa = new Map<number, string>();
  try {
    const { data } = await supabase
      .from("nexti_checklist_answers")
      .select("workplace_id, supervisor_nome")
      .not("workplace_id", "is", null)
      .limit(5000);
    for (const linha of data ?? []) {
      const id = Number(linha.workplace_id);
      if (!Number.isFinite(id) || mapa.has(id)) continue;
      const canonico = gerenteAreaACanonico(linha.supervisor_nome ?? "");
      if (canonico) mapa.set(id, canonico);
    }
  } catch {
    /* sem relatórios de supervisão: dashboard segue sem coluna de área */
  }
  cacheGerentesPorPosto = mapa;
  return mapa;
}

async function carregarBase(): Promise<{
  absences: AbsenceRow[];
  pessoas: Map<number, PersonRow>;
}> {
  const [absencesBrutas, pessoasLista] = await Promise.all([
    buscarTudoPaginado<AbsenceRow>((inicio, fim) =>
      supabase
        .from("nexti_absences")
        .select(
          "nexti_id, person_id, person_external_id, start_date_time, finish_date_time, note, medical_doctor_name, cid_code, cid_description, removed",
        )
        .order("start_date_time", { ascending: false })
        .range(inicio, fim),
    ),
    buscarTudoPaginado<PersonRow>((inicio, fim) =>
      supabase
        .from("nexti_persons")
        .select(
          "nexti_id, nome, matricula, workplace_id, workplace_name, career_name, situacao, demission_date",
        )
        .range(inicio, fim),
    ),
  ]);

  const absences = absencesBrutas.filter((a) => a.removed !== true);
  const pessoas = new Map<number, PersonRow>();
  for (const p of pessoasLista) pessoas.set(p.nexti_id, p);
  return { absences, pessoas };
}

/** Linhas no formato do dashboard de FALTAS (ausências sem caráter médico). */
export async function carregarFaltasNexti(): Promise<ParsedRow[]> {
  const [{ absences, pessoas }, gerentesPorPosto] = await Promise.all([
    carregarBase(),
    mapaGerentePorPosto(),
  ]);
  const linhas = absences
    .filter(contaComoFalta)
    .map((a) => {
      const pessoa = a.person_id !== null ? pessoas.get(a.person_id) : undefined;
      const postoId = pessoa?.workplace_id ?? null;
      const gerente = postoId !== null ? (gerentesPorPosto.get(Number(postoId)) ?? "") : "";
      return [
        pessoa?.workplace_name ?? "",
        pessoa?.nome ?? a.person_external_id ?? "",
        pessoa?.career_name ?? "",
        gerente,
        dataBr(a.start_date_time),
        dataBr(a.finish_date_time),
        String(diasEntre(a.start_date_time, a.finish_date_time)),
        tipoAusenciaNexti(a.note),
      ];
    })
    .filter((linha) => (linha[1] ?? "") !== "" || (linha[0] ?? "") !== "");

  return linhas.length > 0 ? [FALTAS_HEADER, ...linhas] : [];
}

/** Linhas no formato do dashboard de ATESTADOS (ausências médicas). */
export async function carregarAtestadosNexti(): Promise<ParsedRow[]> {
  const { absences, pessoas } = await carregarBase();
  const linhas = absences
    .filter(ehAtestado)
    .map((a) => {
      const pessoa = a.person_id !== null ? pessoas.get(a.person_id) : undefined;
      return [
        pessoa?.nome ?? a.person_external_id ?? "",
        pessoa?.workplace_name ?? "",
        pessoa?.career_name ?? "",
        a.cid_code ?? a.cid_description ?? "",
        a.medical_doctor_name ?? "",
        String(diasEntre(a.start_date_time, a.finish_date_time)),
        dataBr(a.start_date_time),
        dataBr(a.finish_date_time),
      ];
    })
    .filter((linha) => linha.some((celula) => celula !== ""));

  return linhas.length > 0 ? [ATESTADOS_HEADER, ...linhas] : [];
}

export type NextiFiltro = {
  /** ID da empresa cadastrada na NEXTI (company_id). */
  empresaId?: number | null;
  /** Nome do gerente de área responsável (usa os relatórios de supervisão). */
  gerente?: string | null;
};

export type EmpresaNexti = { id: number; nome: string };

/** Lista todas as empresas cadastradas na NEXTI (com fallback nos postos sincronizados). */
export async function listarEmpresasNexti(): Promise<EmpresaNexti[]> {
  const { data: companies } = await supabase
    .from("nexti_companies")
    .select("nexti_id, company_name, fantasy_name")
    .order("company_name");

  const mapa = new Map<number, string>();
  for (const c of companies ?? []) {
    const nome = c.fantasy_name || c.company_name || `Empresa ${c.nexti_id}`;
    mapa.set(Number(c.nexti_id), nome);
  }

  const { data: postos } = await supabase
    .from("nexti_workplaces")
    .select("company_id, company_name")
    .not("company_id", "is", null);
  for (const p of postos ?? []) {
    const id = Number(p.company_id);
    if (!Number.isFinite(id)) continue;
    if (!mapa.has(id)) mapa.set(id, p.company_name || `Empresa ${id}`);
  }

  return [...mapa.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const nomeGerentePermitido = (nome: string): boolean => ehGerenteAreaA(nome);

/** Gerentes de área ativos na NEXTI (sem data de demissão) e dentro da lista permitida. */
export async function listarGerentesArea(): Promise<string[]> {
  const { data: gerentes } = await supabase.from("gerentes").select("nome, cargo").order("nome");

  const gerentesFiltrados = (gerentes ?? []).filter(
    (g) => (g.cargo ?? "").toUpperCase().includes("GERENTE") && nomeGerentePermitido(g.nome),
  );
  const nomes = gerentesFiltrados.map((g) => g.nome);
  if (nomes.length === 0) return [];

  const { data: pessoas } = await supabase
    .from("nexti_persons")
    .select("nome, demission_date")
    .in("nome", nomes)
    .is("demission_date", null);

  const ativos = new Set((pessoas ?? []).map((p) => p.nome));

  const canonicos = new Set(
    gerentesFiltrados
      .filter((g) => ativos.has(g.nome))
      .map((g) => gerenteAreaACanonico(g.nome))
      .filter((n): n is string => Boolean(n)),
  );

  const lista = GERENTES_AREA_A.filter((n) => canonicos.has(n));
  return lista.length > 0 ? lista : [...GERENTES_AREA_A];
}

/** Postos supervisionados pelo gerente informado, conforme relatórios de visita. */
async function postosDoGerente(gerente: string): Promise<number[]> {
  const canonico = gerenteAreaACanonico(gerente);
  const { data } = await supabase
    .from("nexti_checklist_answers")
    .select("workplace_id,supervisor_nome")
    .not("workplace_id", "is", null)
    .limit(5000);
  return [
    ...new Set(
      (data ?? [])
        .filter((r) => gerenteAreaACanonico(r.supervisor_nome ?? "") === (canonico ?? gerente))
        .map((r) => Number(r.workplace_id))
        .filter(Number.isFinite),
    ),
  ];
}

export type NextiControlResumo = {
  pessoasAtivas: number;
  marcacoesHoje: number;
  ausenciasAbertas: number;
  atestadosMes: number;
  postos: number;
  ultimaSincronizacao: string | null;
};

/** Indicadores operacionais da Nexti, opcionalmente filtrados por empresa e gerente de área. */
export async function carregarResumoControlNexti(
  filtro: NextiFiltro = {},
): Promise<NextiControlResumo> {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  const agora = new Date().toISOString();

  const empresaId = filtro.empresaId ?? null;
  const gerente = filtro.gerente?.trim() || null;
  const filtrando = empresaId !== null || gerente !== null;

  // Postos considerados quando existe algum filtro ativo.
  let workplaceIds: number[] | null = null;
  if (filtrando) {
    let q = supabase.from("nexti_workplaces").select("nexti_id").limit(2000);
    if (empresaId !== null) q = q.eq("company_id", empresaId);
    const { data } = await q;
    workplaceIds = (data ?? []).map((w) => Number(w.nexti_id));
    if (gerente) {
      const doGerente = new Set(await postosDoGerente(gerente));
      workplaceIds = workplaceIds.filter((id) => doGerente.has(id));
    }
  }

  // Pessoas dentro do escopo filtrado.
  let personIds: number[] | null = null;
  if (filtrando) {
    let q = supabase
      .from("nexti_persons")
      .select("nexti_id")
      .is("demission_date", null)
      .limit(5000);
    if (empresaId !== null) q = q.eq("company_id", empresaId);
    if (workplaceIds && gerente)
      q = q.in("workplace_id", workplaceIds.length > 0 ? workplaceIds : [-1]);
    const { data } = await q;
    personIds = (data ?? []).map((p) => Number(p.nexti_id));
  }

  const vazio = filtrando && (personIds?.length ?? 0) === 0;

  let pessoasQ = supabase
    .from("nexti_persons")
    .select("nexti_id", { count: "exact", head: true })
    .is("demission_date", null);
  if (empresaId !== null) pessoasQ = pessoasQ.eq("company_id", empresaId);
  if (workplaceIds && gerente)
    pessoasQ = pessoasQ.in("workplace_id", workplaceIds.length > 0 ? workplaceIds : [-1]);

  let marcacoesQ = supabase
    .from("nexti_clockings")
    .select("nexti_id", { count: "exact", head: true })
    .gte("clocking_date", inicioHoje);
  if (workplaceIds)
    marcacoesQ = marcacoesQ.in("workplace_id", workplaceIds.length > 0 ? workplaceIds : [-1]);

  let ausenciasQ = supabase
    .from("nexti_absences")
    .select("nexti_id", { count: "exact", head: true })
    .lte("start_date_time", agora)
    .or(`finish_date_time.is.null,finish_date_time.gte.${agora}`);
  let atestadosQ = supabase
    .from("nexti_absences")
    .select("nexti_id", { count: "exact", head: true })
    .gte("start_date_time", inicioMes)
    .not("cid_code", "is", null);
  if (personIds) {
    const escopo = personIds.length > 0 ? personIds : [-1];
    ausenciasQ = ausenciasQ.in("person_id", escopo);
    atestadosQ = atestadosQ.in("person_id", escopo);
  }

  let postosQ = supabase
    .from("nexti_workplaces")
    .select("nexti_id", { count: "exact", head: true });
  if (empresaId !== null) postosQ = postosQ.eq("company_id", empresaId);
  if (workplaceIds && gerente)
    postosQ = postosQ.in("nexti_id", workplaceIds.length > 0 ? workplaceIds : [-1]);

  const [pessoas, marcacoes, ausencias, atestados, postos, run] = await Promise.all([
    pessoasQ,
    marcacoesQ,
    vazio ? Promise.resolve({ count: 0 }) : ausenciasQ,
    vazio ? Promise.resolve({ count: 0 }) : atestadosQ,
    postosQ,
    supabase
      .from("nexti_sync_runs")
      .select("finalizado_em, iniciado_em")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ultimo =
    (run.data as { finalizado_em?: string | null; iniciado_em?: string | null } | null) ?? null;

  return {
    pessoasAtivas: pessoas.count ?? 0,
    marcacoesHoje: marcacoes.count ?? 0,
    ausenciasAbertas: ausencias.count ?? 0,
    atestadosMes: atestados.count ?? 0,
    postos: postos.count ?? 0,
    ultimaSincronizacao: ultimo?.finalizado_em ?? ultimo?.iniciado_em ?? null,
  };
}

export type InconsistenciaPonto = {
  personId: number;
  nome: string;
  posto: string;
  diasSemMarcacao: number;
  diasComMarcacao: number;
};

export type AtividadeGerente = {
  /** Relatórios do NEXTI Control 2.0 feitos pelo gerente. */
  controlsFeitos: number;
  /** Ausências/faltas lançadas nos postos do gerente. */
  faltasLancadas: number;
  /** Postos sob responsabilidade do gerente. */
  postos: number;
  colaboradores: number;
  diasAnalisados: number;
  marcacoesRealizadas: number;
  /** Marcações esperadas (colaboradores x dias analisados). */
  marcacoesEsperadas: number;
  marcacoesFaltantes: number;
  ranking: InconsistenciaPonto[];
};

const DIAS_ANALISE = 30;

/**
 * Atividades de um Gerente de Área A na NEXTI: relatórios do Control, faltas
 * lançadas nos seus postos, marcações de ponto e ranking de inconsistências
 * (colaboradores que deixaram de registrar ponto).
 */
export async function carregarAtividadeGerente(
  filtro: NextiFiltro = {},
): Promise<AtividadeGerente> {
  const gerente = filtro.gerente?.trim() || null;
  const empresaId = filtro.empresaId ?? null;
  const canonico = gerente ? (gerenteAreaACanonico(gerente) ?? gerente) : null;

  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_ANALISE);
  const desdeIso = desde.toISOString();
  const desdeDia = desdeIso.slice(0, 10);

  const vazio: AtividadeGerente = {
    controlsFeitos: 0,
    faltasLancadas: 0,
    postos: 0,
    colaboradores: 0,
    diasAnalisados: DIAS_ANALISE,
    marcacoesRealizadas: 0,
    marcacoesEsperadas: 0,
    marcacoesFaltantes: 0,
    ranking: [],
  };
  if (!canonico) return vazio;

  // Relatórios do Control feitos pelo gerente + postos visitados por ele.
  const { data: respostas } = await supabase
    .from("nexti_checklist_answers")
    .select("nexti_id, supervisor_nome, workplace_id, answer_date")
    .gte("answer_date", desdeIso)
    .limit(5000);

  const minhas = (respostas ?? []).filter(
    (r) => gerenteAreaACanonico(r.supervisor_nome ?? "") === canonico,
  );
  const postosGerente = new Set(minhas.map((r) => Number(r.workplace_id)).filter(Number.isFinite));

  // Postos válidos (respeitando o filtro de empresa).
  let postosQ = supabase.from("nexti_workplaces").select("nexti_id, name, company_id").limit(2000);
  if (empresaId !== null) postosQ = postosQ.eq("company_id", empresaId);
  const { data: postosData } = await postosQ;
  const postosValidos = (postosData ?? []).filter((p) => postosGerente.has(Number(p.nexti_id)));
  const nomePosto = new Map(postosValidos.map((p) => [Number(p.nexti_id), p.name ?? ""]));
  const idsPostos = [...nomePosto.keys()];
  if (idsPostos.length === 0) return { ...vazio, controlsFeitos: minhas.length };

  // Colaboradores ativos nos postos do gerente.
  const { data: pessoas } = await supabase
    .from("nexti_persons")
    .select("nexti_id, nome, workplace_id, workplace_name")
    .is("demission_date", null)
    .in("workplace_id", idsPostos)
    .limit(5000);
  const listaPessoas = pessoas ?? [];
  const idsPessoas = listaPessoas.map((p) => Number(p.nexti_id)).filter(Number.isFinite);

  const [faltas, marcacoes] = await Promise.all([
    idsPessoas.length > 0
      ? supabase
          .from("nexti_absences")
          .select("nexti_id", { count: "exact", head: true })
          .gte("start_date_time", desdeIso)
          .in("person_id", idsPessoas)
      : Promise.resolve({ count: 0 }),
    idsPessoas.length > 0
      ? supabase
          .from("nexti_clockings")
          .select("person_id, reference_date")
          .gte("reference_date", desdeDia)
          .in("person_id", idsPessoas)
          .limit(20000)
      : Promise.resolve({
          data: [] as Array<{ person_id: number | null; reference_date: string | null }>,
        }),
  ]);

  const registros = ("data" in marcacoes ? marcacoes.data : []) ?? [];
  const diasPorPessoa = new Map<number, Set<string>>();
  for (const m of registros) {
    const id = Number(m.person_id);
    if (!Number.isFinite(id) || !m.reference_date) continue;
    const set = diasPorPessoa.get(id) ?? new Set<string>();
    set.add(String(m.reference_date));
    diasPorPessoa.set(id, set);
  }

  const ranking: InconsistenciaPonto[] = listaPessoas
    .map((p) => {
      const id = Number(p.nexti_id);
      const comMarcacao = diasPorPessoa.get(id)?.size ?? 0;
      return {
        personId: id,
        nome: p.nome ?? `Colaborador ${id}`,
        posto: p.workplace_name ?? nomePosto.get(Number(p.workplace_id)) ?? "",
        diasComMarcacao: comMarcacao,
        diasSemMarcacao: Math.max(0, DIAS_ANALISE - comMarcacao),
      };
    })
    .filter((r) => r.diasSemMarcacao > 0)
    .sort((a, b) => b.diasSemMarcacao - a.diasSemMarcacao)
    .slice(0, 15);

  const marcacoesRealizadas = registros.length;
  const marcacoesEsperadas = listaPessoas.length * DIAS_ANALISE;

  return {
    controlsFeitos: minhas.length,
    faltasLancadas: faltas.count ?? 0,
    postos: idsPostos.length,
    colaboradores: listaPessoas.length,
    diasAnalisados: DIAS_ANALISE,
    marcacoesRealizadas,
    marcacoesEsperadas,
    marcacoesFaltantes: Math.max(0, marcacoesEsperadas - marcacoesRealizadas),
    ranking,
  };
}

/** Assina em tempo real as tabelas alimentadas pela Nexti. */
export function assinarNextiRealtime(onChange: () => void): () => void {
  const canal = supabase.channel(`nexti-dashboards-${Math.random().toString(36).slice(2)}`);
  for (const table of [
    "nexti_absences",
    "nexti_persons",
    "nexti_clockings",
    "nexti_documents",
    "nexti_sync_runs",
  ]) {
    canal.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange());
  }
  void canal.subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
