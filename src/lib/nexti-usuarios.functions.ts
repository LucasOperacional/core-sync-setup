import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti } from "@/lib/nexti.functions";

/** Cadastro de colaboradores na NEXTI (POST /api/persons). */

export type OpcaoNexti = { id: number; nome: string; externalId?: string };

export type OpcoesCadastroNexti = {
  empresas: OpcaoNexti[];
  cargos: OpcaoNexti[];
  postos: OpcaoNexti[];
  escalas: OpcaoNexti[];
};

export type PessoaCadastro = {
  nome: string;
  cpf: string;
  pis?: string;
  matricula?: string;
  email?: string;
  genero?: string;
  nascimento?: string;
  admissao?: string;
  empresa?: string;
  cargo?: string;
  posto?: string;
  escala?: string;
  mae?: string;
  pai?: string;
  rg?: string;
};

export type ResultadoCadastro = {
  nome: string;
  ok: boolean;
  personId: number | null;
  mensagem: string;
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function soDigitos(v: string): string {
  return String(v ?? "").replace(/\D+/g, "");
}

/** Converte 01/02/2024, 2024-02-01 ou 01022024 para ddMMyyyyHHmmss. */
function dataNexti(valor?: string): string | undefined {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return undefined;
  let d = "";
  let m = "";
  let a = "";
  const br = bruto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (br) {
    d = br[1]!.padStart(2, "0");
    m = br[2]!.padStart(2, "0");
    a = br[3]!;
  } else if (iso) {
    a = iso[1]!;
    m = iso[2]!;
    d = iso[3]!;
  } else {
    const dig = soDigitos(bruto);
    if (dig.length >= 8) {
      d = dig.slice(0, 2);
      m = dig.slice(2, 4);
      a = dig.slice(4, 8);
    } else {
      return undefined;
    }
  }
  return `${d}${m}${a}000000`;
}

async function listarTudo(
  config: Awaited<ReturnType<typeof loadConfig>>,
  endpoint: string,
): Promise<Record<string, unknown>[]> {
  const itens: Record<string, unknown>[] = [];
  for (let page = 0; page < 30; page++) {
    const res = await requestNexti({
      config,
      endpoint,
      method: "GET",
      query: { page, size: 200 },
    });
    const data = res.data;
    const lista =
      isRec(data) && Array.isArray(data["content"]) ? (data["content"] as unknown[]) : [];
    itens.push(...lista.filter(isRec));
    const total = isRec(data) ? Number(data["totalPages"] ?? 1) : 1;
    if (lista.length === 0 || page + 1 >= total) break;
  }
  return itens;
}

function paraOpcoes(
  itens: Record<string, unknown>[],
  campoNome: string[] = ["name"],
): OpcaoNexti[] {
  return itens
    .map((item) => {
      const nomeChave = campoNome.find((c) => typeof item[c] === "string" && item[c]);
      const opcao: OpcaoNexti = {
        id: Number(item["id"] ?? 0),
        nome: nomeChave ? String(item[nomeChave]) : "",
      };
      if (typeof item["externalId"] === "string") opcao.externalId = item["externalId"];
      return opcao;
    })
    .filter((o) => o.id > 0 && o.nome);
}

/** Lista empresas, cargos, postos e escalas para casar os nomes da planilha. */
export const listarOpcoesCadastroNexti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: boolean; opcoes: OpcoesCadastroNexti; erro?: string }> => {
    const vazio: OpcoesCadastroNexti = { empresas: [], cargos: [], postos: [], escalas: [] };
    try {
      const config = await loadConfig();
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      const [empresas, cargos, postos, escalas] = await Promise.all([
        listarTudo(config, "/api/companies/all"),
        listarTudo(config, "/api/careers/all"),
        listarTudo(config, "/api/workplaces/all"),
        listarTudo(config, "/api/schedules/all"),
      ]);
      return {
        ok: true,
        opcoes: {
          empresas: paraOpcoes(empresas, ["companyName", "fantasyName", "name"]),
          cargos: paraOpcoes(cargos),
          postos: paraOpcoes(postos),
          escalas: paraOpcoes(escalas),
        },
      };
    } catch (error) {
      return { ok: false, opcoes: vazio, erro: (error as Error)?.message ?? "Falha na NEXTI." };
    }
  });

function acharOpcao(opcoes: OpcaoNexti[], termo?: string): OpcaoNexti | null {
  const alvo = normalizar(termo ?? "");
  if (!alvo) return null;
  return (
    opcoes.find((o) => normalizar(o.nome) === alvo) ??
    opcoes.find((o) => (o.externalId ?? "").toLowerCase() === alvo) ??
    opcoes.find((o) => normalizar(o.nome).startsWith(alvo)) ??
    opcoes.find((o) => normalizar(o.nome).includes(alvo)) ??
    null
  );
}

function limpar(v?: string): string {
  return String(v ?? "").trim();
}

/** Extrai horários (HH:MM) de um texto: "07:00 as 19:00", "7h às 19h", "0700-1900". */
function extrairHorarios(texto: string): string[] {
  const base = normalizar(texto);
  const achados: string[] = [];
  const re = /(\d{1,2})\s*(?::|h|hs|hrs)\s*(\d{2})?|(\d{4})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    let hh = 0;
    let mm = 0;
    if (m[3]) {
      hh = Number(m[3].slice(0, 2));
      mm = Number(m[3].slice(2, 4));
    } else {
      hh = Number(m[1]);
      mm = Number(m[2] ?? "0");
    }
    if (hh > 23 || mm > 59) continue;
    achados.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return achados;
}

/** Extrai o tipo de jornada: 12x36, 5x2, 6x1... */
function extrairJornada(texto: string): string | null {
  const m = normalizar(texto).match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/);
  return m ? `${Number(m[1])}x${Number(m[2])}` : null;
}

/** Junta nome e todos os campos textuais/numéricos do registro da escala. */
function textoDaEscala(item: Record<string, unknown>): string {
  return Object.values(item)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .join(" ");
}

/**
 * Regra: quando a coluna "escala" traz um horário (ex.: "07:00 ÀS 19:00 12X36")
 * em vez do nome exato, procura na NEXTI uma escala com os mesmos horários.
 */
function acharEscalaPorHorario(
  escalasRaw: Record<string, unknown>[],
  termo?: string,
): OpcaoNexti | null {
  const bruto = limpar(termo);
  if (!bruto) return null;
  const horarios = extrairHorarios(bruto);
  if (horarios.length === 0) return null;
  const jornada = extrairJornada(bruto);

  let melhor: { opcao: OpcaoNexti; pontos: number } | null = null;
  for (const item of escalasRaw) {
    const id = Number(item["id"] ?? 0);
    const nome = typeof item["name"] === "string" ? item["name"] : "";
    if (!id || !nome) continue;
    const texto = textoDaEscala(item);
    const horariosEscala = extrairHorarios(texto);
    let pontos = 0;
    for (const h of horarios) if (horariosEscala.includes(h)) pontos += 2;
    if (pontos === 0) continue;
    const jornadaEscala = extrairJornada(texto);
    if (jornada && jornadaEscala === jornada) pontos += 3;
    else if (jornada && jornadaEscala && jornadaEscala !== jornada) pontos -= 2;
    if (pontos <= 0) continue;
    const opcao: OpcaoNexti = { id, nome };
    if (typeof item["externalId"] === "string") opcao.externalId = item["externalId"];
    if (!melhor || pontos > melhor.pontos) melhor = { opcao, pontos };
  }
  return melhor?.opcao ?? null;
}

/** Posto padrão para quem entra sem vaga no posto informado. */
const POSTO_NOVAS_ADMISSOES = "NOVAS ADMISSÕES";

/** Verifica se o posto já atingiu o número de vagas (vacantJob) da NEXTI. */
async function postoSemVaga(
  postosRaw: Record<string, unknown>[],
  postoId: number,
): Promise<boolean> {
  const item = postosRaw.find((w) => Number(w["id"] ?? 0) === postoId);
  const vagas = Number(item?.["vacantJob"] ?? 0);
  if (!Number.isFinite(vagas) || vagas <= 0) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("nexti_persons")
      .select("nexti_id", { count: "exact", head: true })
      .eq("workplace_id", postoId)
      .is("demission_date", null);
    if (error) return false;
    return (count ?? 0) >= vagas;
  } catch {
    return false;
  }
}

/** Cadastra um colaborador na NEXTI (POST /api/persons). */
export const cadastrarPessoaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pessoa: PessoaCadastro }) => ({
    pessoa: (input?.pessoa ?? {}) as PessoaCadastro,
  }))
  .handler(async ({ data }): Promise<ResultadoCadastro> => {
    const p = data.pessoa;
    const nome = limpar(p.nome).toUpperCase();
    if (!nome) return { nome: "(sem nome)", ok: false, personId: null, mensagem: "Nome vazio." };

    try {
      const config = await loadConfig();
      config.baseUrl = normalizeBaseUrl(config.baseUrl);

      const [empresasRaw, cargosRaw, postosRaw, escalasRaw] = await Promise.all([
        limpar(p.empresa) ? listarTudo(config, "/api/companies/all") : Promise.resolve([]),
        limpar(p.cargo) ? listarTudo(config, "/api/careers/all") : Promise.resolve([]),
        limpar(p.posto) ? listarTudo(config, "/api/workplaces/all") : Promise.resolve([]),
        limpar(p.escala) ? listarTudo(config, "/api/schedules/all") : Promise.resolve([]),
      ]);

      const empresa = acharOpcao(
        paraOpcoes(empresasRaw, ["companyName", "fantasyName", "name"]),
        p.empresa,
      );
      const cargo = acharOpcao(paraOpcoes(cargosRaw), p.cargo);
      let posto = acharOpcao(paraOpcoes(postosRaw), p.posto);
      let escala = acharOpcao(paraOpcoes(escalasRaw), p.escala);
      // Regra: se o nome não bate, tenta casar pelo horário informado na coluna "escala".
      let avisoEscala = "";
      if (limpar(p.escala) && !escala) {
        const porHorario = acharEscalaPorHorario(escalasRaw, p.escala);
        if (porHorario) {
          escala = porHorario;
          avisoEscala = ` Escala "${p.escala}" casada pelo horário com "${porHorario.nome}".`;
        }
      }

      const faltando: string[] = [];
      if (limpar(p.empresa) && !empresa) faltando.push(`empresa "${p.empresa}"`);
      if (limpar(p.cargo) && !cargo) faltando.push(`cargo "${p.cargo}"`);
      if (limpar(p.escala) && !escala) faltando.push(`escala "${p.escala}"`);
      if (faltando.length) {
        return {
          nome,
          ok: false,
          personId: null,
          mensagem: `Não encontrei na NEXTI: ${faltando.join(", ")}.`,
        };
      }

      // Regra: posto não encontrado ou sem vaga livre → lotar em "NOVAS ADMISSÕES".
      let avisoPosto = "";
      const destinoNovas = acharOpcao(paraOpcoes(postosRaw), POSTO_NOVAS_ADMISSOES);
      if (limpar(p.posto) && !posto) {
        if (destinoNovas) {
          avisoPosto = ` Posto "${p.posto}" não encontrado — lotado em "${destinoNovas.nome}".`;
          posto = destinoNovas;
        } else {
          avisoPosto = ` Posto "${p.posto}" não encontrado e não encontrei o posto "${POSTO_NOVAS_ADMISSOES}" na NEXTI.`;
        }
      } else if (posto) {
        const semVaga = await postoSemVaga(postosRaw, posto.id);
        if (semVaga) {
          if (destinoNovas) {
            avisoPosto = ` Posto "${posto.nome}" sem vaga — lotado em "${destinoNovas.nome}".`;
            posto = destinoNovas;
          } else {
            avisoPosto = ` Posto "${posto.nome}" sem vaga e não encontrei o posto "${POSTO_NOVAS_ADMISSOES}" na NEXTI.`;
          }
        }
      }

      const genero = normalizar(p.genero ?? "").startsWith("f") ? "F" : "M";
      const corpo: Record<string, unknown> = {
        name: nome,
        cpf: soDigitos(p.cpf),
        pis: soDigitos(p.pis ?? "") || "00000000000",
        enrolment: limpar(p.matricula),
        email: limpar(p.email),
        gender: genero,
        personSituationId: 1,
        personTypeId: 1,
        businessUnitId: 0,
        ignoreValidation: true,
        ignoreTimeTracking: false,
        allowDevicePassword: false,
        allowMobileClocking: false,
        adminDevice: false,
        ...(empresa ? { companyId: empresa.id, externalCompanyId: empresa.externalId } : {}),
        ...(cargo ? { careerId: cargo.id } : {}),
        ...(posto ? { workplaceId: posto.id } : {}),
        ...(escala ? { scheduleId: escala.id } : {}),
        ...(dataNexti(p.nascimento) ? { birthDate: dataNexti(p.nascimento) } : {}),
        ...(dataNexti(p.admissao) ? { admissionDate: dataNexti(p.admissao) } : {}),
        ...(limpar(p.mae) ? { mothersName: limpar(p.mae).toUpperCase() } : {}),
        ...(limpar(p.pai) ? { fathersName: limpar(p.pai).toUpperCase() } : {}),
        ...(limpar(p.rg) ? { registerNumber: limpar(p.rg) } : {}),
      };

      const res = await requestNexti({
        config,
        endpoint: "/api/persons",
        method: "POST",
        body: corpo,
      });

      let corpoResposta: unknown = res.data;
      if (typeof corpoResposta === "string") {
        try {
          corpoResposta = JSON.parse(corpoResposta);
        } catch {
          /* resposta sem JSON */
        }
      }
      const valor = isRec(corpoResposta)
        ? isRec(corpoResposta["value"])
          ? corpoResposta["value"]
          : corpoResposta
        : null;
      const personId = valor && Number(valor["id"]) > 0 ? Number(valor["id"]) : null;

      if (res.status >= 200 && res.status < 300 && personId) {
        return {
          nome,
          ok: true,
          personId,
          mensagem: `Cadastrado na NEXTI (matrícula interna ${personId}).${avisoPosto}`,
        };
      }
      return {
        nome,
        ok: false,
        personId,
        mensagem: `A NEXTI respondeu ${res.status} sem confirmar o cadastro.${avisoPosto}`,
      };
    } catch (error) {
      return {
        nome,
        ok: false,
        personId: null,
        mensagem: (error as Error)?.message ?? "Falha ao cadastrar na NEXTI.",
      };
    }
  });
