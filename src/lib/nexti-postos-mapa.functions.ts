/**
 * POSTOS DE SERVIÇO no mapa.
 *
 * `listarPostosMapa` devolve os postos já importados (com endereço completo e
 * coordenadas) e `sincronizarPostosNexti` busca de novo tudo na API da NEXTI,
 * atualizando endereço, bairro, CEP, cidade/UF, telefone e coordenadas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, type NextiConfig } from "@/lib/nexti.functions";
import { garantirPostos } from "@/lib/nexti-visitas.functions";

export interface PostoMapa {
  id: number;
  nome: string;
  cliente: string | null;
  empresa: string | null;
  enderecoCompleto: string;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  responsavel: string | null;
  ativo: boolean | null;
  /** true quando o posto é de turno noturno (NEXTI). */
  noturno: boolean;
  /** true quando o posto já foi encerrado na NEXTI (não vai para o mapa). */
  encerrado: boolean;
  /** true quando o posto é identificado como "TS" (não vai para o mapa). */
  ts: boolean;
  /** true quando o posto é identificado como "FGR" (não vai para o mapa). */
  fgr: boolean;
  /** true quando o posto é identificado como reserva/departamento pessoal/INSS/etc. */
  restrito: boolean;
  latitude: number | null;
  longitude: number | null;
}

type LinhaPosto = {
  nexti_id: number;
  name: string | null;
  client_name: string | null;
  company_name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  address_number: string | null;
  district: string | null;
  zip_code: string | null;
  phone: string | null;
  manager_name: string | null;
  department: string | null;
  cost_center: string | null;
  active: boolean | null;
  finish_date: string | null;
  closing_reason: string | null;
  latitude: number | null;
  longitude: number | null;
};

const COLUNAS =
  "nexti_id,name,client_name,company_name,city,state,address,address_number,district,zip_code,phone,manager_name,department,cost_center,active,finish_date,closing_reason,latitude,longitude";

function montarEndereco(l: LinhaPosto): string {
  const rua = [l.address, l.address_number].filter(Boolean).join(", ");
  return [rua, l.district, [l.city, l.state].filter(Boolean).join(" - "), l.zip_code]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * REGRA: posto noturno.
 * A NEXTI identifica o turno no nome do posto / serviço / departamento
 * ("NOTURNO", "NOITE", "12x36 NOTURNO" etc.).
 */
const PADRAO_NOTURNO = /NOTURN|NOITE/i;

export function ehPostoNoturno(textos: (string | null | undefined)[]): boolean {
  return PADRAO_NOTURNO.test(textos.filter(Boolean).join(" "));
}

/**
 * REGRA: posto identificado como "TS" (ex.: "TS", "TS 01", "POSTO TS-2")
 * nunca aparece no mapa.
 */
const PADRAO_TS = /(^|[^A-Z0-9])TS\d*([^A-Z0-9]|$)/i;

export function ehPostoTs(textos: (string | null | undefined)[]): boolean {
  return PADRAO_TS.test(textos.filter(Boolean).join(" "));
}

/**
 * REGRA: posto identificado como "FGR" (ex.: "FGR", "FGR-01", "POSTO FGR 2")
 * nunca aparece no mapa.
 */
const PADRAO_FGR = /(^|[^A-Z0-9])FGR\d*([^A-Z0-9]|$)/i;

export function ehPostoFgr(textos: (string | null | undefined)[]): boolean {
  return PADRAO_FGR.test(textos.filter(Boolean).join(" "));
}

/**
 * REGRA: postos de uso interno/administrativo (RESERVA, DEPARTAMENTO PESSOAL,
 * INSS, DESAPARECIDOS, MATERNIDADE, JATISTA) nunca aparecem no mapa.
 */
const PADRAO_RESTRITO = /RESERVA|DEPARTAMENTO PESSOAL|INSS|DESAPARECIDOS|MATERNIDADE|JATISTA/i;

export function ehPostoRestrito(textos: (string | null | undefined)[]): boolean {
  return PADRAO_RESTRITO.test(textos.filter(Boolean).join(" "));
}

/**
 * REGRA: posto encerrado na NEXTI não aparece no mapa.
 * A NEXTI marca o encerramento de três formas: `active = false`,
 * `finishDate` já vencida ou motivo de encerramento preenchido.
 */
export function ehPostoEncerrado(l: {
  active: boolean | null;
  finish_date: string | null;
  closing_reason: string | null;
}): boolean {
  if (l.active === false) return true;
  if (l.closing_reason && l.closing_reason.trim().length > 0) return true;
  if (l.finish_date) {
    const fim = new Date(`${l.finish_date}T23:59:59`);
    if (!Number.isNaN(fim.getTime()) && fim.getTime() < Date.now()) return true;
  }
  return false;
}

/** REGRA: posto encerrado, noturno ativado, "TS", "FGR" ou uso restrito não é exibido no mapa. */
export function ocultarNoMapa(p: PostoMapa): boolean {
  if (p.encerrado) return true;
  if (p.ts) return true;
  if (p.fgr) return true;
  if (p.restrito) return true;
  return p.noturno && p.ativo !== false;
}

/** REGRA: apenas postos dessas empresas aparecem no mapa. */
const EMPRESAS_PERMITIDAS = [
  "TEKTRON CONSERVACAO E LIMPEZA LTDA",
  "GYN CONSERVACAO E LIMPEZA LTDA",
  "TEKTRON ADMINISTRACAO E SERVICOS LTDA",
  "TEKTRON SERVICOS LIMPEZA E CONSERVACAO LTDA",
  "PLANALTO CENTRAL LIMPEZA E CONSERVACAO LTDA",
];

function normalizarNomeEmpresa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/gi, "c")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function empresaPermitidaNoMapa(p: PostoMapa): boolean {
  // A NEXTI grava a empresa em campos diferentes conforme o contrato, por isso
  // a comparação considera empresa, cliente e o nome do posto.
  const textos = [p.empresa, p.cliente, p.nome].filter(Boolean).join(" ");
  if (!textos) return false;
  const normalizada = normalizarNomeEmpresa(textos);
  // TEKTRON SEGURANÇA (e variações) nunca entra no mapa.
  if (normalizada.includes("TEKTRON") && normalizada.includes("SEGURANCA")) return false;
  return EMPRESAS_PERMITIDAS.some((e) => normalizada.includes(normalizarNomeEmpresa(e)));
}

/**
 * Aplica a regra das empresas permitidas. Quando a NEXTI não informa a empresa
 * nos postos (a maioria vem sem esse dado), o filtro deixaria o mapa vazio —
 * nesse caso todos os postos são mantidos para o mapa continuar mostrando os
 * pontos de serviço.
 */
export function filtrarEmpresasPermitidas(postos: PostoMapa[]): PostoMapa[] {
  const permitidos = postos.filter(empresaPermitidaNoMapa);
  // Precisa reconhecer a empresa em pelo menos metade dos postos para valer
  // como filtro; abaixo disso o dado é incompleto e o mapa mostra todos.
  if (permitidos.length * 2 < postos.length) return postos;
  return permitidos;
}

function paraPosto(l: LinhaPosto): PostoMapa {
  return {
    id: Number(l.nexti_id),
    nome: (l.name ?? `Posto ${l.nexti_id}`).trim(),
    cliente: l.client_name,
    empresa: l.company_name,
    enderecoCompleto: montarEndereco(l),
    cidade: l.city,
    uf: l.state,
    bairro: l.district,
    cep: l.zip_code,
    telefone: l.phone,
    responsavel: l.manager_name,
    ativo: l.active,
    encerrado: ehPostoEncerrado(l),
    noturno: ehPostoNoturno([l.name, l.department, l.cost_center]),
    ts: ehPostoTs([l.name, l.department, l.cost_center]),
    fgr: ehPostoFgr([l.name, l.department, l.cost_center]),
    restrito: ehPostoRestrito([l.name, l.department, l.cost_center]),
    latitude: l.latitude === null ? null : Number(l.latitude),
    longitude: l.longitude === null ? null : Number(l.longitude),
  };
}

/** Lista todos os postos de serviço registrados na NEXTI. */
export const listarPostosMapa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostoMapa[]> => {
    const { supabase } = context;
    const postos: PostoMapa[] = [];
    const passo = 1000;
    for (let inicio = 0; inicio < 20000; inicio += passo) {
      const { data, error } = await supabase
        .from("nexti_workplaces")
        .select(COLUNAS)
        .order("name", { ascending: true })
        .range(inicio, inicio + passo - 1);
      if (error) throw new Error("Não foi possível carregar os postos de serviço.");
      const lote = (data ?? []) as unknown as LinhaPosto[];
      postos.push(...lote.map(paraPosto));
      if (lote.length < passo) break;
    }
    return postos;
  });

/** Rebusca na API da NEXTI todos os postos e endereços completos. */
export const sincronizarPostosNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; total: number; comCoordenadas: number; erro?: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try {
        const bruta = await loadConfig((context as { supabase: unknown }).supabase);
        const config: NextiConfig = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
        const linhas = await garantirPostos(config, supabaseAdmin as never);
        const comCoordenadas = linhas.filter(
          (l) => l["latitude"] !== null && l["longitude"] !== null,
        ).length;
        return { ok: true, total: linhas.length, comCoordenadas };
      } catch (error) {
        return {
          ok: false,
          total: 0,
          comCoordenadas: 0,
          erro:
            error instanceof Error
              ? error.message
              : "Falha ao buscar os postos de serviço na NEXTI.",
        };
      }
    },
  );
