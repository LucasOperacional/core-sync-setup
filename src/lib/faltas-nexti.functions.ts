import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null;
}

function pick(obj: unknown, chaves: string[]): unknown {
  if (!isRec(obj)) return null;
  for (const chave of chaves) {
    const valor = obj[chave];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return null;
}

function str(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : typeof valor === "number" ? String(valor) : "";
}

function num(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(str(valor));
  return Number.isFinite(n) ? n : null;
}

function extrairLista(data: unknown): Rec[] {
  if (Array.isArray(data)) return data.filter(isRec);
  if (isRec(data)) {
    for (const chave of ["content", "value", "data", "items", "list"]) {
      const valor = data[chave];
      if (Array.isArray(valor)) return valor.filter(isRec);
      if (isRec(valor)) {
        const interno = valor["content"] ?? valor["data"];
        if (Array.isArray(interno)) return interno.filter(isRec);
      }
    }
  }
  return [];
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function dataHoraNexti(data: string, fimDoDia: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!match) throw new Error("Informe uma data válida para a falta.");
  return `${match[3]}${match[2]}${match[1]}${fimDoDia ? "235959" : "000000"}`;
}

export type SituacaoFaltaNexti = {
  id: number;
  nome: string;
  externalId: string;
};

export type SituacoesFaltaResultado = {
  ok: boolean;
  situacoes: SituacaoFaltaNexti[];
  erro?: string;
};

/** Lista as situações de ausência ativas da NEXTI (falta, atestado, suspensão etc.). */
export const listarSituacoesFaltaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SituacoesFaltaResultado> => {
    try {
      const config = await loadConfig((context as { supabase: unknown }).supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      let lista: Rec[] = [];
      for (const endpoint of ["/absencesituations/all", "/api/absencesituations/all"]) {
        try {
          const resposta = await requestNexti({ config, endpoint, method: "GET" });
          lista = extrairLista(resposta.data);
          if (lista.length) break;
        } catch {
          // tenta o próximo caminho
        }
      }

      const situacoes: SituacaoFaltaNexti[] = [];
      const vistos = new Set<number>();
      for (const item of lista) {
        if (pick(item, ["active", "ativo"]) === false) continue;
        const id = num(pick(item, ["id", "nextiId"]));
        const nome = str(pick(item, ["name", "description", "nome"]));
        if (id === null || !nome || vistos.has(id)) continue;
        vistos.add(id);
        situacoes.push({
          id,
          nome,
          externalId: str(pick(item, ["externalId", "codigoExterno", "externalCode"])),
        });
      }
      situacoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      if (!situacoes.length) {
        return { ok: false, situacoes: [], erro: "Nenhuma situação de ausência ativa na NEXTI." };
      }
      return { ok: true, situacoes };
    } catch (error) {
      return {
        ok: false,
        situacoes: [],
        erro: error instanceof Error ? error.message : "Falha ao consultar situações na NEXTI.",
      };
    }
  });

// ---------------------------------------------------------------------------
// Validações antes de lançar a falta
// ---------------------------------------------------------------------------

export type ValidacaoFalta = {
  chave: "atestado" | "ausencia" | "escala" | "escala_indefinida";
  titulo: string;
  status: "ok" | "alerta" | "bloqueio";
  detalhe: string;
};

export type ValidacaoFaltaResultado = {
  ok: boolean;
  bloqueado: boolean;
  /** true quando o bloqueio vem de inferência de escala (supervisor pode confirmar). */
  podeForcar: boolean;
  validacoes: ValidacaoFalta[];
  erro?: string;
};

const DIA_MS = 86400000;

function diasDoPeriodo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  let atual = Date.parse(`${inicio}T00:00:00Z`);
  const limite = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(atual) || !Number.isFinite(limite)) return [inicio];
  while (atual <= limite && dias.length < 62) {
    dias.push(new Date(atual).toISOString().slice(0, 10));
    atual += DIA_MS;
  }
  return dias.length ? dias : [inicio];
}

function somarDias(dataISO: string, dias: number): string {
  return new Date(Date.parse(`${dataISO}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

function diffDias(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_MS);
}

function soData(valor: unknown): string {
  const texto = str(valor);
  if (!texto) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return texto.slice(0, 10);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const compacto = /^(\d{2})(\d{2})(\d{4})/.exec(texto);
  if (compacto) return `${compacto[3]}-${compacto[2]}-${compacto[1]}`;
  return "";
}

/** Busca ausências já lançadas para o colaborador no período (API + base sincronizada). */
async function ausenciasDoPeriodo(
  config: Awaited<ReturnType<typeof loadConfig>>,
  personId: number,
  inicio: string,
  fim: string,
): Promise<Rec[]> {
  const inicioNexti = dataHoraNexti(inicio, false);
  const fimNexti = dataHoraNexti(fim, true);
  const caminhos = [
    `/api/absences/person/${personId}/start/${inicioNexti}/finish/${fimNexti}`,
    `/absences/person/${personId}/start/${inicioNexti}/finish/${fimNexti}`,
    `/api/absences/start/${inicioNexti}/finish/${fimNexti}`,
  ];

  for (const endpoint of caminhos) {
    try {
      const resposta = await requestNexti({ config, endpoint, method: "GET" });
      const lista = extrairLista(resposta.data).filter((item) => {
        const id = num(pick(item, ["personId", "person", "idPerson"]));
        return id === null || id === personId;
      });
      if (lista.length) return lista;
    } catch {
      // tenta o próximo caminho
    }
  }

  // Sem endpoint disponível, usa o que já foi sincronizado da NEXTI.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("nexti_absences")
      .select(
        "person_id, absence_situation_id, start_date_time, finish_date_time, note, cid_code, removed",
      )
      .eq("person_id", personId)
      .eq("removed", false)
      .gte("start_date_time", `${somarDias(inicio, -120)}T00:00:00Z`)
      .limit(500);
    const linhas: Rec[] = Array.isArray(data) ? (data as Rec[]) : [];
    return linhas.filter((linha) => {
      const ini = soData(linha["start_date_time"]);
      const f = soData(linha["finish_date_time"]) || ini;
      return ini && ini <= fim && f >= inicio;
    });
  } catch {
    return [];
  }
}

/** Dias efetivamente trabalhados (marcações de ponto) nos últimos meses. */
async function diasTrabalhados(personId: number, ateISO: string): Promise<Set<string>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("nexti_clockings")
      .select("reference_date, clocking_date, removed")
      .eq("person_id", personId)
      .gte("reference_date", somarDias(ateISO, -120))
      .lte("reference_date", ateISO)
      .limit(5000);
    const dias = new Set<string>();
    for (const linha of Array.isArray(data) ? (data as Rec[]) : []) {
      if (linha["removed"] === true) continue;
      const dia = soData(linha["reference_date"]) || soData(linha["clocking_date"]);
      if (dia) dias.add(dia);
    }
    return dias;
  } catch {
    return new Set<string>();
  }
}

/** Nome da escala cadastrada do colaborador na NEXTI (quando disponível). */
async function escalaDoColaborador(
  config: Awaited<ReturnType<typeof loadConfig>>,
  personId: number,
): Promise<string> {
  for (const endpoint of [
    `/api/persons/${personId}`,
    `/persons/${personId}`,
    `/api/persons/${personId}/schedule`,
    `/api/workSchedules/person/${personId}`,
  ]) {
    try {
      const resposta = await requestNexti({ config, endpoint, method: "GET" });
      const dados = isRec(resposta.data) ? resposta.data : null;
      const alvo = isRec(dados?.["content"]) ? (dados!["content"] as Rec) : dados;
      const nome = pick(alvo, [
        "scheduleName",
        "schedule",
        "escala",
        "workScheduleName",
        "workSchedule",
        "scaleName",
        "scale",
        "journeyName",
        "journey",
      ]);
      const texto = isRec(nome) ? str(pick(nome, ["name", "nome", "description"])) : str(nome);
      if (texto) return texto;
    } catch {
      // segue sem a escala
    }
  }
  return "";
}

/**
 * Decide, pelo nome da escala cadastrada, se um dia é de trabalho.
 * Retorna null quando o padrão da escala não permite concluir.
 */
function diaDeTrabalhoPelaEscala(
  escalaNorm: string,
  dia: string,
  ultimoTrabalhado: string | null,
): boolean | null {
  if (!escalaNorm) return null;
  const semana = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo

  if (escalaNorm.includes("12X36") || escalaNorm.includes("24X48")) {
    if (!ultimoTrabalhado) return null;
    const passo = escalaNorm.includes("24X48") ? 3 : 2;
    const delta = Math.abs(diffDias(dia, ultimoTrabalhado));
    return delta % passo === 0;
  }
  if (escalaNorm.includes("5X2") || escalaNorm.includes("SEGASEX") || escalaNorm.includes("SEGSEX")) {
    return semana >= 1 && semana <= 5;
  }
  if (escalaNorm.includes("6X1") || escalaNorm.includes("SEGASAB") || escalaNorm.includes("SEGSAB")) {
    return semana >= 1 && semana <= 6;
  }
  if (escalaNorm.includes("5X1")) return null;
  return null;
}


/**
 * Regras de negócio antes de enviar a falta para a NEXTI:
 * 1. não lançar falta em dia com atestado/ausência já registrada;
 * 2. não lançar falta em dia de folga segundo a escala do colaborador.
 */
async function validarLancamento(
  config: Awaited<ReturnType<typeof loadConfig>>,
  entrada: { personId: number; inicio: string; fim: string },
): Promise<ValidacaoFaltaResultado> {
  const validacoes: ValidacaoFalta[] = [];
  const dias = diasDoPeriodo(entrada.inicio, entrada.fim);

  // --- 1. Atestados e ausências já lançadas -------------------------------
  const ausencias = await ausenciasDoPeriodo(
    config,
    entrada.personId,
    entrada.inicio,
    entrada.fim,
  );
  const atestados: string[] = [];
  const outras: string[] = [];
  for (const item of ausencias) {
    const ini = soData(pick(item, ["startDateTime", "start_date_time", "startDate"]));
    const fimA = soData(pick(item, ["finishDateTime", "finish_date_time", "endDate"])) || ini;
    if (!ini || ini > entrada.fim || fimA < entrada.inicio) continue;
    const descricao = normalizar(
      `${str(pick(item, ["absenceSituationName", "situationName", "note", "note"]))} ${str(
        pick(item, ["cidCode", "cid_code"]),
      )}`,
    );
    const rotulo = `${ini === fimA ? ini : `${ini} a ${fimA}`}`;
    const temCid = !!str(pick(item, ["cidCode", "cid_code"]));
    if (temCid || descricao.includes("ATESTADO") || descricao.includes("MEDIC")) {
      atestados.push(rotulo);
    } else {
      outras.push(rotulo);
    }
  }

  if (atestados.length) {
    validacoes.push({
      chave: "atestado",
      titulo: "Atestado na folha do colaborador",
      status: "bloqueio",
      detalhe: `Já existe atestado lançado em ${atestados.join(", ")}. A falta não pode ser registrada nesse período.`,
    });
  } else if (outras.length) {
    validacoes.push({
      chave: "ausencia",
      titulo: "Ausência já lançada",
      status: "alerta",
      detalhe: `O colaborador já possui ausência registrada em ${outras.join(", ")}.`,
    });
  } else {
    validacoes.push({
      chave: "atestado",
      titulo: "Atestado na folha do colaborador",
      status: "ok",
      detalhe: "Nenhum atestado ou ausência encontrada no período.",
    });
  }

  // --- 2. Escala do colaborador (não lançar falta em folga) ---------------
  const ontem = somarDias(new Date().toISOString().slice(0, 10), -1);
  const trabalhados = await diasTrabalhados(entrada.personId, ontem);
  const escala = await escalaDoColaborador(config, entrada.personId);
  const escalaNorm = normalizar(escala).replace(/\s+/g, "");
  const historico = [...trabalhados].sort();

  const ultimoTrabalhado = historico.length ? historico[historico.length - 1]! : null;
  const folgas: string[] = [];
  const indefinidos: string[] = [];
  const trabalhoConfirmado: string[] = [];

  for (const dia of dias) {
    // 1) escala cadastrada na NEXTI decide primeiro
    const pelaEscala = diaDeTrabalhoPelaEscala(escalaNorm, dia, ultimoTrabalhado);
    if (pelaEscala === false) {
      folgas.push(dia);
      continue;
    }
    if (pelaEscala === true) {
      trabalhoConfirmado.push(dia);
      continue;
    }

    // 2) sem padrão de escala: usa o histórico de ponto, se for suficiente
    if (historico.length < 8) {
      indefinidos.push(dia);
      continue;
    }
    const semana = new Date(`${dia}T00:00:00Z`).getUTCDay();
    let mesmosDias = 0;
    let trabalhou = 0;
    for (const registro of historico) {
      if (new Date(`${registro}T00:00:00Z`).getUTCDay() === semana) trabalhou++;
    }
    for (let i = 0; i < 120; i++) {
      const d = somarDias(ontem, -i);
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === semana) mesmosDias++;
    }
    if (mesmosDias >= 4 && trabalhou === 0) folgas.push(dia);
    else if (trabalhou > 0) trabalhoConfirmado.push(dia);
    else indefinidos.push(dia);
  }

  if (folgas.length) {
    validacoes.push({
      chave: "escala",
      titulo: "Escala do colaborador",
      status: "bloqueio",
      detalhe: `${folgas.join(", ")} ${folgas.length > 1 ? "são dias" : "é dia"} de folga na escala${
        escala ? ` ${escala}` : ""
      }. Faltas não podem ser lançadas em folga.`,
    });
  } else if (indefinidos.length) {
    validacoes.push({
      chave: "escala_indefinida",
      titulo: "Escala do colaborador",
      status: "bloqueio",
      detalhe: `Não foi possível confirmar pela escala${
        escala ? ` ${escala}` : ""
      } se ${indefinidos.length > 1 ? "os dias" : "o dia"} ${indefinidos.join(
        ", ",
      )} ${indefinidos.length > 1 ? "são" : "é"} de trabalho. Confira a escala do colaborador: se não for dia de trabalho, o lançamento será bloqueado.`,
    });
  } else {
    validacoes.push({
      chave: "escala",
      titulo: "Escala do colaborador",
      status: "ok",
      detalhe: `Período compatível com a escala${escala ? ` ${escala}` : ""} do colaborador (${trabalhoConfirmado.length} ${
        trabalhoConfirmado.length > 1 ? "dias" : "dia"
      } de trabalho).`,
    });
  }


  const bloqueios = validacoes.filter((v) => v.status === "bloqueio");
  return {
    ok: true,
    bloqueado: bloqueios.length > 0,
    podeForcar: bloqueios.length > 0 && bloqueios.every((v) => v.chave === "escala_indefinida"),
    validacoes,
  };
}

/** Roda as validações sem enviar nada para a NEXTI (pré-visualização no card). */
export const validarFaltaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personId: number; inicio: string; fim: string }) => ({
    personId: Number(input?.personId),
    inicio: String(input?.inicio ?? ""),
    fim: String(input?.fim ?? "") || String(input?.inicio ?? ""),
  }))
  .handler(async ({ data, context }): Promise<ValidacaoFaltaResultado> => {
    try {
      if (!Number.isInteger(data.personId) || data.personId <= 0 || !data.inicio) {
        return { ok: false, bloqueado: false, podeForcar: false, validacoes: [] };
      }
      const config = await loadConfig((context as { supabase: unknown }).supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      return await validarLancamento(config, data);
    } catch (error) {
      return {
        ok: false,
        bloqueado: false,
        podeForcar: false,
        validacoes: [],
        erro: error instanceof Error ? error.message : "Falha ao validar a falta.",
      };
    }
  });

/** Grava o log de cada tentativa de lançamento para acompanhamento. */
async function registrarLog(registro: Record<string, unknown>): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("faltas_nexti_log").insert(registro);
  } catch {
    // o log nunca deve impedir o lançamento
  }
}

export type LogFaltaNexti = {
  id: string;
  criadoEm: string;
  colaborador: string;
  situacao: string;
  inicio: string;
  fim: string;
  status: string;
  motivo: string;
  usuario: string;
  forcado: boolean;
};

export type LogsFaltaResultado = { ok: boolean; logs: LogFaltaNexti[]; erro?: string };

/** Últimos lançamentos (enviados, bloqueados e com erro) para acompanhamento. */
export const listarLogsFaltaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LogsFaltaResultado> => {
    const supabase = (context as { supabase: any }).supabase;
    const { data, error } = await supabase
      .from("faltas_nexti_log")
      .select(
        "id, created_at, colaborador, situacao_nome, data_inicio, data_fim, status, motivo, usuario_nome, forcado",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return { ok: false, logs: [], erro: error.message };
    const logs: LogFaltaNexti[] = (Array.isArray(data) ? (data as Rec[]) : []).map((linha) => ({
      id: str(linha["id"]),
      criadoEm: str(linha["created_at"]),
      colaborador: str(linha["colaborador"]),
      situacao: str(linha["situacao_nome"]),
      inicio: str(linha["data_inicio"]),
      fim: str(linha["data_fim"]),
      status: str(linha["status"]) || "desconhecido",
      motivo: str(linha["motivo"]),
      usuario: str(linha["usuario_nome"]),
      forcado: linha["forcado"] === true,
    }));
    return { ok: true, logs };
  });

export type LancamentoFaltaResultado = {
  ok: boolean;
  httpStatus?: number;
  erro?: string;
  bloqueado?: boolean;
  podeForcar?: boolean;
  validacoes?: ValidacaoFalta[];
};


/** Lança uma falta (ausência) diretamente no cadastro do colaborador na NEXTI. */
export const lancarFaltaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      personId: number;
      personExternalId?: string;
      colaborador?: string;
      situacaoId: number;
      situacaoExternalId?: string;
      situacaoNome?: string;
      inicio: string;
      fim: string;
      observacao?: string;
      forcar?: boolean;
    }) => {
      const personId = Number(input?.personId);
      if (!Number.isInteger(personId) || personId <= 0) {
        throw new Error("Selecione um colaborador válido da NEXTI.");
      }
      const situacaoId = Number(input?.situacaoId);
      if (!Number.isInteger(situacaoId) || situacaoId <= 0) {
        throw new Error("Selecione o tipo de falta.");
      }
      const inicio = String(input?.inicio ?? "");
      const fim = String(input?.fim ?? "") || inicio;
      if (!inicio) throw new Error("Informe a data da falta.");
      if (inicio > fim) throw new Error("A data final deve ser posterior à inicial.");
      return {
        personId,
        personExternalId: String(input?.personExternalId ?? "").trim(),
        colaborador: String(input?.colaborador ?? "")
          .trim()
          .slice(0, 160),
        situacaoId,
        situacaoExternalId: String(input?.situacaoExternalId ?? "").trim(),
        situacaoNome: String(input?.situacaoNome ?? "")
          .trim()
          .slice(0, 120),
        inicio,
        fim,
        observacao: String(input?.observacao ?? "")
          .trim()
          .slice(0, 500),
        forcar: input?.forcar === true,
      };
    },
  )
  .handler(async ({ data, context }): Promise<LancamentoFaltaResultado> => {
    const ctx = context as { supabase: any; userId?: string; claims?: Rec };
    const config = await loadConfig(ctx.supabase);
    config.baseUrl = normalizeBaseUrl(config.baseUrl);

    const usuarioNome =
      str(pick(ctx.claims ?? {}, ["email", "user_name", "name"])) || str(ctx.userId);

    const baseLog = {
      usuario_id: ctx.userId ?? null,
      usuario_nome: usuarioNome || null,
      person_id: data.personId,
      person_external_id: data.personExternalId || null,
      colaborador: data.colaborador || null,
      situacao_id: data.situacaoId,
      situacao_nome: data.situacaoNome || null,
      data_inicio: data.inicio,
      data_fim: data.fim,
      observacao: data.observacao || null,
      forcado: data.forcar,
    };

    // --- Regras de negócio antes de tocar na NEXTI --------------------------
    let validacao: ValidacaoFaltaResultado;
    try {
      validacao = await validarLancamento(config, {
        personId: data.personId,
        inicio: data.inicio,
        fim: data.fim,
      });
    } catch (error) {
      validacao = {
        ok: false,
        bloqueado: false,
        podeForcar: false,
        validacoes: [
          {
            chave: "escala",
            titulo: "Validação",
            status: "alerta",
            detalhe:
              error instanceof Error ? error.message : "Não foi possível validar antes do envio.",
          },
        ],
      };
    }

    const bloqueiosAtivos = validacao.validacoes.filter(
      (v) => v.status === "bloqueio" && !(data.forcar && v.chave === "escala_indefinida"),
    );

    if (bloqueiosAtivos.length) {
      const motivo = bloqueiosAtivos.map((v) => v.detalhe).join(" ");
      await registrarLog({
        ...baseLog,
        status: "bloqueado",
        motivo,
        validacoes: validacao.validacoes,
      });
      return {
        ok: false,
        bloqueado: true,
        podeForcar: bloqueiosAtivos.every((v) => v.chave === "escala_indefinida"),
        validacoes: validacao.validacoes,
        erro: motivo,
      };
    }

    const body = {
      personId: data.personId,
      ...(data.personExternalId ? { personExternalId: data.personExternalId } : {}),
      absenceSituationId: data.situacaoId,
      ...(data.situacaoExternalId ? { absenceSituationExternalId: data.situacaoExternalId } : {}),
      startDateTime: dataHoraNexti(data.inicio, false),
      finishDateTime: dataHoraNexti(data.fim, true),
      note: data.observacao || "Falta lançada pela supervisão",
    };

    const enviar = (sobrepor: boolean) =>
      requestNexti({
        config,
        endpoint: "/absences",
        method: "POST",
        query: { shouldOverlapAll: sobrepor },
        body,
      });

    try {
      let resposta;
      try {
        resposta = await enviar(false);
      } catch (primeiroErro) {
        const err = primeiroErro as Error & { httpStatus?: number; nextiResponse?: string };
        const texto = normalizar(`${err.nextiResponse ?? ""} ${err.message ?? ""}`);
        // A NEXTI recusa quando já há ausência no mesmo período; reenviamos
        // autorizando a sobreposição para que a falta substitua o registro anterior.
        if (err.httpStatus === 409 && texto.includes("SOBREPOSI")) {
          resposta = await enviar(true);
        } else {
          throw primeiroErro;
        }
      }

      await registrarLog({
        ...baseLog,
        status: "enviado",
        motivo: null,
        validacoes: validacao.validacoes,
        http_status: resposta.status,
      });

      return { ok: true, httpStatus: resposta.status, validacoes: validacao.validacoes };
    } catch (error) {
      const err = error as Error & { httpStatus?: number; nextiResponse?: string };
      const texto = normalizar(`${err.nextiResponse ?? ""} ${err.message ?? ""}`);

      let mensagem: string;
      if (err.httpStatus === 409 && texto.includes("EM ANDAMENTO")) {
        mensagem =
          "Já existe um lançamento em andamento na NEXTI para este colaborador e período. Aguarde a aprovação ou verifique as ausências do colaborador.";
      } else if (err.httpStatus === 409 && texto.includes("SOBREPOSI")) {
        mensagem =
          "O colaborador já possui uma ausência lançada nesse período na NEXTI. Ajuste as datas ou remova o lançamento anterior.";
      } else {
        const comentario = err.nextiResponse ? ` Resposta da NEXTI: ${err.nextiResponse}` : "";
        mensagem = `${err.message || "Falha ao lançar a falta na NEXTI."}${comentario}`;
      }

      await registrarLog({
        ...baseLog,
        status: "erro",
        motivo: mensagem,
        validacoes: validacao.validacoes,
        ...(err.httpStatus ? { http_status: err.httpStatus } : {}),
        resposta: err.nextiResponse ?? null,
      });

      return {
        ok: false,
        ...(err.httpStatus ? { httpStatus: err.httpStatus } : {}),
        erro: mensagem,
        validacoes: validacao.validacoes,
      };
    }
  });

