import { supabase } from "@/integrations/supabase/client";

/** Fuso usado na exibição. Os horários são gravados em UTC pelo servidor. */
export const FUSO = "America/Sao_Paulo";

export type TipoMarcacao =
  | "entrada"
  | "intervalo_inicio"
  | "intervalo_fim"
  | "saida"
  | "saida_extraordinaria";

export const ROTULO_TIPO: Record<TipoMarcacao, string> = {
  entrada: "Entrada",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Fim do intervalo",
  saida: "Saída",
  saida_extraordinaria: "Saída extraordinária",
};

/** Sequência esperada das marcações do dia. */
export function proximaMarcacaoEsperada(tipos: TipoMarcacao[]): TipoMarcacao {
  const ultimo = tipos.at(-1);
  if (!ultimo) return "entrada";
  if (ultimo === "entrada") return "intervalo_inicio";
  if (ultimo === "intervalo_inicio") return "intervalo_fim";
  if (ultimo === "intervalo_fim") return "saida";
  return "entrada";
}

export type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  tolerancia_min: number;
  exige_geolocalizacao: boolean;
  exige_selfie: boolean;
  ativo: boolean;
};

export type Unidade = {
  id: string;
  company_id: string;
  nome: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
  ativo: boolean;
};

export type Funcionario = {
  id: string;
  company_id: string | null;
  unit_id: string | null;
  user_id: string | null;
  nome: string;
  matricula: string | null;
  cpf: string | null;
  cargo: string | null;
  supervisor_user_id: string | null;
  admissao: string | null;
  ativo: boolean;
};

export type Escala = {
  id: string;
  nome: string;
  tipo: string;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number;
  carga_diaria_min: number;
  carga_semanal_min: number;
  tolerancia_min: number;
  limite_extra_diario_min: number;
  noturno: boolean;
  banco_horas: boolean;
  dias_semana: number[];
  ativo: boolean;
};

export type VinculoEscala = {
  id: string;
  employee_id: string;
  schedule_id: string;
  inicio: string;
  fim: string | null;
};

export type Marcacao = {
  id: string;
  employee_id: string;
  company_id: string | null;
  unit_id: string | null;
  tipo: TipoMarcacao;
  registrado_em: string;
  dispositivo_em: string | null;
  data_ref: string;
  latitude: number | null;
  longitude: number | null;
  precisao_m: number | null;
  endereco: string | null;
  ip: string | null;
  user_agent: string | null;
  origem: string;
  status: string;
  distancia_m: number | null;
  comprovante: string;
  observacao: string | null;
};

export type PedidoAjuste = {
  id: string;
  employee_id: string;
  entry_id: string | null;
  data_ref: string;
  tipo: TipoMarcacao;
  horario_correto: string;
  motivo: string;
  anexo_path: string | null;
  status: "pendente" | "aprovada" | "rejeitada";
  decidido_por: string | null;
  decidido_em: string | null;
  justificativa_decisao: string | null;
  created_at: string;
};

export type Falta = {
  id: string;
  employee_id: string;
  data: string;
  tipo: string;
  justificada: boolean;
  motivo: string | null;
};

export type Feriado = { id: string; data: string; nome: string; abrangencia: string };

export type ResumoDia = {
  id: string;
  employee_id: string;
  data: string;
  previsto_min: number;
  trabalhado_min: number;
  intervalo_min: number;
  extra_min: number;
  atraso_min: number;
  saida_antecipada_min: number;
  noturno_min: number;
  saldo_min: number;
  situacao: string;
};

export type BancoHoras = {
  id: string;
  employee_id: string;
  data: string;
  minutos: number;
  origem: string;
  descricao: string | null;
};

export type Periodo = {
  id: string;
  company_id: string | null;
  inicio: string;
  fim: string;
  status: string;
  fechado_em: string | null;
};

export type Configuracoes = {
  id: string;
  organization_id: string;
  tolerancia_min: number;
  raio_padrao_m: number;
  exige_geolocalizacao: boolean;
  exige_selfie: boolean;
  limite_extra_diario_min: number;
  banco_horas: boolean;
  retencao_dias: number;
};

export type Auditoria = {
  id: string;
  user_id: string | null;
  acao: string;
  recurso: string;
  detalhes: unknown;
  created_at: string;
};

export type DadosPonto = {
  organizationId: string | null;
  configuracoes: Configuracoes | null;
  empresas: Empresa[];
  unidades: Unidade[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  vinculos: VinculoEscala[];
  marcacoes: Marcacao[];
  pedidos: PedidoAjuste[];
  faltas: Falta[];
  feriados: Feriado[];
  resumos: ResumoDia[];
  banco: BancoHoras[];
  periodos: Periodo[];
  auditoria: Auditoria[];
};

function dataLimite(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Carrega, em paralelo, tudo o que as telas do ponto usam. */
export async function carregarPonto(): Promise<DadosPonto> {
  const desde = dataLimite(90);

  const [
    org,
    cfg,
    empresas,
    unidades,
    funcionarios,
    escalas,
    vinculos,
    marcacoes,
    pedidos,
    faltas,
    feriados,
    resumos,
    banco,
    periodos,
    auditoria,
  ] = await Promise.all([
    supabase.from("pnt_organizations").select("id").limit(1).maybeSingle(),
    supabase
      .from("pnt_settings")
      .select(
        "id, organization_id, tolerancia_min, raio_padrao_m, exige_geolocalizacao, exige_selfie, limite_extra_diario_min, banco_horas, retencao_dias",
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pnt_companies")
      .select("id, nome, cnpj, tolerancia_min, exige_geolocalizacao, exige_selfie, ativo")
      .order("nome"),
    supabase
      .from("pnt_units")
      .select("id, company_id, nome, endereco, latitude, longitude, raio_metros, ativo")
      .order("nome"),
    supabase
      .from("pnt_employees")
      .select(
        "id, company_id, unit_id, user_id, nome, matricula, cpf, cargo, supervisor_user_id, admissao, ativo",
      )
      .order("nome"),
    supabase
      .from("pnt_work_schedules")
      .select(
        "id, nome, tipo, entrada, saida, intervalo_minutos, carga_diaria_min, carga_semanal_min, tolerancia_min, limite_extra_diario_min, noturno, banco_horas, dias_semana, ativo",
      )
      .order("nome"),
    supabase.from("pnt_schedule_assignments").select("id, employee_id, schedule_id, inicio, fim"),
    supabase
      .from("pnt_time_entries")
      .select(
        "id, employee_id, company_id, unit_id, tipo, registrado_em, dispositivo_em, data_ref, latitude, longitude, precisao_m, endereco, ip, user_agent, origem, status, distancia_m, comprovante, observacao",
      )
      .gte("data_ref", desde)
      .order("registrado_em", { ascending: false })
      .limit(3000),
    supabase
      .from("pnt_time_adjustment_requests")
      .select(
        "id, employee_id, entry_id, data_ref, tipo, horario_correto, motivo, anexo_path, status, decidido_por, decidido_em, justificativa_decisao, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("pnt_absences")
      .select("id, employee_id, data, tipo, justificada, motivo")
      .gte("data", desde)
      .order("data", { ascending: false }),
    supabase.from("pnt_holidays").select("id, data, nome, abrangencia").order("data"),
    supabase
      .from("pnt_daily_summaries")
      .select(
        "id, employee_id, data, previsto_min, trabalhado_min, intervalo_min, extra_min, atraso_min, saida_antecipada_min, noturno_min, saldo_min, situacao",
      )
      .gte("data", desde)
      .order("data", { ascending: false }),
    supabase
      .from("pnt_hour_bank_entries")
      .select("id, employee_id, data, minutos, origem, descricao")
      .gte("data", desde),
    supabase
      .from("pnt_payroll_periods")
      .select("id, company_id, inicio, fim, status, fechado_em")
      .order("inicio", { ascending: false }),
    supabase
      .from("pnt_audit_logs")
      .select("id, user_id, acao, recurso, detalhes, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return {
    organizationId: (org.data?.id as string | undefined) ?? null,
    configuracoes: (cfg.data as Configuracoes | null) ?? null,
    empresas: (empresas.data ?? []) as Empresa[],
    unidades: (unidades.data ?? []) as Unidade[],
    funcionarios: (funcionarios.data ?? []) as Funcionario[],
    escalas: (escalas.data ?? []) as Escala[],
    vinculos: (vinculos.data ?? []) as VinculoEscala[],
    marcacoes: (marcacoes.data ?? []) as Marcacao[],
    pedidos: (pedidos.data ?? []) as PedidoAjuste[],
    faltas: (faltas.data ?? []) as Falta[],
    feriados: (feriados.data ?? []) as Feriado[],
    resumos: (resumos.data ?? []) as ResumoDia[],
    banco: (banco.data ?? []) as BancoHoras[],
    periodos: (periodos.data ?? []) as Periodo[],
    auditoria: (auditoria.data ?? []) as Auditoria[],
  };
}

/** Data de hoje no fuso de Brasília (formato AAAA-MM-DD). */
export function hojeLocal(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return partes;
}

export function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function dataHoraLocal(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function dataBr(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** Converte minutos em texto "8h30" (aceita negativos). */
export function minutosParaTexto(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${h}h${String(m).padStart(2, "0")}`;
}

/** Fila de marcações feitas sem internet, guardada no próprio aparelho. */
const CHAVE_OFFLINE = "nxs:ponto:pendentes";

export type MarcacaoPendente = {
  idempotencyKey: string;
  tipo: TipoMarcacao;
  dispositivoEm: string;
  latitude: number | null;
  longitude: number | null;
  precisao: number | null;
};

export function lerPendentes(): MarcacaoPendente[] {
  try {
    const bruto = localStorage.getItem(CHAVE_OFFLINE);
    return bruto ? (JSON.parse(bruto) as MarcacaoPendente[]) : [];
  } catch {
    return [];
  }
}

export function salvarPendentes(lista: MarcacaoPendente[]) {
  try {
    localStorage.setItem(CHAVE_OFFLINE, JSON.stringify(lista));
  } catch {
    // Sem armazenamento local o registro segue apenas online.
  }
}

export function gerarChave(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
