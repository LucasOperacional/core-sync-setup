import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

export type EmpresaNexti = {
  id: number;
  nome: string;
  cnpj: string | null;
  ativo: boolean | null;
};

export type ListarEmpresasResultado = {
  ok: boolean;
  empresas: EmpresaNexti[];
  endpoint?: string;
  erro?: string;
};

type Rec = Record<string, unknown>;

const ENDPOINTS = ["/api/companies/all", "/companies/all", "/api/company/all"];
const PAGE_SIZE = 200;
const MAX_PAGES = 30;

function isRec(valor: unknown): valor is Rec {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function pick(obj: Rec, chaves: string[]): unknown {
  const mapa = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const chave of chaves) {
    const real = mapa.get(chave.toLowerCase());
    if (!real) continue;
    const valor = obj[real];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

function texto(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return "";
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) {
    return Number(valor);
  }
  if (isRec(valor)) return numero(pick(valor, ["id", "nextiId", "code"]));
  return null;
}

function booleano(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") {
    const v = valor.trim().toLowerCase();
    if (["true", "sim", "s", "1", "ativo", "active"].includes(v)) return true;
    if (["false", "nao", "não", "n", "0", "inativo"].includes(v)) return false;
  }
  return null;
}

function extrairLista(payload: unknown): Rec[] {
  if (Array.isArray(payload)) return payload.filter(isRec);
  if (!isRec(payload)) return [];
  for (const chave of [
    "content",
    "data",
    "items",
    "list",
    "records",
    "result",
    "results",
    "rows",
  ]) {
    const valor = payload[chave];
    if (Array.isArray(valor)) return valor.filter(isRec);
    if (isRec(valor)) {
      const aninhado = extrairLista(valor);
      if (aninhado.length > 0) return aninhado;
    }
  }
  return [];
}

/**
 * Lista as empresas (companies) cadastradas na NEXTI, usadas no template de
 * férias da página de folhas. Tenta os caminhos conhecidos da API e devolve uma
 * mensagem clara quando nenhum deles responde.
 */
export const listarEmpresasNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListarEmpresasResultado> => {
    const ctx = context as { supabase?: unknown };

    let config: Awaited<ReturnType<typeof loadConfig>>;
    try {
      const bruto = await loadConfig(ctx.supabase);
      config = { ...bruto, baseUrl: normalizeBaseUrl(bruto.baseUrl) };
    } catch (error) {
      return {
        ok: false,
        empresas: [],
        erro: error instanceof Error ? error.message : "Configuração da NEXTI indisponível.",
      };
    }

    let ultimoErro = "Nenhum endpoint de empresas respondeu.";

    for (const endpoint of ENDPOINTS) {
      const itens: Rec[] = [];
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const resposta = await requestNexti({
            config,
            endpoint,
            method: "GET",
            query: { page, size: PAGE_SIZE },
          });
          const lista = extrairLista(resposta.data);
          if (lista.length === 0) break;
          itens.push(...lista);
          if (lista.length < PAGE_SIZE) break;
        }
      } catch (error) {
        ultimoErro = error instanceof Error ? error.message : String(error);
        continue;
      }

      const mapa = new Map<number, EmpresaNexti>();
      for (const item of itens) {
        const id = numero(pick(item, ["id", "nextiId", "code", "codigo"]));
        const nome = texto(
          pick(item, [
            "fantasyName",
            "tradeName",
            "name",
            "nome",
            "corporateName",
            "razaoSocial",
            "description",
          ]),
        );
        if (id === null || !nome) continue;
        mapa.set(id, {
          id,
          nome,
          cnpj: texto(pick(item, ["cnpj", "federalTaxNumber", "document", "cpfCnpj"])) || null,
          ativo: booleano(pick(item, ["active", "ativo", "enabled"])),
        });
      }

      if (mapa.size === 0) continue;

      return {
        ok: true,
        endpoint,
        empresas: [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      };
    }

    return {
      ok: false,
      empresas: [],
      erro: `Não foi possível carregar as empresas na NEXTI. ${ultimoErro}`,
    };
  });
