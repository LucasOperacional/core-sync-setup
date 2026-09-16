import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Empresa do NXS CONTROL visível para o usuário logado. */
export type NxsEmpresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  papel: string | null;
};

export type NxsPosicao = {
  id: string;
  device_id: string | null;
  employee_id: string | null;
  latitude: number;
  longitude: number;
  velocidade: number | null;
  bateria: number | null;
  registrado_em: string;
  nome: string;
  funcao: string;
  dispositivo: string;
  online: boolean;
};

export type NxsAlerta = {
  id: string;
  codigo: string;
  tipo: string;
  prioridade: string;
  status: string;
  descricao: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
};

export type NxsPainel = {
  ok: boolean;
  erro?: string;
  indicadores: {
    pessoasMonitoradas: number;
    pessoasOnline: number;
    pessoasOffline: number;
    veiculosAtivos: number;
    dispositivos: number;
    semComunicacao: number;
    bateriaBaixa: number;
    alertasAbertos: number;
    emergenciasAtivas: number;
  };
  posicoes: NxsPosicao[];
  alertas: NxsAlerta[];
};

const LIMITE_ONLINE_MS = 5 * 60 * 1000;
const LIMITE_SEM_COMUNICACAO_MS = 30 * 60 * 1000;

/** Empresas do NXS CONTROL que o usuário pode acessar. */
export const nxsEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NxsEmpresa[]> => {
    const { supabase, userId } = context;

    const { data: empresas, error } = await supabase
      .from("nxs_companies")
      .select("id, nome, cnpj, ativo")
      .order("nome", { ascending: true });
    if (error || !empresas) return [];

    const { data: membros } = await supabase
      .from("nxs_company_members")
      .select("company_id, papel")
      .eq("user_id", userId);

    const papeis = new Map((membros ?? []).map((m) => [m.company_id, m.papel]));
    return empresas.map((e) => ({ ...e, papel: papeis.get(e.id) ?? null }));
  });

/** Cria uma empresa e vincula o criador como administrador dela. */
export const nxsCriarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nome: string; cnpj?: string }) =>
    z
      .object({ nome: z.string().trim().min(2), cnpj: z.string().trim().optional().default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: empresa, error } = await supabase
      .from("nxs_companies")
      .insert({ nome: data.nome, cnpj: data.cnpj || null, created_by: userId })
      .select("id")
      .single();
    if (error || !empresa) {
      return { ok: false as const, erro: error?.message ?? "Não foi possível criar a empresa." };
    }
    await supabase.from("nxs_company_members").insert({
      company_id: empresa.id,
      user_id: userId,
      papel: "admin_empresa",
      created_by: userId,
    });
    return { ok: true as const, id: empresa.id };
  });

/** Indicadores, posições mais recentes e alertas da torre de controle. */
export const nxsPainel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<NxsPainel> => {
    const { supabase } = context;
    const vazio: NxsPainel["indicadores"] = {
      pessoasMonitoradas: 0,
      pessoasOnline: 0,
      pessoasOffline: 0,
      veiculosAtivos: 0,
      dispositivos: 0,
      semComunicacao: 0,
      bateriaBaixa: 0,
      alertasAbertos: 0,
      emergenciasAtivas: 0,
    };

    const [colabs, veics, devs, alerts, posics] = await Promise.all([
      supabase
        .from("nxs_employees")
        .select("id, nome, funcao, cargo, status, rastreamento_permitido")
        .eq("company_id", data.companyId),
      supabase.from("nxs_vehicles").select("id, ativo").eq("company_id", data.companyId),
      supabase
        .from("nxs_devices")
        .select("id, codigo, employee_id, bateria, ultima_comunicacao, status")
        .eq("company_id", data.companyId),
      supabase
        .from("nxs_alerts")
        .select("id, codigo, tipo, prioridade, status, descricao, created_at, latitude, longitude")
        .eq("company_id", data.companyId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("nxs_location_events")
        .select(
          "id, device_id, employee_id, latitude, longitude, velocidade, bateria, registrado_em",
        )
        .eq("company_id", data.companyId)
        .order("registrado_em", { ascending: false })
        .limit(500),
    ]);

    if (colabs.error) {
      return {
        ok: false,
        erro: colabs.error.message,
        indicadores: vazio,
        posicoes: [],
        alertas: [],
      };
    }

    const agora = Date.now();
    const colaboradores = colabs.data ?? [];
    const dispositivos = devs.data ?? [];
    const alertas = (alerts.data ?? []) as NxsAlerta[];

    const dispositivoOnline = (ultima: string | null) =>
      ultima !== null && agora - new Date(ultima).getTime() <= LIMITE_ONLINE_MS;

    const porColaborador = new Map(colaboradores.map((c) => [c.id, c]));
    const porDispositivo = new Map(dispositivos.map((d) => [d.id, d]));

    const colaboradoresOnline = new Set(
      dispositivos
        .filter((d) => d.employee_id && dispositivoOnline(d.ultima_comunicacao))
        .map((d) => d.employee_id as string),
    );

    const monitorados = colaboradores.filter(
      (c) => c.rastreamento_permitido && c.status === "ativo",
    );

    // Última posição conhecida por dispositivo
    const vistos = new Set<string>();
    const posicoes: NxsPosicao[] = [];
    for (const p of posics.data ?? []) {
      const chave = p.device_id ?? p.employee_id ?? p.id;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const colaborador = p.employee_id ? porColaborador.get(p.employee_id) : undefined;
      const dispositivo = p.device_id ? porDispositivo.get(p.device_id) : undefined;
      posicoes.push({
        id: p.id,
        device_id: p.device_id,
        employee_id: p.employee_id,
        latitude: p.latitude,
        longitude: p.longitude,
        velocidade: p.velocidade,
        bateria: p.bateria,
        registrado_em: p.registrado_em,
        nome: colaborador?.nome ?? dispositivo?.codigo ?? "Sem identificação",
        funcao: colaborador?.funcao ?? "equipamento",
        dispositivo: dispositivo?.codigo ?? "—",
        online: agora - new Date(p.registrado_em).getTime() <= LIMITE_ONLINE_MS,
      });
    }

    return {
      ok: true,
      indicadores: {
        pessoasMonitoradas: monitorados.length,
        pessoasOnline: colaboradoresOnline.size,
        pessoasOffline: Math.max(monitorados.length - colaboradoresOnline.size, 0),
        veiculosAtivos: (veics.data ?? []).filter((v) => v.ativo).length,
        dispositivos: dispositivos.length,
        semComunicacao: dispositivos.filter(
          (d) =>
            d.ultima_comunicacao === null ||
            agora - new Date(d.ultima_comunicacao).getTime() > LIMITE_SEM_COMUNICACAO_MS,
        ).length,
        bateriaBaixa: dispositivos.filter((d) => typeof d.bateria === "number" && d.bateria <= 20)
          .length,
        alertasAbertos: alertas.filter((a) =>
          ["novo", "reconhecido", "em_atendimento"].includes(a.status),
        ).length,
        emergenciasAtivas: alertas.filter(
          (a) =>
            a.tipo === "panico" && ["novo", "reconhecido", "em_atendimento"].includes(a.status),
        ).length,
      },
      posicoes,
      alertas,
    };
  });

export type NxsColaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  telefone: string | null;
  email: string | null;
  unidade: string | null;
  departamento: string | null;
  cargo: string | null;
  funcao: string;
  status: string;
  rastreamento_permitido: boolean;
  data_admissao: string | null;
};

/** Lista os colaboradores monitorados de uma empresa. */
export const nxsColaboradores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("nxs_employees")
      .select(
        "id, nome, cpf, matricula, telefone, email, unidade, departamento, cargo, funcao, status, rastreamento_permitido, data_admissao",
      )
      .eq("company_id", data.companyId)
      .order("nome", { ascending: true })
      .limit(500);
    return {
      ok: !error,
      erro: error?.message ?? "",
      colaboradores: (linhas ?? []) as NxsColaborador[],
    };
  });

const colaboradorSchema = z.object({
  companyId: z.string().uuid(),
  nome: z.string().trim().min(3),
  cpf: z.string().trim().optional().default(""),
  matricula: z.string().trim().optional().default(""),
  telefone: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  unidade: z.string().trim().optional().default(""),
  departamento: z.string().trim().optional().default(""),
  cargo: z.string().trim().optional().default(""),
  funcao: z.enum(["colaborador", "supervisor", "vigilante", "motorista"]).default("colaborador"),
  rastreamentoPermitido: z.boolean().default(false),
});

/** Cadastra um colaborador monitorado. */
export const nxsCriarColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => colaboradorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nxs_employees").insert({
      company_id: data.companyId,
      nome: data.nome,
      cpf: data.cpf || null,
      matricula: data.matricula || null,
      telefone: data.telefone || null,
      email: data.email || null,
      unidade: data.unidade || null,
      departamento: data.departamento || null,
      cargo: data.cargo || null,
      funcao: data.funcao,
      rastreamento_permitido: data.rastreamentoPermitido,
      created_by: context.userId,
    });
    return { ok: !error, erro: error?.message ?? "" };
  });

export type NxsDispositivo = {
  id: string;
  codigo: string;
  tipo: string;
  modelo: string | null;
  imei: string | null;
  bateria: number | null;
  ultima_comunicacao: string | null;
  status: string;
  employee_id: string | null;
  ingest_token: string;
};

/** Lista os dispositivos/rastreadores de uma empresa. */
export const nxsDispositivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("nxs_devices")
      .select(
        "id, codigo, tipo, modelo, imei, bateria, ultima_comunicacao, status, employee_id, ingest_token",
      )
      .eq("company_id", data.companyId)
      .order("codigo", { ascending: true })
      .limit(500);
    return {
      ok: !error,
      erro: error?.message ?? "",
      dispositivos: (linhas ?? []) as NxsDispositivo[],
    };
  });

const dispositivoSchema = z.object({
  companyId: z.string().uuid(),
  codigo: z.string().trim().min(2),
  tipo: z.enum(["celular", "gps", "rastreador_veicular", "tag", "beacon"]).default("celular"),
  modelo: z.string().trim().optional().default(""),
  imei: z.string().trim().optional().default(""),
  employeeId: z.string().uuid().nullable().optional().default(null),
});

/** Cadastra um dispositivo e gera a chave de envio de posições. */
export const nxsCriarDispositivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dispositivoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nxs_devices").insert({
      company_id: data.companyId,
      codigo: data.codigo,
      tipo: data.tipo,
      modelo: data.modelo || null,
      imei: data.imei || null,
      employee_id: data.employeeId ?? null,
      created_by: context.userId,
    });
    return { ok: !error, erro: error?.message ?? "" };
  });

/** Abre uma ocorrência/alerta manual na central. */
export const nxsAbrirAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        tipo: z.string().trim().min(2),
        prioridade: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
        descricao: z.string().trim().optional().default(""),
        employeeId: z.string().uuid().nullable().optional().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nxs_alerts").insert({
      company_id: data.companyId,
      tipo: data.tipo,
      prioridade: data.prioridade,
      descricao: data.descricao || null,
      employee_id: data.employeeId ?? null,
      created_by: context.userId,
    });
    return { ok: !error, erro: error?.message ?? "" };
  });

/** Atualiza a situação de um alerta. */
export const nxsAtualizarAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "novo",
          "reconhecido",
          "em_atendimento",
          "resolvido",
          "falso_positivo",
          "cancelado",
        ]),
        motivo: z.string().trim().optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const encerrado = ["resolvido", "falso_positivo", "cancelado"].includes(data.status);
    const { error } = await context.supabase
      .from("nxs_alerts")
      .update({
        status: data.status,
        responsavel_id: context.userId,
        motivo_encerramento: encerrado ? data.motivo || null : null,
        encerrado_em: encerrado ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    return { ok: !error, erro: error?.message ?? "" };
  });
