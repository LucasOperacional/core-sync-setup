import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostoServicoMesa = {
  id: string;
  nome: string;
  gerenteNome: string;
  localidade: string | null;
  cliente: string | null;
  ativo: boolean;
  /** Check-in do dia consultado (quando existir). */
  checkFeito: boolean;
  checkObservacao: string | null;
  checkEm: string | null;
  /** Relatório do dia consultado (quando existir). */
  relatorio: string | null;
  relatorioEm: string | null;
  /** Último relatório registrado em dias anteriores (histórico que fica guardado). */
  ultimoRelatorio: string | null;
  ultimoRelatorioEm: string | null;
  ultimoRelatorioData: string | null;
};


export type ListarMesaResultado = {
  ok: boolean;
  data: string;
  postos: PostoServicoMesa[];
  erro?: string;
};

export type MesaResultado = { ok: boolean; id?: string; erro?: string };

const dataSchema = z.object({ data: z.string().optional() });

const criarSchema = z.object({
  nome: z.string().min(2),
  gerenteNome: z.string().min(2),
  localidade: z.string().optional(),
  cliente: z.string().optional(),
});

const removerSchema = z.object({ id: z.string().uuid() });

const checkSchema = z.object({
  postoId: z.string().uuid(),
  data: z.string(),
  feito: z.boolean(),
  observacao: z.string().optional(),
});

/** Data de hoje no fuso de Brasília, no formato AAAA-MM-DD. */
export function hojeBrasilia(): string {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(agora);
}

export const listarPostosMesa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => dataSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<ListarMesaResultado> => {
    const dia = data.data && /^\d{4}-\d{2}-\d{2}$/.test(data.data) ? data.data : hojeBrasilia();

    const { data: postos, error } = await context.supabase
      .from("mesa_postos_servico")
      .select("id, nome, gerente_nome, localidade, cliente, ativo")
      .order("gerente_nome", { ascending: true })
      .order("nome", { ascending: true });

    if (error) return { ok: false, data: dia, postos: [], erro: error.message };

    const { data: checks } = await context.supabase
      .from("mesa_checkins")
      .select("posto_id, feito, observacao, registrado_em")
      .eq("data", dia);

    const mapa = new Map((checks ?? []).map((c) => [c.posto_id, c]));

    const { data: relatorios } = await context.supabase
      .from("mesa_relatorios")
      .select("posto_id, relatorio, registrado_em")
      .eq("data", dia);

    const mapaRel = new Map((relatorios ?? []).map((r) => [r.posto_id, r]));

    // Histórico: último relatório registrado antes do dia consultado, para que
    // nada se perca ao virar o dia.
    const { data: anteriores } = await context.supabase
      .from("mesa_relatorios")
      .select("posto_id, relatorio, registrado_em, data")
      .not("posto_id", "is", null)
      .lt("data", dia)
      .order("data", { ascending: false })
      .limit(2000);

    const mapaUltimo = new Map<string, { relatorio: string; registrado_em: string | null; data: string }>();
    for (const r of anteriores ?? []) {
      if (!r.posto_id || mapaUltimo.has(r.posto_id)) continue;
      mapaUltimo.set(r.posto_id, {
        relatorio: r.relatorio,
        registrado_em: r.registrado_em,
        data: r.data,
      });
    }

    return {
      ok: true,
      data: dia,
      postos: (postos ?? []).map((p) => {
        const c = mapa.get(p.id);
        const r = mapaRel.get(p.id);
        const u = mapaUltimo.get(p.id);
        return {
          id: p.id,
          nome: p.nome,
          gerenteNome: p.gerente_nome,
          localidade: p.localidade,
          cliente: p.cliente,
          ativo: p.ativo ?? true,
          checkFeito: c?.feito ?? false,
          checkObservacao: c?.observacao ?? null,
          checkEm: c?.registrado_em ?? null,
          relatorio: r?.relatorio ?? null,
          relatorioEm: r?.registrado_em ?? null,
          ultimoRelatorio: u?.relatorio ?? null,
          ultimoRelatorioEm: u?.registrado_em ?? null,
          ultimoRelatorioData: u?.data ?? null,
        };
      }),
    };
  });


const relatorioSchema = z.object({
  postoId: z.string().uuid(),
  data: z.string(),
  relatorio: z.string().min(1).max(5000),
});

/** Salva (ou atualiza) o relatório do posto na data, registrando data e hora. */
export const salvarRelatorioMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => relatorioSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase.from("mesa_relatorios").upsert(
      {
        posto_id: data.postoId,
        data: data.data,
        relatorio: data.relatorio.trim(),
        registrado_por: context.userId,
        registrado_em: new Date().toISOString(),
      },
      { onConflict: "posto_id,data" },
    );
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
});

const limparRelatorioSchema = z.object({
  postoId: z.string().uuid(),
  data: z.string(),
});

/** Remove o relatório do posto na data. */
export const limparRelatorioMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => limparRelatorioSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_relatorios")
      .delete()
      .eq("posto_id", data.postoId)
      .eq("data", data.data);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Relatório geral do gerente (por dia, sem vínculo com posto)
// ---------------------------------------------------------------------------

export type RelatorioGeral = { relatorio: string | null; registradoEm: string | null };

const relatorioGeralSchema = z.object({
  gerenteNome: z.string().min(2),
  data: z.string(),
  relatorio: z.string().min(1).max(10000),
});

export const buscarRelatorioGeralMesa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ gerenteNome: z.string().min(2), data: z.string() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<RelatorioGeral> => {
    const { data: row } = await context.supabase
      .from("mesa_relatorios")
      .select("relatorio, registrado_em")
      .is("posto_id", null)
      .eq("gerente_nome", data.gerenteNome.trim())
      .eq("data", data.data)
      .maybeSingle();
    return { relatorio: row?.relatorio ?? null, registradoEm: row?.registrado_em ?? null };
  });

/** Salva (ou atualiza) o relatório geral do gerente na data, registrando data e hora. */
export const salvarRelatorioGeralMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => relatorioGeralSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const gerente = data.gerenteNome.trim();
    await context.supabase
      .from("mesa_relatorios")
      .delete()
      .is("posto_id", null)
      .eq("gerente_nome", gerente)
      .eq("data", data.data);
    const { error } = await context.supabase.from("mesa_relatorios").insert({
      posto_id: null,
      gerente_nome: gerente,
      data: data.data,
      relatorio: data.relatorio.trim(),
      registrado_por: context.userId,
      registrado_em: new Date().toISOString(),
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

const limparRelatorioGeralSchema = z.object({
  gerenteNome: z.string().min(2),
  data: z.string(),
});

/** Remove o relatório geral do gerente na data. */
export const limparRelatorioGeralMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => limparRelatorioGeralSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_relatorios")
      .delete()
      .is("posto_id", null)
      .eq("gerente_nome", data.gerenteNome.trim())
      .eq("data", data.data);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

export const cadastrarPostoMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => criarSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { data: criado, error } = await context.supabase
      .from("mesa_postos_servico")
      .insert({
        nome: data.nome.trim(),
        gerente_nome: data.gerenteNome.trim(),
        localidade: data.localidade?.trim() || null,
        cliente: data.cliente?.trim() || null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) {
      const duplicado = error.code === "23505";
      return {
        ok: false,
        erro: duplicado ? "Este posto já está cadastrado para esse gerente." : error.message,
      };
    }
    return { ok: true, id: criado?.id };
  });

export const removerPostoMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removerSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_postos_servico")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

const removerTodosSchema = z.object({ gerenteNome: z.string().min(2) });

export const removerTodosPostosMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removerTodosSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase
      .from("mesa_postos_servico")
      .delete()
      .eq("gerente_nome", data.gerenteNome.trim());
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

export const registrarCheckinMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkSchema.parse(input))
  .handler(async ({ context, data }): Promise<MesaResultado> => {
    const { error } = await context.supabase.from("mesa_checkins").upsert(
      {
        posto_id: data.postoId,
        data: data.data,
        feito: data.feito,
        observacao: data.observacao?.trim() || null,
        registrado_por: context.userId,
        registrado_em: new Date().toISOString(),
      },
      { onConflict: "posto_id,data" },
    );
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Postos vindos direto da API da NEXTI (para o campo "Nome do posto")
// ---------------------------------------------------------------------------

export type PostoNexti = {
  nextiId: number | null;
  nome: string;
  cliente: string | null;
  localidade: string | null;
};

export type PostosNextiResultado = { ok: boolean; postos: PostoNexti[]; erro?: string };

type RecNexti = Record<string, unknown>;

function ehRec(v: unknown): v is RecNexti {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escolher(obj: RecNexti, chaves: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const k of chaves) {
    const real = lower.get(k.toLowerCase());
    if (!real) continue;
    const valor = obj[real];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
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

function listaDoPayload(payload: unknown): RecNexti[] {
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

/** Lê os postos de serviço direto da API da NEXTI (com fallback no cache local). */
export const buscarPostosNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostosNextiResultado> => {
    const ctx = context as { supabase: any };
    const encontrados = new Map<string, PostoNexti>();

    const guardar = (p: PostoNexti) => {
      const chave = p.nome.toLowerCase();
      if (!chave || encontrados.has(chave)) return;
      encontrados.set(chave, p);
    };

    let erro: string | undefined;

    try {
      const { loadConfig, normalizeBaseUrl, requestNexti } = await import("@/lib/nexti.functions");
      const bruta = await loadConfig(ctx.supabase);
      const config = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };

      const endpoints = ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"];
      for (const endpoint of endpoints) {
        try {
          const coletados: RecNexti[] = [];
          for (let page = 0; page < 40; page++) {
            const resposta = await requestNexti({
              config,
              endpoint,
              method: "GET",
              query: { page, size: 200 },
            });
            const lista = listaDoPayload(resposta.data);
            if (lista.length === 0) break;
            coletados.push(...lista);
            if (lista.length < 200) break;
          }
          if (coletados.length === 0) continue;
          for (const item of coletados) {
            const nome = texto(escolher(item, ["name", "nome", "description", "workplaceName"]));
            if (!nome) continue;
            const idBruto = escolher(item, ["id", "nextiId", "workplaceId", "code"]);
            const id = Number(idBruto);
            const cidade = texto(escolher(item, ["city", "cidade"]));
            const uf = texto(escolher(item, ["state", "uf", "estado"]));
            guardar({
              nextiId: Number.isFinite(id) ? id : null,
              nome,
              cliente: texto(escolher(item, ["clientName", "cliente", "customerName"])),
              localidade: [cidade, uf].filter(Boolean).join(" / ") || null,
            });
          }
          break;
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    if (encontrados.size === 0) {
      const { data: cache } = await ctx.supabase
        .from("nexti_workplaces")
        .select("nexti_id, name, city, state")
        .order("name", { ascending: true })
        .limit(5000);
      for (const p of (cache ?? []) as RecNexti[]) {
        const nome = texto(p["name"]);
        if (!nome) continue;
        const cidade = texto(p["city"]);
        const uf = texto(p["state"]);
        guardar({
          nextiId: Number(p["nexti_id"]) || null,
          nome,
          cliente: null,
          localidade: [cidade, uf].filter(Boolean).join(" / ") || null,
        });
      }
    }

    const postos = [...encontrados.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (postos.length > 0) return { ok: true, postos };
    return erro ? { ok: false, postos, erro } : { ok: false, postos };
  });

// ---------------------------------------------------------------------------
// Importação em lote de postos
// ---------------------------------------------------------------------------

export type ImportarLoteResultado = {
  ok: boolean;
  criados: number;
  repetidos: number;
  falhas: number;
  erro?: string;
};

const loteSchema = z.object({
  postos: z
    .array(
      z.object({
        nome: z.string().min(2),
        gerenteNome: z.string().min(2),
        localidade: z.string().optional(),
        cliente: z.string().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/** Cadastra vários postos de uma vez, já vinculados ao gerente de área. */
export const importarPostosMesaLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => loteSchema.parse(input))
  .handler(async ({ context, data }): Promise<ImportarLoteResultado> => {
    const vistos = new Set<string>();
    const linhas = data.postos
      .map((p) => ({
        nome: p.nome.trim(),
        gerente_nome: p.gerenteNome.trim(),
        localidade: p.localidade?.trim() || null,
        cliente: p.cliente?.trim() || null,
        created_by: context.userId,
      }))
      .filter((p) => {
        const chave = `${p.nome.toLowerCase()}|${p.gerente_nome.toLowerCase()}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });

    const { data: existentes } = await context.supabase
      .from("mesa_postos_servico")
      .select("nome, gerente_nome");
    const jaTem = new Set(
      (existentes ?? []).map(
        (e: { nome: string; gerente_nome: string }) =>
          `${e.nome.toLowerCase()}|${e.gerente_nome.toLowerCase()}`,
      ),
    );

    const novos = linhas.filter(
      (p) => !jaTem.has(`${p.nome.toLowerCase()}|${p.gerente_nome.toLowerCase()}`),
    );
    const repetidos = linhas.length - novos.length;

    let criados = 0;
    let falhas = 0;
    let ultimoErro: string | undefined;

    for (let i = 0; i < novos.length; i += 200) {
      const bloco = novos.slice(i, i + 200);
      const { data: inseridos, error } = await context.supabase
        .from("mesa_postos_servico")
        .insert(bloco)
        .select("id");
      if (error) {
        falhas += bloco.length;
        ultimoErro = error.message;
        continue;
      }
      criados += inseridos?.length ?? bloco.length;
    }

    if (criados === 0 && ultimoErro) {
      return { ok: false, criados, repetidos, falhas, erro: ultimoErro };
    }
    return { ok: true, criados, repetidos, falhas };
  });

// ---------------------------------------------------------------------------
// Conferência das folhas dos colaboradores (inconsistências da NEXTI)
// ---------------------------------------------------------------------------

export type ColaboradorPendente = {
  nome: string;
  motivos: string[];
  /** true quando o colaborador tem atestado lançado na NEXTI no dia. */
  atestado: boolean;
};

export type PendenciaFolhaPosto = {
  /** Nome do posto normalizado (sem acentos, maiúsculo). */
  chave: string;
  posto: string;
  total: number;
  /** Quantos colaboradores pendentes estão com atestado no dia. */
  comAtestado: number;
  colaboradores: ColaboradorPendente[];
};

export type FolhasMesaResultado = {
  ok: boolean;
  data: string;
  pendencias: PendenciaFolhaPosto[];
  total: number;
  erro?: string;
};

/** Normaliza nome de posto para comparação. */
export function chavePosto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const MOTIVOS: Record<string, string> = {
  NOT_REGISTERED: "Ausência de marcação (pedido de justificativa)",
  INVALID_TIME: "Horário inválido",
  DEVICE_NOT_AUTHORIZED: "Terminal não autorizado",
};

/**
 * Lista as folhas com pendência na NEXTI no dia (inconsistências ainda não
 * tratadas pela mesa e pedidos de justificativa), agrupadas por posto.
 */
export const listarFolhasPendentesMesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => dataSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<FolhasMesaResultado> => {
    const dia = data.data && /^\d{4}-\d{2}-\d{2}$/.test(data.data) ? data.data : hojeBrasilia();
    const [ano, mes, diaMes] = dia.split("-");
    const referenceDate = `${diaMes}${mes}${ano}`;

    try {
      const { loadConfig, normalizeBaseUrl, requestNexti } = await import("@/lib/nexti.functions");
      const config = await loadConfig((context as { supabase: unknown }).supabase);
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      // Nome dos postos da NEXTI (workplaceId -> nome)
      const nomePosto = new Map<number, string>();
      const { data: locais } = await context.supabase
        .from("nexti_workplaces")
        .select("nexti_id, name")
        .limit(5000);
      for (const l of (locais ?? []) as Array<{ nexti_id: number | null; name: string | null }>) {
        if (l.nexti_id != null && l.name) nomePosto.set(Number(l.nexti_id), l.name);
      }

      type Item = Record<string, unknown>;
      const itens: Item[] = [];
      for (let page = 0; page < 25; page++) {
        const resposta = await requestNexti({
          config,
          endpoint: "/api/clockings/inconsistencies",
          method: "GET",
          query: { referenceDate, page, size: 200 },
        });
        const payload = resposta.data as Record<string, unknown> | null;
        const lista = Array.isArray(payload?.["content"])
          ? (payload?.["content"] as Item[])
          : Array.isArray(payload)
            ? (payload as Item[])
            : [];
        itens.push(...lista);
        if (lista.length < 200 || payload?.["last"] === true) break;
      }

      // Quem tem atestado lançado na NEXTI no dia (para mostrar junto da folha pendente)
      const comAtestado = new Set<number>();
      const nomesComAtestado = new Set<string>();
      // Quem tem QUALQUER lançamento de ausência no dia (falta, atestado etc.) — esses não contam como "sem marcação"
      const comAusencia = new Set<number>();
      const nomesComAusencia = new Set<string>();
      try {
        const situacoesAtestado = new Set<number>();
        for (const endpoint of ["/absencesituations/all", "/api/absencesituations/all"]) {
          try {
            const resposta = await requestNexti({ config, endpoint, method: "GET" });
            const lista = listaDoPayload(resposta.data);
            for (const s of lista) {
              const nomeSit = String(escolher(s, ["name", "description", "nome"]) ?? "");
              const idSit = Number(escolher(s, ["id", "nextiId"]));
              if (!Number.isFinite(idSit)) continue;
              if (/ATESTADO|MEDIC/i.test(chavePosto(nomeSit))) situacoesAtestado.add(idSit);
            }
            if (lista.length) break;
          } catch {
            // tenta o próximo caminho
          }
        }

        const ini = `${diaMes}${mes}${ano}000000`;
        const fim = `${diaMes}${mes}${ano}235959`;
        let ausencias: RecNexti[] = [];
        for (const endpoint of [
          `/api/absences/start/${ini}/finish/${fim}`,
          `/absences/start/${ini}/finish/${fim}`,
        ]) {
          try {
            const resposta = await requestNexti({ config, endpoint, method: "GET" });
            ausencias = listaDoPayload(resposta.data);
            if (ausencias.length) break;
          } catch {
            // tenta o próximo caminho
          }
        }

        if (ausencias.length === 0) {
          const { data: base } = await context.supabase
            .from("nexti_absences")
            .select("person_id, absence_situation_id, start_date_time, finish_date_time, cid_code, removed")
            .lte("start_date_time", `${dia}T23:59:59Z`)
            .gte("finish_date_time", `${dia}T00:00:00Z`)
            .limit(5000);
          ausencias = ((base ?? []) as RecNexti[]).filter((a) => a["removed"] !== true);
        }

        for (const a of ausencias) {
          const idSit = Number(escolher(a, ["absenceSituationId", "absence_situation_id", "situationId"]));
          const cid = texto(escolher(a, ["cidCode", "cid_code"]));
          const nomeSit = String(escolher(a, ["absenceSituationName", "situationName", "name"]) ?? "");
          const ehAtestado =
            (Number.isFinite(idSit) && situacoesAtestado.has(idSit)) ||
            !!cid ||
            /ATESTADO|MEDIC/i.test(chavePosto(nomeSit));
          const idPessoa = Number(escolher(a, ["personId", "person_id", "idPerson"]));
          const nomePessoa = texto(escolher(a, ["personName", "person_name", "nome"]));
          // Qualquer lançamento (falta, atestado...) tira o colaborador da lista de "sem marcação"
          if (Number.isFinite(idPessoa)) comAusencia.add(idPessoa);
          if (nomePessoa) nomesComAusencia.add(chavePosto(nomePessoa));
          if (!ehAtestado) continue;
          if (Number.isFinite(idPessoa)) comAtestado.add(idPessoa);
          if (nomePessoa) nomesComAtestado.add(chavePosto(nomePessoa));
        }
      } catch {
        // sem atestados disponíveis, segue apenas com as inconsistências
      }

      // Quem tem QUALQUER marcação no dia (para achar quem não tem nenhuma)
      const comMarcacao = new Set<number>();
      const nomesComMarcacao = new Set<string>();
      try {
        const ini = `${diaMes}${mes}${ano}000000`;
        const fim = `${diaMes}${mes}${ano}235959`;
        for (const endpoint of [
          `/api/clockings/start/${ini}/finish/${fim}`,
          `/clockings/start/${ini}/finish/${fim}`,
        ]) {
          try {
            for (let page = 0; page < 40; page++) {
              const resposta = await requestNexti({
                config,
                endpoint,
                method: "GET",
                query: { page, size: 500 },
              });
              const lista = listaDoPayload(resposta.data);
              for (const m of lista) {
                const idPessoa = Number(escolher(m, ["personId", "person_id", "idPerson"]));
                if (Number.isFinite(idPessoa)) comMarcacao.add(idPessoa);
                const nomePessoa = texto(escolher(m, ["personName", "person_name", "nome"]));
                if (nomePessoa) nomesComMarcacao.add(chavePosto(nomePessoa));
              }
              if (lista.length < 500) break;
            }
            break;
          } catch {
            // tenta o próximo caminho
          }
        }
      } catch {
        // sem marcações disponíveis, segue apenas com as inconsistências
      }

      const mapa = new Map<string, PendenciaFolhaPosto>();
      for (const item of itens) {
        const idLocal = Number(item["workplaceId"] ?? 0);
        const nome =
          nomePosto.get(idLocal) ??
          (typeof item["workplaceName"] === "string" ? (item["workplaceName"] as string) : "") ??
          "";
        const posto = nome || "Sem posto identificado";
        const chave = chavePosto(posto);
        const tipo = String(item["clockingTypeName"] ?? "");
        const motivo = MOTIVOS[tipo] ?? tipo ?? "Inconsistência";
        const pessoa = String(item["personName"] ?? "Colaborador sem nome").trim();

        const idPessoa = Number(item["personId"]);
        const temAtestado =
          (Number.isFinite(idPessoa) && comAtestado.has(idPessoa)) ||
          nomesComAtestado.has(chavePosto(pessoa));

        const atual: PendenciaFolhaPosto = mapa.get(chave) ?? {
          chave,
          posto,
          total: 0,
          comAtestado: 0,
          colaboradores: [],
        };
        atual.total += 1;
        const existente = atual.colaboradores.find((c) => c.nome === pessoa);
        if (existente) {
          if (!existente.motivos.includes(motivo)) existente.motivos.push(motivo);
          if (temAtestado && !existente.atestado) {
            existente.atestado = true;
            atual.comAtestado += 1;
          }
        } else {
          atual.colaboradores.push({ nome: pessoa, motivos: [motivo], atestado: temAtestado });
          if (temAtestado) atual.comAtestado += 1;
        }
        mapa.set(chave, atual);
      }

      // Feriados do dia: se for feriado, ninguém entra como "sem marcação"
      let ehFeriado = false;
      try {
        for (const endpoint of ["/api/holidays/all", "/holidays/all"]) {
          try {
            const resposta = await requestNexti({ config, endpoint, method: "GET" });
            const lista = listaDoPayload(resposta.data);
            for (const h of lista) {
              const dataBruta = texto(escolher(h, ["date", "dateTime", "day", "data", "holidayDate"]));
              const diaNum = Number(escolher(h, ["day", "dia"]));
              const mesNum = Number(escolher(h, ["month", "mes"]));
              const anoNum = Number(escolher(h, ["year", "ano"]));
              if (dataBruta && dataBruta.slice(0, 10) === dia) ehFeriado = true;
              if (!ehFeriado && Number.isFinite(diaNum) && Number.isFinite(mesNum)) {
                const mesmoDiaMes = diaNum === Number(diaMes) && mesNum === Number(mes);
                const mesmoAno = !Number.isFinite(anoNum) || anoNum === 0 || anoNum === Number(ano);
                if (mesmoDiaMes && mesmoAno) ehFeriado = true;
              }
              if (ehFeriado) break;
            }
            if (lista.length || ehFeriado) break;
          } catch {
            // tenta o próximo caminho
          }
        }
      } catch {
        // sem feriados disponíveis, segue a verificação normal
      }

      // Colaboradores ativos sem NENHUMA marcação no dia (ignora feriado e quem tem lançamento de falta/atestado)
      if (!ehFeriado && (comMarcacao.size > 0 || nomesComMarcacao.size > 0)) {
        const tamanho = 1000;
        for (let pagina = 0; pagina < 20; pagina++) {
          const { data: pessoas } = await context.supabase
            .from("nexti_persons")
            .select("nexti_id, nome, demission_date, workplace_id, workplace_name")
            .is("demission_date", null)
            .range(pagina * tamanho, pagina * tamanho + tamanho - 1);
          const linhas = (pessoas ?? []) as Array<Record<string, unknown>>;
          for (const p of linhas) {
            const idPessoa = Number(p["nexti_id"]);
            const nome = texto(p["nome"]) || "Colaborador sem nome";
            const temMarcacao =
              (Number.isFinite(idPessoa) && comMarcacao.has(idPessoa)) ||
              nomesComMarcacao.has(chavePosto(nome));
            if (temMarcacao) continue;
            // Tem lançamento de falta/atestado no dia: não conta como pendência
            const temAusencia =
              (Number.isFinite(idPessoa) && comAusencia.has(idPessoa)) ||
              nomesComAusencia.has(chavePosto(nome));
            if (temAusencia) continue;
            const idLocal = Number(p["workplace_id"] ?? 0);
            const posto =
              (idLocal ? nomePosto.get(idLocal) : undefined) ??
              texto(p["workplace_name"]) ??
              "Sem posto identificado";
            const chave = chavePosto(posto || "Sem posto identificado");
            const atual: PendenciaFolhaPosto = mapa.get(chave) ?? {
              chave,
              posto: posto || "Sem posto identificado",
              total: 0,
              comAtestado: 0,
              colaboradores: [],
            };
            if (atual.colaboradores.some((c) => chavePosto(c.nome) === chavePosto(nome))) continue;
            const temAtestado =
              (Number.isFinite(idPessoa) && comAtestado.has(idPessoa)) ||
              nomesComAtestado.has(chavePosto(nome));
            const dataFormatada = dia ? new Date(`${dia}T00:00:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }) : "hoje";
            atual.total += 1;
            atual.colaboradores.push({
              nome,
              motivos: [`Sem nenhuma marcação em ${dataFormatada}`],
              atestado: temAtestado,
            });
            if (temAtestado) atual.comAtestado += 1;
            mapa.set(chave, atual);
          }
          if (linhas.length < tamanho) break;
        }
      }

      const pendencias = [...mapa.values()].sort((a, b) => b.total - a.total);
      return { ok: true, data: dia, pendencias, total: itens.length };
    } catch (error) {
      return {
        ok: false,
        data: dia,
        pendencias: [],
        total: 0,
        erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
      };
    }
  });
