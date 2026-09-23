/**
 * IMPORTAÇÃO DE POSTOS VIA PLANILHA EXCEL (arquivo = fonte principal).
 *
 * A planilha manda: para cada posto encontrado nas 5 empresas autorizadas,
 * comparamos EMPRESA e VAGAS com o que está na API da NEXTI. Primeiro é
 * gerada uma prévia (o que está errado na NEXTI) e só depois a correção.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Empresas aceitas na planilha (nomes oficiais na NEXTI). */
export const EMPRESAS_PLANILHA = [
  "TEKTRON CONSERVACAO E LIMPEZA LTDA",
  "TEKTRON SERVICOS LIMPEZA E CONSERVACAO LTDA",
  "GYN CONSERVACAO E LIMPEZA LTDA",
  "PLANALTO CENTRAL LIMPEZA E CONSERVACAO LTDA",
  "TEKTRON ADMINISTRACAO E SERVICOS LTDA",
] as const;

export type LinhaPlanilhaPosto = {
  posto: string;
  empresa: string;
  vagas: number | null;
};

export type DivergenciaPosto = {
  posto: string;
  nextiId: number | null;
  /** "empresa" | "vagas" | "ambos" | "semelhante" | "nao_encontrado" */
  tipo: "empresa" | "vagas" | "ambos" | "semelhante" | "nao_encontrado";
  empresaPlanilha: string;
  empresaNexti: string | null;
  vagasPlanilha: number | null;
  vagasNexti: number | null;
  /** Nome do posto parecido encontrado na NEXTI (quando não houve nome igual). */
  postoNexti?: string;
  /** 0 a 100 — quanto o nome da planilha parece com o nome da NEXTI. */
  semelhanca?: number;
};

export type PreviaPostosExcel = {
  ok: boolean;
  erro?: string;
  totalLinhas: number;
  conferidos: number;
  divergencias: DivergenciaPosto[];
};

export type CorrecaoPostosExcel = {
  ok: boolean;
  erro?: string;
  corrigidos: number;
  falhas: { posto: string; erro: string }[];
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

function texto(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (ehRec(v)) {
    const nome = escolher(v, ["name", "nome", "description", "fantasyName", "companyName"]);
    if (typeof nome === "string") return nome.trim() || null;
  }
  return null;
}

/** Comparação tolerante: sem acento, sem pontuação, maiúsculo. */
export function chaveNome(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Distância de edição (Levenshtein) entre dois textos já normalizados. */
function distancia(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0] as number;
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j] as number;
      linha[j] = Math.min(
        (linha[j] as number) + 1,
        (linha[j - 1] as number) + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = temp;
    }
  }
  return linha[b.length] as number;
}

/** 0 a 100: mistura de palavras em comum com a semelhança letra a letra. */
export function semelhancaNome(a: string, b: string): number {
  const x = chaveNome(a);
  const y = chaveNome(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const px = new Set(x.split(" ").filter((p) => p.length > 2));
  const py = new Set(y.split(" ").filter((p) => p.length > 2));
  let comuns = 0;
  for (const p of px) if (py.has(p)) comuns += 1;
  const palavras = px.size && py.size ? (2 * comuns) / (px.size + py.size) : 0;
  const letras = 1 - distancia(x, y) / Math.max(x.length, y.length);
  return Math.round((palavras * 0.6 + Math.max(0, letras) * 0.4) * 100);
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

async function configNexti() {
  const { loadConfig, normalizeBaseUrl } = await import("@/lib/nexti.functions");
  const bruta = await loadConfig();
  return { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
}

async function buscarTudo(config: unknown, endpoints: string[]): Promise<Rec[]> {
  const { requestNexti } = await import("@/lib/nexti.functions");
  for (const endpoint of endpoints) {
    try {
      const acumulado: Rec[] = [];
      for (let page = 0; page < 40; page++) {
        const resposta = await requestNexti({
          config: config as never,
          endpoint,
          method: "GET",
          query: { page, size: 200 },
        });
        const lista = listaDoPayload(resposta.data);
        if (lista.length === 0) break;
        acumulado.push(...lista);
        if (lista.length < 200) break;
      }
      if (acumulado.length > 0) return acumulado;
    } catch {
      // tenta o próximo endpoint
    }
  }
  return [];
}

const ENDPOINTS_POSTOS = ["/api/workplaces/all", "/workplaces/all", "/api/workplace/all"];

/** Gera a prévia comparando a planilha com a API da NEXTI (nada é alterado). */
export const analisarPostosExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linhas: LinhaPlanilhaPosto[] }) => data)
  .handler(async ({ data }): Promise<PreviaPostosExcel> => {
    const linhas = (data.linhas ?? []).filter((l) => (l.posto ?? "").trim().length > 0);
    if (linhas.length === 0) {
      return { ok: false, erro: "Nenhuma linha válida na planilha.", totalLinhas: 0, conferidos: 0, divergencias: [] };
    }

    let config;
    try {
      config = await configNexti();
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Configuração da NEXTI indisponível.",
        totalLinhas: linhas.length,
        conferidos: 0,
        divergencias: [],
      };
    }

    const postos = await buscarTudo(config, ENDPOINTS_POSTOS);
    if (postos.length === 0) {
      return {
        ok: false,
        erro: "A API da NEXTI não retornou postos de serviço.",
        totalLinhas: linhas.length,
        conferidos: 0,
        divergencias: [],
      };
    }

    // A NEXTI só devolve `companyId` no posto; o nome da empresa vem da lista
    // de empresas. Sem esse mapa a comparação usaria o nome do cliente.
    const empresasNexti = await buscarTudo(config, [
      "/api/companies/all",
      "/companies/all",
      "/api/company/all",
    ]);
    const empresaPorId = new Map<number, string>();
    for (const e of empresasNexti) {
      const id = Number(escolher(e, ["id", "companyId", "nextiId"]));
      const nome = texto(escolher(e, ["companyName", "name", "razaoSocial", "fantasyName"]));
      if (Number.isFinite(id) && nome) empresaPorId.set(id, nome);
    }
    const empresaDoPosto = (p: Rec): string | null => {
      const cid = Number(escolher(p, ["companyId"]));
      if (Number.isFinite(cid) && empresaPorId.has(cid)) return empresaPorId.get(cid) ?? null;
      return texto(escolher(p, ["companyName", "company", "empresa"]));
    };

    const porNome = new Map<string, Rec>();
    const nomesNexti: { nome: string; posto: Rec }[] = [];
    for (const p of postos) {
      const nome = texto(escolher(p, ["name", "nome", "description", "workplaceName"]));
      if (!nome) continue;
      porNome.set(chaveNome(nome), p);
      nomesNexti.push({ nome, posto: p });
    }


    const divergencias: DivergenciaPosto[] = [];
    let conferidos = 0;

    for (const linha of linhas) {
      const alvo = porNome.get(chaveNome(linha.posto));
      if (!alvo) {
        // Nome exato não existe: procuramos o posto mais parecido na NEXTI.
        let melhor: { nome: string; posto: Rec; nota: number } | null = null;
        for (const item of nomesNexti) {
          const nota = semelhancaNome(linha.posto, item.nome);
          if (nota >= 70 && (!melhor || nota > melhor.nota)) {
            melhor = { nome: item.nome, posto: item.posto, nota };
          }
        }
        if (melhor) {
          const idP = Number(escolher(melhor.posto, ["id", "nextiId", "workplaceId"]));
          const vagasBrutoP = escolher(melhor.posto, [
            "vacantJob",
            "vacantJobs",
            "vagas",
            "vacancy",
            "vacancies",
          ]);
          divergencias.push({
            posto: linha.posto,
            nextiId: Number.isFinite(idP) ? idP : null,
            tipo: "semelhante",
            empresaPlanilha: linha.empresa,
            empresaNexti: empresaDoPosto(melhor.posto),
            vagasPlanilha: linha.vagas,
            vagasNexti: Number.isFinite(Number(vagasBrutoP)) ? Number(vagasBrutoP) : 0,
            postoNexti: melhor.nome,
            semelhanca: melhor.nota,
          });
          continue;
        }
        divergencias.push({
          posto: linha.posto,
          nextiId: null,
          tipo: "nao_encontrado",
          empresaPlanilha: linha.empresa,
          empresaNexti: null,
          vagasPlanilha: linha.vagas,
          vagasNexti: null,
        });
        continue;
      }
      conferidos += 1;
      const id = Number(escolher(alvo, ["id", "nextiId", "workplaceId"]));
      const empresaNexti = empresaDoPosto(alvo);
      const vagasBruto = escolher(alvo, ["vacantJob", "vacantJobs", "vagas", "vacancy", "vacancies"]);
      const vagasNexti = Number.isFinite(Number(vagasBruto)) ? Number(vagasBruto) : 0;

      const empresaErrada =
        linha.empresa.trim().length > 0 && chaveNome(empresaNexti) !== chaveNome(linha.empresa);
      const vagasErradas = linha.vagas != null && linha.vagas !== vagasNexti;

      if (!empresaErrada && !vagasErradas) continue;
      divergencias.push({
        posto: texto(escolher(alvo, ["name", "nome"])) ?? linha.posto,
        nextiId: Number.isFinite(id) ? id : null,
        tipo: empresaErrada && vagasErradas ? "ambos" : empresaErrada ? "empresa" : "vagas",
        empresaPlanilha: linha.empresa,
        empresaNexti,
        vagasPlanilha: linha.vagas,
        vagasNexti,
      });
    }

    return { ok: true, totalLinhas: linhas.length, conferidos, divergencias };
  });

/** Aplica na NEXTI as correções aprovadas na prévia (empresa e/ou vagas). */
export const corrigirPostosExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { itens: { nextiId: number; posto: string; empresa?: string; vagas?: number | null }[] }) =>
      data,
  )
  .handler(async ({ data }): Promise<CorrecaoPostosExcel> => {
    const itens = (data.itens ?? []).filter((i) => Number.isFinite(i.nextiId));
    if (itens.length === 0) return { ok: false, erro: "Nada para corrigir.", corrigidos: 0, falhas: [] };

    let config;
    try {
      config = await configNexti();
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Configuração da NEXTI indisponível.",
        corrigidos: 0,
        falhas: [],
      };
    }

    const { requestNexti } = await import("@/lib/nexti.functions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const postos = await buscarTudo(config, ENDPOINTS_POSTOS);
    const porId = new Map<number, Rec>();
    for (const p of postos) {
      const id = Number(escolher(p, ["id", "nextiId", "workplaceId"]));
      if (Number.isFinite(id)) porId.set(id, p);
    }

    const empresas = await buscarTudo(config, ["/api/companies/all", "/companies/all", "/api/company/all"]);
    const empresaPorNome = new Map<string, { id: number; nome: string }>();
    for (const e of empresas) {
      const nome = texto(escolher(e, ["name", "nome", "companyName", "fantasyName"]));
      const id = Number(escolher(e, ["id", "companyId", "nextiId"]));
      if (nome && Number.isFinite(id)) empresaPorNome.set(chaveNome(nome), { id, nome });
    }

    const falhas: { posto: string; erro: string }[] = [];
    let corrigidos = 0;

    for (const item of itens) {
      const original = porId.get(item.nextiId);
      if (!original) {
        falhas.push({ posto: item.posto, erro: "Posto não encontrado na NEXTI." });
        continue;
      }
      const corpo: Rec = { ...original };
      if (item.empresa && item.empresa.trim()) {
        const empresa = empresaPorNome.get(chaveNome(item.empresa));
        if (!empresa) {
          falhas.push({ posto: item.posto, erro: `Empresa "${item.empresa}" não existe na NEXTI.` });
          continue;
        }
        corpo["companyId"] = empresa.id;
        corpo["companyName"] = empresa.nome;
      }
      if (item.vagas != null) corpo["vacantJob"] = item.vagas;

      let enviado = false;
      let ultimoErro = "";
      for (const endpoint of [`/api/workplaces/${item.nextiId}`, `/workplaces/${item.nextiId}`]) {
        try {
          await requestNexti({ config: config as never, endpoint, method: "PUT", body: corpo });
          enviado = true;
          break;
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
        }
      }

      if (!enviado) {
        falhas.push({ posto: item.posto, erro: ultimoErro || "Falha ao atualizar na NEXTI." });
        continue;
      }

      corrigidos += 1;
      await supabaseAdmin
        .from("nexti_workplaces")
        .update({
          ...(corpo["companyName"] ? { company_name: String(corpo["companyName"]) } : {}),
          ...(item.vagas != null ? { vacant_job: item.vagas } : {}),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("nexti_id", item.nextiId);
    }

    return { ok: falhas.length === 0, corrigidos, falhas };
  });
