import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

/**
 * Flag "Permite marcação mobile" do cadastro de pessoas da NEXTI
 * (campo allowMobileClocking em /api/persons/{id}).
 */
export type PermiteMobilePessoa = {
  nome: string;
  personId: number | null;
  matricula: string;
  empresa: string;
  permiteMobile: boolean | null;
  erro?: string;
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extrairValor(data: unknown): Record<string, unknown> | null {
  if (!isRec(data)) return null;
  if (isRec(data["value"])) return data["value"];
  return data;
}

async function detalhePessoa(config: Awaited<ReturnType<typeof loadConfig>>, personId: number) {
  const res = await requestNexti({ config, endpoint: `/api/persons/${personId}`, method: "GET" });
  return extrairValor(res.data);
}

async function listarPessoas(config: Awaited<ReturnType<typeof loadConfig>>, termo: string) {
  const res = await requestNexti({
    config,
    endpoint: "/api/persons/all",
    method: "GET",
    query: { page: 0, size: 100, ...(termo ? { filter: termo } : {}) },
  });
  const data = res.data;
  const lista = isRec(data) && Array.isArray(data["content"]) ? (data["content"] as unknown[]) : [];
  return lista.filter(isRec);
}

/** Lê a flag "Permite marcação mobile" de uma lista de colaboradores (por nome). */
export const consultarPermiteMobile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nomes: string[] }) => ({
    nomes: Array.isArray(input?.nomes)
      ? input.nomes
          .map((n) => String(n ?? "").trim())
          .filter(Boolean)
          .slice(0, 60)
      : [],
  }))
  .handler(
    async ({ data }): Promise<{ ok: boolean; pessoas: PermiteMobilePessoa[]; erro?: string }> => {
      try {
        const config = await loadConfig();
        config.baseUrl = normalizeBaseUrl(config.baseUrl);
        const pessoas: PermiteMobilePessoa[] = [];

        for (const nome of data.nomes) {
          try {
            const encontrados = await listarPessoas(config, nome);
            const alvo =
              encontrados.find((p) => normalizar(String(p["name"] ?? "")) === normalizar(nome)) ??
              encontrados[0];
            if (!alvo) {
              pessoas.push({
                nome,
                personId: null,
                matricula: "",
                empresa: "",
                permiteMobile: null,
                erro: "Colaborador não encontrado na NEXTI.",
              });
              continue;
            }
            const personId = Number(alvo["id"]);
            const detalhe = (await detalhePessoa(config, personId).catch(() => null)) ?? alvo;
            pessoas.push({
              nome: String(detalhe["name"] ?? alvo["name"] ?? nome),
              personId: Number.isFinite(personId) ? personId : null,
              matricula: String(detalhe["enrolment"] ?? alvo["enrolment"] ?? ""),
              empresa: String(detalhe["externalCompanyId"] ?? alvo["externalCompanyId"] ?? ""),
              permiteMobile: detalhe["allowMobileClocking"] === true,
            });
          } catch (error) {
            pessoas.push({
              nome,
              personId: null,
              matricula: "",
              empresa: "",
              permiteMobile: null,
              erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
            });
          }
        }

        return { ok: true, pessoas };
      } catch (error) {
        return {
          ok: false,
          pessoas: [],
          erro: error instanceof Error ? error.message : "Falha ao consultar a NEXTI.",
        };
      }
    },
  );

/** Desliga (ou religa) a flag "Permite marcação mobile" de um colaborador na NEXTI. */
export const definirPermiteMobile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personId: number; permitir?: boolean }) => ({
    personId: Number(input?.personId),
    permitir: input?.permitir === true,
  }))
  .handler(
    async ({ data }): Promise<{ ok: boolean; permiteMobile: boolean | null; erro?: string }> => {
      if (!Number.isFinite(data.personId) || data.personId <= 0) {
        return { ok: false, permiteMobile: null, erro: "Colaborador inválido." };
      }
      try {
        const config = await loadConfig();
        config.baseUrl = normalizeBaseUrl(config.baseUrl);
        const atual = await detalhePessoa(config, data.personId);
        if (!atual) return { ok: false, permiteMobile: null, erro: "Cadastro não encontrado." };

        const res = await requestNexti({
          config,
          endpoint: `/api/persons/${data.personId}`,
          method: "PUT",
          body: { ...atual, allowMobileClocking: data.permitir },
        });
        const valor = extrairValor(res.data);
        return {
          ok: true,
          permiteMobile: valor ? valor["allowMobileClocking"] === true : data.permitir,
        };
      } catch (error) {
        return {
          ok: false,
          permiteMobile: null,
          erro: error instanceof Error ? error.message : "Falha ao atualizar na NEXTI.",
        };
      }
    },
  );
