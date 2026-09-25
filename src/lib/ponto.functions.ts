import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TipoMarcacaoServidor =
  | "entrada"
  | "intervalo_inicio"
  | "intervalo_fim"
  | "saida"
  | "saida_extraordinaria";

const TIPOS: TipoMarcacaoServidor[] = [
  "entrada",
  "intervalo_inicio",
  "intervalo_fim",
  "saida",
  "saida_extraordinaria",
];

const FUSO = "America/Sao_Paulo";

function dataLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Sequência permitida: a marcação seguinte depende da última do dia. */
function sequenciaValida(anteriores: TipoMarcacaoServidor[], novo: TipoMarcacaoServidor): string | null {
  if (novo === "saida_extraordinaria") {
    return anteriores.length === 0 ? "Registre a entrada antes de uma saída extraordinária." : null;
  }
  const ultimo = anteriores.filter((t) => t !== "saida_extraordinaria").at(-1);
  if (!ultimo) return novo === "entrada" ? null : "A primeira marcação do dia deve ser a entrada.";
  const permitido: Record<string, TipoMarcacaoServidor[]> = {
    entrada: ["intervalo_inicio", "saida"],
    intervalo_inicio: ["intervalo_fim"],
    intervalo_fim: ["saida", "intervalo_inicio"],
    saida: ["entrada"],
  };
  return (permitido[ultimo] ?? []).includes(novo)
    ? null
    : `Depois de "${ultimo}" não é possível registrar "${novo}".`;
}

type Ctx = { supabase: ReturnType<typeof criarTipo>; userId: string };
// Tipagem auxiliar: o middleware já entrega o client autenticado.
function criarTipo() {
  return null as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (n: string, p?: unknown) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

async function organizacao(sb: Ctx["supabase"]): Promise<string> {
  const { data } = await sb.from("pnt_organizations").select("id").limit(1).maybeSingle();
  if (!data?.id) throw new Error("Organização do ponto não configurada.");
  return data.id as string;
}

async function funcionarioDoUsuario(sb: Ctx["supabase"], userId: string) {
  const { data } = await sb
    .from("pnt_employees")
    .select("id, organization_id, company_id, unit_id, nome, ativo")
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | {
        id: string;
        organization_id: string;
        company_id: string | null;
        unit_id: string | null;
        nome: string;
        ativo: boolean;
      }
    | null;
}

export type ResultadoMarcacao = {
  ok: true;
  comprovante: string;
  registradoEm: string;
  tipo: TipoMarcacaoServidor;
  status: string;
  distanciaMetros: number | null;
  duplicado: boolean;
};

/** Registra a marcação usando sempre o horário do servidor. */
export const registrarMarcacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tipo: TipoMarcacaoServidor;
      idempotencyKey: string;
      latitude?: number | null;
      longitude?: number | null;
      precisao?: number | null;
      dispositivoEm?: string | null;
      origem?: "online" | "offline";
      observacao?: string | null;
    }) => {
      if (!TIPOS.includes(input.tipo)) throw new Error("Tipo de marcação inválido.");
      if (!input.idempotencyKey) throw new Error("Chave de registro ausente.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<ResultadoMarcacao> => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const userId = context.userId as string;

    const funcionario = await funcionarioDoUsuario(sb, userId);
    if (!funcionario) {
      throw new Error(
        "Seu acesso ainda não está vinculado a um funcionário do ponto. Fale com o RH.",
      );
    }
    if (!funcionario.ativo) throw new Error("Funcionário inativo: registro não permitido.");

    const agora = new Date();
    const dataRef = dataLocal(agora);

    // Registro repetido (mesma chave) devolve o comprovante já existente.
    const { data: existente } = await sb
      .from("pnt_time_entries")
      .select("comprovante, registrado_em, tipo, status, distancia_m")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existente) {
      return {
        ok: true,
        comprovante: existente.comprovante,
        registradoEm: existente.registrado_em,
        tipo: existente.tipo,
        status: existente.status,
        distanciaMetros: existente.distancia_m ?? null,
        duplicado: true,
      };
    }

    const { data: doDia } = await sb
      .from("pnt_time_entries")
      .select("tipo, registrado_em")
      .eq("employee_id", funcionario.id)
      .eq("data_ref", dataRef)
      .order("registrado_em", { ascending: true });

    const anteriores = ((doDia ?? []) as { tipo: TipoMarcacaoServidor; registrado_em: string }[]);
    const ultimo = anteriores.at(-1);
    if (ultimo && ultimo.tipo === data.tipo) {
      const diff = agora.getTime() - new Date(ultimo.registrado_em).getTime();
      if (diff < 60_000) throw new Error("Essa marcação já foi registrada agora há pouco.");
    }
    const erroSequencia = sequenciaValida(
      anteriores.map((e) => e.tipo),
      data.tipo,
    );
    if (erroSequencia) throw new Error(erroSequencia);

    // Configurações e cerca da unidade
    const { data: cfg } = await sb
      .from("pnt_settings")
      .select("exige_geolocalizacao, raio_padrao_m")
      .limit(1)
      .maybeSingle();

    let distancia: number | null = null;
    let status: "valido" | "fora_area" | "pendente" = "valido";

    if (funcionario.unit_id && data.latitude != null && data.longitude != null) {
      const { data: unidade } = await sb
        .from("pnt_units")
        .select("latitude, longitude, raio_metros")
        .eq("id", funcionario.unit_id)
        .maybeSingle();
      if (unidade?.latitude != null && unidade?.longitude != null) {
        distancia = distanciaMetros(
          data.latitude,
          data.longitude,
          unidade.latitude,
          unidade.longitude,
        );
        const raio = unidade.raio_metros ?? cfg?.raio_padrao_m ?? 200;
        if (distancia > raio) status = "fora_area";
      }
    } else if (cfg?.exige_geolocalizacao && (data.latitude == null || data.longitude == null)) {
      throw new Error("A localização é obrigatória para registrar o ponto nesta empresa.");
    }

    if (data.origem === "offline") status = "pendente";

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;
    const comprovante = `PNT-${dataRef.replace(/-/g, "")}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    const { data: criado, error } = await sb
      .from("pnt_time_entries")
      .insert({
        organization_id: funcionario.organization_id,
        employee_id: funcionario.id,
        company_id: funcionario.company_id,
        unit_id: funcionario.unit_id,
        tipo: data.tipo,
        registrado_em: agora.toISOString(),
        dispositivo_em: data.dispositivoEm ?? null,
        data_ref: dataRef,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        precisao_m: data.precisao ?? null,
        ip,
        user_agent: userAgent,
        origem: data.origem ?? "online",
        status,
        distancia_m: distancia,
        comprovante,
        idempotency_key: data.idempotencyKey,
        observacao: data.observacao ?? null,
        criado_por: userId,
      })
      .select("comprovante, registrado_em")
      .single();

    if (error) throw new Error(error.message);

    await sb.from("pnt_audit_logs").insert({
      organization_id: funcionario.organization_id,
      user_id: userId,
      acao: "registro_ponto",
      recurso: "pnt_time_entries",
      detalhes: { tipo: data.tipo, status, comprovante, distancia },
      ip,
    });

    await calcularDiaInterno(sb, funcionario.id, dataRef);

    return {
      ok: true,
      comprovante: criado.comprovante,
      registradoEm: criado.registrado_em,
      tipo: data.tipo,
      status,
      distanciaMetros: distancia,
      duplicado: false,
    };
  });

/** Recalcula horas trabalhadas, atrasos, extras e saldo do dia. */
async function calcularDiaInterno(sb: Ctx["supabase"], employeeId: string, data: string) {
  const { data: funcionario } = await sb
    .from("pnt_employees")
    .select("id, organization_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!funcionario) return null;

  const { data: entradas } = await sb
    .from("pnt_time_entries")
    .select("tipo, registrado_em, status")
    .eq("employee_id", employeeId)
    .eq("data_ref", data)
    .order("registrado_em", { ascending: true });

  const lista = ((entradas ?? []) as { tipo: TipoMarcacaoServidor; registrado_em: string }[]).filter(
    (e) => e.tipo !== "saida_extraordinaria",
  );

  const { data: vinculo } = await sb
    .from("pnt_schedule_assignments")
    .select("schedule_id, inicio, fim")
    .eq("employee_id", employeeId)
    .lte("inicio", data)
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  let escala: {
    entrada: string | null;
    saida: string | null;
    carga_diaria_min: number;
    tolerancia_min: number;
    intervalo_minutos: number;
    dias_semana: number[];
    limite_extra_diario_min: number;
    banco_horas: boolean;
  } | null = null;

  if (vinculo?.schedule_id) {
    const { data: esc } = await sb
      .from("pnt_work_schedules")
      .select(
        "entrada, saida, carga_diaria_min, tolerancia_min, intervalo_minutos, dias_semana, limite_extra_diario_min, banco_horas",
      )
      .eq("id", vinculo.schedule_id)
      .maybeSingle();
    escala = esc ?? null;
  }

  const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
  const trabalhaHoje = escala ? (escala.dias_semana ?? []).includes(diaSemana) : true;
  const previsto = escala && trabalhaHoje ? escala.carga_diaria_min : 0;
  const tolerancia = escala?.tolerancia_min ?? 5;

  // Soma dos intervalos entre entrada/saída, descontando pausas.
  let trabalhado = 0;
  let intervalo = 0;
  let noturno = 0;
  let abertura: Date | null = null;
  let pausa: Date | null = null;

  for (const e of lista) {
    const quando = new Date(e.registrado_em);
    if (e.tipo === "entrada") abertura = quando;
    if (e.tipo === "intervalo_inicio" && abertura) {
      trabalhado += (quando.getTime() - abertura.getTime()) / 60000;
      noturno += minutosNoturnos(abertura, quando);
      abertura = null;
      pausa = quando;
    }
    if (e.tipo === "intervalo_fim") {
      if (pausa) intervalo += (quando.getTime() - pausa.getTime()) / 60000;
      pausa = null;
      abertura = quando;
    }
    if (e.tipo === "saida" && abertura) {
      trabalhado += (quando.getTime() - abertura.getTime()) / 60000;
      noturno += minutosNoturnos(abertura, quando);
      abertura = null;
    }
  }

  const incompleto = abertura !== null || pausa !== null || lista.length === 0;

  let atraso = 0;
  let antecipada = 0;
  const primeira = lista.find((e) => e.tipo === "entrada");
  const ultima = [...lista].reverse().find((e) => e.tipo === "saida");
  if (escala?.entrada && primeira) {
    const esperada = new Date(`${data}T${escala.entrada}`);
    const real = new Date(primeira.registrado_em);
    const diff = (real.getTime() - esperada.getTime()) / 60000;
    if (diff > tolerancia) atraso = Math.round(diff);
  }
  if (escala?.saida && ultima) {
    const esperada = new Date(`${data}T${escala.saida}`);
    const real = new Date(ultima.registrado_em);
    const diff = (esperada.getTime() - real.getTime()) / 60000;
    if (diff > tolerancia) antecipada = Math.round(diff);
  }

  const trabalhadoMin = Math.max(0, Math.round(trabalhado));
  const extra = Math.max(0, trabalhadoMin - previsto);
  const saldo = trabalhadoMin - previsto;
  const situacao = incompleto ? "incompleto" : extra > 0 ? "extra" : saldo < 0 ? "debito" : "ok";

  await sb.from("pnt_daily_summaries").upsert(
    {
      organization_id: funcionario.organization_id,
      employee_id: employeeId,
      data,
      previsto_min: previsto,
      trabalhado_min: trabalhadoMin,
      intervalo_min: Math.round(intervalo),
      extra_min: extra,
      atraso_min: atraso,
      saida_antecipada_min: antecipada,
      noturno_min: Math.round(noturno),
      saldo_min: Math.round(saldo),
      situacao,
      regra: {
        escala: vinculo?.schedule_id ?? null,
        tolerancia_min: tolerancia,
        previsto_min: previsto,
        intervalo_previsto_min: escala?.intervalo_minutos ?? null,
        limite_extra_min: escala?.limite_extra_diario_min ?? null,
      },
      calculado_em: new Date().toISOString(),
    },
    { onConflict: "employee_id,data" },
  );

  if (escala?.banco_horas !== false && !incompleto) {
    await sb.from("pnt_hour_bank_entries").upsert(
      {
        organization_id: funcionario.organization_id,
        employee_id: employeeId,
        data,
        minutos: Math.round(saldo),
        origem: "calculo",
        descricao: "Saldo calculado automaticamente",
      },
      { onConflict: "employee_id,data,origem" },
    );
  }

  return { trabalhadoMin, previsto, extra, atraso, antecipada, saldo, situacao };
}

/** Recalcula um dia específico (RH, supervisor ou o próprio funcionário). */
export const calcularDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employeeId: string; data: string }) => {
    if (!input.employeeId || !input.data) throw new Error("Informe funcionário e data.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    return calcularDiaInterno(sb, data.employeeId, data.data);
  });

/** Recalcula todos os dias de um período. */
export const recalcularPeriodo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employeeId: string; inicio: string; fim: string }) => {
    if (!input.employeeId) throw new Error("Informe o funcionário.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const dias: string[] = [];
    const atual = new Date(`${data.inicio}T12:00:00Z`);
    const fim = new Date(`${data.fim}T12:00:00Z`);
    while (atual <= fim && dias.length < 120) {
      dias.push(atual.toISOString().slice(0, 10));
      atual.setUTCDate(atual.getUTCDate() + 1);
    }
    for (const dia of dias) await calcularDiaInterno(sb, data.employeeId, dia);
    return { ok: true as const, dias: dias.length };
  });

/** Funcionário pede correção de uma marcação. */
export const solicitarAjuste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      employeeId?: string;
      entryId?: string | null;
      dataRef: string;
      tipo: TipoMarcacaoServidor;
      horario: string;
      motivo: string;
    }) => {
      if (!input.dataRef) throw new Error("Informe a data.");
      if (!input.motivo?.trim()) throw new Error("Descreva o motivo da correção.");
      if (!TIPOS.includes(input.tipo)) throw new Error("Tipo de marcação inválido.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const userId = context.userId as string;
    const proprio = await funcionarioDoUsuario(sb, userId);
    const employeeId = data.employeeId ?? proprio?.id;
    if (!employeeId) throw new Error("Funcionário não encontrado para o seu acesso.");
    const orgId = proprio?.organization_id ?? (await organizacao(sb));

    const { error } = await sb.from("pnt_time_adjustment_requests").insert({
      organization_id: orgId,
      employee_id: employeeId,
      entry_id: data.entryId ?? null,
      data_ref: data.dataRef,
      tipo: data.tipo,
      horario_correto: new Date(`${data.dataRef}T${data.horario}`).toISOString(),
      motivo: data.motivo.trim(),
      solicitado_por: userId,
    });
    if (error) throw new Error(error.message);

    await sb.from("pnt_audit_logs").insert({
      organization_id: orgId,
      user_id: userId,
      acao: "solicitacao_ajuste",
      recurso: "pnt_time_adjustment_requests",
      detalhes: { employeeId, dataRef: data.dataRef, tipo: data.tipo },
    });
    return { ok: true as const };
  });

/** Supervisor/RH aprova ou rejeita um pedido de correção. */
export const decidirAjuste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { requestId: string; aprovar: boolean; justificativa: string }) => {
      if (!input.requestId) throw new Error("Solicitação inválida.");
      if (!input.justificativa?.trim()) throw new Error("Escreva a justificativa da decisão.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const userId = context.userId as string;

    const { data: pedido, error: erroBusca } = await sb
      .from("pnt_time_adjustment_requests")
      .select(
        "id, organization_id, employee_id, entry_id, data_ref, tipo, horario_correto, status",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!pedido) throw new Error("Solicitação não encontrada.");
    if (pedido.status !== "pendente") throw new Error("Essa solicitação já foi decidida.");

    const { error } = await sb
      .from("pnt_time_adjustment_requests")
      .update({
        status: data.aprovar ? "aprovada" : "rejeitada",
        decidido_por: userId,
        decidido_em: new Date().toISOString(),
        justificativa_decisao: data.justificativa.trim(),
      })
      .eq("id", pedido.id);
    if (error) throw new Error(error.message);

    let valorAnterior: unknown = null;

    if (data.aprovar) {
      if (pedido.entry_id) {
        const { data: original } = await sb
          .from("pnt_time_entries")
          .select("id, tipo, registrado_em, status")
          .eq("id", pedido.entry_id)
          .maybeSingle();
        valorAnterior = original ?? null;
        // O registro original nunca é apagado: ele é marcado como corrigido.
        await sb.from("pnt_time_entries").update({ status: "corrigido" }).eq("id", pedido.entry_id);
      }

      await sb.from("pnt_time_entries").insert({
        organization_id: pedido.organization_id,
        employee_id: pedido.employee_id,
        tipo: pedido.tipo,
        registrado_em: pedido.horario_correto,
        data_ref: pedido.data_ref,
        origem: "ajuste",
        status: "valido",
        comprovante: `AJU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        idempotency_key: `ajuste-${pedido.id}`,
        observacao: "Correção aprovada",
        criado_por: userId,
      });

      await sb.from("pnt_time_adjustments").insert({
        organization_id: pedido.organization_id,
        request_id: pedido.id,
        entry_id: pedido.entry_id,
        employee_id: pedido.employee_id,
        valor_anterior: valorAnterior,
        valor_novo: { tipo: pedido.tipo, registrado_em: pedido.horario_correto },
        aplicado_por: userId,
      });

      await calcularDiaInterno(sb, pedido.employee_id, pedido.data_ref);
    }

    await sb.from("pnt_approval_history").insert({
      organization_id: pedido.organization_id,
      referencia: "pnt_time_adjustment_requests",
      referencia_id: pedido.id,
      acao: data.aprovar ? "aprovada" : "rejeitada",
      responsavel: userId,
      justificativa: data.justificativa.trim(),
      valor_anterior: valorAnterior,
      valor_novo: { horario_correto: pedido.horario_correto },
    });

    return { ok: true as const };
  });

/** Fecha (ou reabre) o período de apuração. */
export const fecharPeriodo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { periodoId: string; fechar: boolean }) => {
    if (!input.periodoId) throw new Error("Período inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const userId = context.userId as string;
    const { error } = await sb
      .from("pnt_payroll_periods")
      .update({
        status: data.fechar ? "fechado" : "aberto",
        fechado_por: data.fechar ? userId : null,
        fechado_em: data.fechar ? new Date().toISOString() : null,
      })
      .eq("id", data.periodoId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Vincula o acesso logado a um funcionário do ponto (usado pelo RH). */
export const vincularFuncionario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employeeId: string; userId: string | null }) => {
    if (!input.employeeId) throw new Error("Funcionário inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const { error } = await sb
      .from("pnt_employees")
      .update({ user_id: data.userId })
      .eq("id", data.employeeId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Qual o papel do usuário logado dentro do ponto. */
export const meuPapelPonto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Ctx["supabase"];
    const userId = context.userId as string;
    const { data } = await sb.rpc("pnt_papel_do_usuario", { _user_id: userId });
    const funcionario = await funcionarioDoUsuario(sb, userId);
    // Superadmin sempre enxerga todos os registros de ponto.
    const email = String((context as { claims?: { email?: string } }).claims?.email ?? "").toLowerCase();
    const superadmin = email === "lucasdallan@gmail.com";
    return {
      papel: superadmin ? "admin" : ((data as string | null) ?? "funcionario"),
      employeeId: funcionario?.id ?? null,
      nome: funcionario?.nome ?? null,
    };
  });

function minutosNoturnos(inicio: Date, fim: Date): number {
  // Adicional noturno: 22h às 5h, no fuso de Brasília.
  let total = 0;
  const passo = 5 * 60000;
  for (let t = inicio.getTime(); t < fim.getTime(); t += passo) {
    const hora = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(
        new Date(t),
      ),
    );
    if (hora >= 22 || hora < 5) total += 5;
  }
  return total;
}
