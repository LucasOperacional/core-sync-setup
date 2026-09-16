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

const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "as", "escala",
  "horario", "horarios", "turno", "jornada", "hs", "hrs", "h", "ate", "às", "as",
]);

function tokensDe(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !PALAVRAS_IGNORADAS.has(t));
}

/** Diurno/noturno a partir de palavras ou do horário inicial. */
function periodoDe(texto: string, horarios: string[]): "diurno" | "noturno" | null {
  const base = normalizar(texto);
  if (/\bnot(urno)?\b|\bnoite\b/.test(base)) return "noturno";
  if (/\bdiurno\b|\bdia\b|\bmanha\b|\btarde\b/.test(base)) return "diurno";
  const inicio = horarios[0];
  if (!inicio) return null;
  const hh = Number(inicio.slice(0, 2));
  if (Number.isNaN(hh)) return null;
  return hh >= 18 || hh < 5 ? "noturno" : "diurno";
}

/**
 * Regra de importação: para o texto da coluna "escala" da planilha, escolhe a
 * escala mais compatível cadastrada na NEXTI, combinando horários, jornada
 * (12x36, 5x2...), período (diurno/noturno) e semelhança das palavras.
 */
function acharEscalaCompativel(
  escalasRaw: Record<string, unknown>[],
  termo?: string,
): { opcao: OpcaoNexti; pontos: number } | null {
  const bruto = limpar(termo);
  if (!bruto) return null;

  const horarios = extrairHorarios(bruto);
  const jornada = extrairJornada(bruto);
  const periodo = periodoDe(bruto, horarios);
  const tokens = tokensDe(bruto);

  let melhor: { opcao: OpcaoNexti; pontos: number } | null = null;

  for (const item of escalasRaw) {
    const id = Number(item["id"] ?? 0);
    const nome = typeof item["name"] === "string" ? item["name"] : "";
    if (!id || !nome) continue;

    const texto = textoDaEscala(item);
    const horariosEscala = extrairHorarios(texto);
    const jornadaEscala = extrairJornada(texto);
    const periodoEscala = periodoDe(texto, horariosEscala);
    const tokensEscala = new Set(tokensDe(`${nome} ${texto}`));

    let pontos = 0;

    // Horários coincidentes (início/fim).
    let batidas = 0;
    for (const h of horarios) if (horariosEscala.includes(h)) batidas += 1;
    pontos += batidas * 4;
    if (horarios.length > 0 && batidas === 0) pontos -= 2;

    // Jornada.
    if (jornada && jornadaEscala === jornada) pontos += 5;
    else if (jornada && jornadaEscala && jornadaEscala !== jornada) pontos -= 5;

    // Período.
    if (periodo && periodoEscala === periodo) pontos += 2;
    else if (periodo && periodoEscala && periodoEscala !== periodo) pontos -= 3;

    // Semelhança das palavras.
    if (tokens.length > 0) {
      const iguais = tokens.filter((t) => tokensEscala.has(t)).length;
      pontos += (iguais / tokens.length) * 6;
      const nomeNorm = normalizar(nome);
      const alvoNorm = normalizar(bruto);
      if (nomeNorm === alvoNorm) pontos += 10;
      else if (nomeNorm.includes(alvoNorm) || alvoNorm.includes(nomeNorm)) pontos += 4;
    }

    if (pontos <= 0) continue;
    if (!melhor || pontos > melhor.pontos) melhor = { opcao: { id, nome }, pontos };
  }

  // Exige uma compatibilidade mínima para não lançar escala errada.
  return melhor && melhor.pontos >= 4 ? melhor : null;
}

/** Posto padrão para quem entra sem vaga no posto informado. */
const POSTO_NOVAS_ADMISSOES = "NOVAS ADMISSÕES";

/**
 * Regra de importação: para o texto da coluna "posto" da planilha, escolhe o
 * posto mais compatível cadastrado na NEXTI, combinando semelhança das
 * palavras, código externo e correspondência parcial do nome.
 */
function acharPostoCompativel(
  postosRaw: Record<string, unknown>[],
  termo?: string,
): { opcao: OpcaoNexti; pontos: number } | null {
  const bruto = limpar(termo);
  if (!bruto) return null;

  const alvoNorm = normalizar(bruto);
  const tokens = tokensDe(bruto);

  let melhor: { opcao: OpcaoNexti; pontos: number } | null = null;

  for (const item of postosRaw) {
    const id = Number(item["id"] ?? 0);
    const nome = typeof item["name"] === "string" ? item["name"] : "";
    if (!id || !nome) continue;

    const nomeNorm = normalizar(nome);
    const texto = textoDaEscala(item);
    const tokensPosto = new Set(tokensDe(`${nome} ${texto}`));
    const externalId = typeof item["externalId"] === "string" ? item["externalId"] : "";

    let pontos = 0;

    // Nome idêntico ou contido.
    if (nomeNorm === alvoNorm) pontos += 12;
    else if (nomeNorm.includes(alvoNorm) || alvoNorm.includes(nomeNorm)) pontos += 6;
    else if (nomeNorm.startsWith(alvoNorm) || alvoNorm.startsWith(nomeNorm)) pontos += 4;

    // Código externo.
    if (externalId && externalId.toLowerCase() === alvoNorm) pontos += 10;

    // Semelhança das palavras.
    if (tokens.length > 0) {
      const iguais = tokens.filter((t) => tokensPosto.has(t)).length;
      pontos += (iguais / tokens.length) * 8;
    }

    if (pontos <= 0) continue;
    const opcao: OpcaoNexti = { id, nome };
    if (externalId) opcao.externalId = externalId;
    if (!melhor || pontos > melhor.pontos) melhor = { opcao, pontos };
  }

  // Exige uma compatibilidade mínima para não lançar posto errado.
  return melhor && melhor.pontos >= 4 ? melhor : null;
}

type ListasNexti = {
  empresasRaw: Record<string, unknown>[];
  cargosRaw: Record<string, unknown>[];
  postosRaw: Record<string, unknown>[];
  escalasRaw: Record<string, unknown>[];
};

async function carregarListas(
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<ListasNexti> {
  const [empresasRaw, cargosRaw, postosRaw, escalasRaw] = await Promise.all([
    listarTudo(config, "/api/companies/all"),
    listarTudo(config, "/api/careers/all"),
    listarTudo(config, "/api/workplaces/all"),
    listarTudo(config, "/api/schedules/all"),
  ]);
  return { empresasRaw, cargosRaw, postosRaw, escalasRaw };
}

/** Contagem de ativos por posto, usada para saber se ainda há vaga. */
async function contarAtivosPorPosto(postoIds: number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (postoIds.length === 0) return mapa;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("nexti_persons")
      .select("workplace_id")
      .in("workplace_id", postoIds)
      .is("demission_date", null);
    if (error || !data) return mapa;
    for (const row of data as { workplace_id: number | null }[]) {
      const id = Number(row.workplace_id ?? 0);
      if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1);
    }
  } catch {
    /* sem contagem local */
  }
  return mapa;
}

function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (tam: number) => {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(cpf[i]) * (tam + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export type ValidacaoPessoa = {
  indice: number;
  nome: string;
  erros: string[];
  avisos: string[];
  payload: Record<string, string | number | boolean>;
  resolvido: { empresa?: string; cargo?: string; posto?: string; escala?: string };
};

/** Monta o corpo do POST /api/persons e acusa tudo que a NEXTI recusaria. */
function montarCadastro(
  p: PessoaCadastro,
  listas: ListasNexti,
  ativosPorPosto: Map<number, number>,
): Omit<ValidacaoPessoa, "indice"> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const nome = limpar(p.nome).toUpperCase();
  if (!nome) erros.push("Nome vazio.");

  const cpf = soDigitos(p.cpf);
  if (!cpf) erros.push("CPF vazio.");
  else if (cpf.length !== 11) erros.push(`CPF "${p.cpf}" não tem 11 dígitos.`);
  else if (!cpfValido(cpf)) erros.push(`CPF "${p.cpf}" é inválido (dígito verificador).`);

  const pis = soDigitos(p.pis ?? "");
  if (pis && pis.length !== 11) avisos.push(`PIS "${p.pis}" não tem 11 dígitos — será enviado zerado.`);
  if (!pis) avisos.push("PIS não informado — será enviado 00000000000.");

  const email = limpar(p.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push(`E-mail "${email}" é inválido.`);

  const nascimento = dataNexti(p.nascimento);
  if (limpar(p.nascimento) && !nascimento) erros.push(`Data de nascimento "${p.nascimento}" não é uma data válida.`);
  const admissao = dataNexti(p.admissao);
  if (limpar(p.admissao) && !admissao) erros.push(`Data de admissão "${p.admissao}" não é uma data válida.`);
  if (!admissao) avisos.push("Admissão não informada.");

  if (!limpar(p.genero)) avisos.push('Sexo não informado — será enviado "M".');
  const genero = normalizar(p.genero ?? "").startsWith("f") ? "F" : "M";

  const empresa = acharOpcao(
    paraOpcoes(listas.empresasRaw, ["companyName", "fantasyName", "name"]),
    p.empresa,
  );
  const cargo = acharOpcao(paraOpcoes(listas.cargosRaw), p.cargo);
  let posto = acharOpcao(paraOpcoes(listas.postosRaw), p.posto);
  let escala = acharOpcao(paraOpcoes(listas.escalasRaw), p.escala);

  if (limpar(p.escala) && !escala) {
    // 1) horário exato; 2) escala mais compatível (horário + jornada + período + palavras).
    const porHorario = acharEscalaPorHorario(listas.escalasRaw, p.escala);
    const compativel = porHorario
      ? { opcao: porHorario, pontos: 99 }
      : acharEscalaCompativel(listas.escalasRaw, p.escala);
    if (compativel) {
      escala = compativel.opcao;
      avisos.push(
        `Escala "${p.escala}" não existe com esse nome — usada a mais compatível: "${compativel.opcao.nome}".`,
      );
    }
  }

  if (!limpar(p.empresa)) erros.push("Empresa não informada.");
  else if (!empresa) erros.push(`Empresa "${p.empresa}" não existe na NEXTI.`);
  if (limpar(p.cargo) && !cargo) erros.push(`Cargo "${p.cargo}" não existe na NEXTI.`);
  if (!limpar(p.cargo)) avisos.push("Cargo não informado.");
  if (limpar(p.escala) && !escala) erros.push(`Escala "${p.escala}" não existe na NEXTI.`);

  // Regra: posto não encontrado ou sem vaga livre → lotar em "NOVAS ADMISSÕES".
  const destinoNovas = acharOpcao(paraOpcoes(listas.postosRaw), POSTO_NOVAS_ADMISSOES);
  if (limpar(p.posto) && !posto) {
    if (destinoNovas) {
      avisos.push(`Posto "${p.posto}" não encontrado — será lotado em "${destinoNovas.nome}".`);
      posto = destinoNovas;
    } else {
      erros.push(`Posto "${p.posto}" não encontrado e não existe o posto "${POSTO_NOVAS_ADMISSOES}" na NEXTI.`);
    }
  } else if (posto) {
    const item = listas.postosRaw.find((w) => Number(w["id"] ?? 0) === posto!.id);
    const vagas = Number(item?.["vacantJob"] ?? 0);
    const ocupadas = ativosPorPosto.get(posto.id) ?? 0;
    if (Number.isFinite(vagas) && vagas > 0 && ocupadas >= vagas) {
      if (destinoNovas) {
        avisos.push(`Posto "${posto.nome}" sem vaga (${ocupadas}/${vagas}) — será lotado em "${destinoNovas.nome}".`);
        posto = destinoNovas;
      } else {
        erros.push(`Posto "${posto.nome}" sem vaga e não existe o posto "${POSTO_NOVAS_ADMISSOES}" na NEXTI.`);
      }
    }
  }

  const payload: Record<string, string | number | boolean> = {
    name: nome,
    cpf,
    pis: pis.length === 11 ? pis : "00000000000",
    enrolment: limpar(p.matricula),
    email,
    gender: genero,
    personSituationId: 1,
    personTypeId: 1,
    businessUnitId: 0,
    ignoreValidation: true,
    ignoreTimeTracking: false,
    allowDevicePassword: false,
    allowMobileClocking: false,
    adminDevice: false,
    ...(empresa
      ? {
          companyId: empresa.id,
          ...(empresa.externalId ? { externalCompanyId: empresa.externalId } : {}),
        }
      : {}),
    ...(cargo ? { careerId: cargo.id } : {}),
    ...(posto ? { workplaceId: posto.id } : {}),
    ...(escala ? { scheduleId: escala.id } : {}),
    ...(nascimento ? { birthDate: nascimento } : {}),
    ...(admissao ? { admissionDate: admissao } : {}),
    ...(limpar(p.mae) ? { mothersName: limpar(p.mae).toUpperCase() } : {}),
    ...(limpar(p.pai) ? { fathersName: limpar(p.pai).toUpperCase() } : {}),
    ...(limpar(p.rg) ? { registerNumber: limpar(p.rg) } : {}),
  };

  const resolvido: ValidacaoPessoa["resolvido"] = {};
  if (empresa) resolvido.empresa = empresa.nome;
  if (cargo) resolvido.cargo = cargo.nome;
  if (posto) resolvido.posto = posto.nome;
  if (escala) resolvido.escala = escala.nome;

  return { nome: nome || "(sem nome)", erros, avisos, payload, resolvido };
}

/** Valida a planilha inteira contra a NEXTI antes de enviar qualquer cadastro. */
export const validarPessoasNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pessoas: PessoaCadastro[] }) => ({
    pessoas: Array.isArray(input?.pessoas) ? input.pessoas : [],
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; erro?: string; itens: ValidacaoPessoa[] }> => {
    try {
      const config = await loadConfig();
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      const listas = await carregarListas(config);

      const postosPossiveis = data.pessoas
        .map((p) => acharOpcao(paraOpcoes(listas.postosRaw), p.posto)?.id ?? 0)
        .filter((id) => id > 0);
      const ativos = await contarAtivosPorPosto([...new Set(postosPossiveis)]);

      const vistos = new Map<string, number>();
      const itens = data.pessoas.map((p, indice) => {
        const item = { indice, ...montarCadastro(p, listas, ativos) };
        const cpf = soDigitos(p.cpf);
        if (cpf) {
          const anterior = vistos.get(cpf);
          if (anterior !== undefined) item.erros.push(`CPF repetido na planilha (linha ${anterior + 1}).`);
          else vistos.set(cpf, indice);
        }
        return item;
      });
      return { ok: true, itens };
    } catch (error) {
      return { ok: false, itens: [], erro: (error as Error)?.message ?? "Falha ao validar na NEXTI." };
    }
  });

/** Cadastra um colaborador na NEXTI (POST /api/persons). */
export const cadastrarPessoaNexti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pessoa: PessoaCadastro }) => ({
    pessoa: (input?.pessoa ?? {}) as PessoaCadastro,
  }))
  .handler(async ({ data }): Promise<ResultadoCadastro> => {
    const p = data.pessoa;
    const nomeBase = limpar(p.nome).toUpperCase();
    if (!nomeBase)
      return { nome: "(sem nome)", ok: false, personId: null, mensagem: "Nome vazio." };

    try {
      const config = await loadConfig();
      config.baseUrl = normalizeBaseUrl(config.baseUrl);
      const listas = await carregarListas(config);
      const postoId = acharOpcao(paraOpcoes(listas.postosRaw), p.posto)?.id ?? 0;
      const ativos = await contarAtivosPorPosto(postoId ? [postoId] : []);
      const { nome, erros, avisos, payload, resolvido } = montarCadastro(p, listas, ativos);

      if (erros.length) {
        return { nome, ok: false, personId: null, mensagem: erros.join(" ") };
      }
      // A escala escolhida (exata ou a mais compatível) é a que vai no cadastro.
      const infoEscala = resolvido.escala ? ` Escala usada: "${resolvido.escala}".` : "";
      const extra = `${avisos.length ? ` ${avisos.join(" ")}` : ""}${infoEscala}`;

      const res = await requestNexti({
        config,
        endpoint: "/api/persons",
        method: "POST",
        body: payload,
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
          mensagem: `Cadastrado na NEXTI (matrícula interna ${personId}).${extra}`,
        };
      }
      return {
        nome,
        ok: false,
        personId,
        mensagem: `A NEXTI respondeu ${res.status} sem confirmar o cadastro.${extra}`,
      };
    } catch (error) {
      return {
        nome: nomeBase,
        ok: false,
        personId: null,
        mensagem: (error as Error)?.message ?? "Falha ao cadastrar na NEXTI.",
      };
    }
  });
