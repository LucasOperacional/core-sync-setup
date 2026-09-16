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

/**
 * Código externo (matrícula) do registro na NEXTI. A API usa nomes diferentes
 * conforme o recurso e a versão, por isso procuramos todos os conhecidos.
 */
function codigoExternoDe(item: Record<string, unknown>): string {
  const chaves = [
    "externalId",
    "externalCode",
    "externalScheduleId",
    "externalWorkplaceId",
    "code",
    "enrolment",
    "registration",
    "matricula",
  ];
  for (const chave of chaves) {
    const valor = item[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  }
  return "";
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
      const codigo = codigoExternoDe(item);
      if (codigo) opcao.externalId = codigo;
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
    const codigo = codigoExternoDe(item);
    if (codigo) opcao.externalId = codigo;
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
    if (!melhor || pontos > melhor.pontos) {
      const opcao: OpcaoNexti = { id, nome };
      const codigo = codigoExternoDe(item);
      if (codigo) opcao.externalId = codigo;
      melhor = { opcao, pontos };
    }
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

/**
 * Regra: depois de achar a escala mais compatível, usa o código externo
 * (matrícula) da escala para identificar o posto na NEXTI — pelo posto
 * vinculado à escala, pelo mesmo código externo ou por prefixo do código.
 */
function acharPostoPelaEscala(
  postosRaw: Record<string, unknown>[],
  escalaRaw: Record<string, unknown> | undefined,
  escala: OpcaoNexti | null,
): OpcaoNexti | null {
  if (!escala) return null;

  const codigo = normalizar(escala.externalId ?? "");
  const vinculado = Number(
    escalaRaw?.["workplaceId"] ?? escalaRaw?.["workPlaceId"] ?? 0,
  );
  const codigoVinculado = normalizar(
    typeof escalaRaw?.["externalWorkplaceId"] === "string"
      ? (escalaRaw["externalWorkplaceId"] as string)
      : "",
  );

  for (const item of postosRaw) {
    const id = Number(item["id"] ?? 0);
    const nome = typeof item["name"] === "string" ? item["name"] : "";
    if (!id || !nome) continue;
    const externalId = normalizar(
      typeof item["externalId"] === "string" ? item["externalId"] : "",
    );

    const bate =
      (vinculado && id === vinculado) ||
      (codigoVinculado && externalId === codigoVinculado) ||
      (codigo && externalId && (externalId === codigo || codigo.startsWith(externalId)));

    if (!bate) continue;
    const opcao: OpcaoNexti = { id, nome };
    if (externalId) opcao.externalId = String(item["externalId"]);
    return opcao;
  }

  return null;
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
    // 0) código externo (matrícula) da escala informado direto na planilha.
    const termoEscala = normalizar(limpar(p.escala));
    const porCodigo = listas.escalasRaw.find(
      (item) => !!codigoExternoDe(item) && normalizar(codigoExternoDe(item)) === termoEscala,
    );
    // 1) horário exato; 2) escala mais compatível (horário + jornada + período + palavras).
    const porHorario = porCodigo ? null : acharEscalaPorHorario(listas.escalasRaw, p.escala);
    const compativel = porCodigo
      ? {
          opcao: {
            id: Number(porCodigo["id"] ?? 0),
            nome: String(porCodigo["name"] ?? ""),
            externalId: codigoExternoDe(porCodigo),
          } as OpcaoNexti,
          pontos: 100,
        }
      : porHorario
        ? { opcao: porHorario, pontos: 99 }
        : acharEscalaCompativel(listas.escalasRaw, p.escala);
    if (compativel) {
      escala = compativel.opcao;
      avisos.push(
        `Escala "${p.escala}" não existe com esse nome — usada a mais compatível: "${compativel.opcao.nome}".`,
      );
    }
  }

  // Regra: garante o código externo (matrícula) da escala escolhida — é ele que
  // a NEXTI exige para vincular a escala ao colaborador.
  if (escala && !escala.externalId) {
    const registro = listas.escalasRaw.find((item) => Number(item["id"] ?? 0) === escala!.id);
    const codigo = registro ? codigoExternoDe(registro) : "";
    if (codigo) escala = { ...escala, externalId: codigo };
  }
  if (escala) {
    avisos.push(
      escala.externalId
        ? `Escala "${escala.nome}" identificada pelo código externo (matrícula) ${escala.externalId}.`
        : `Escala "${escala.nome}" identificada pelo id ${escala.id} na NEXTI.`,
    );
  }


  if (!limpar(p.empresa)) erros.push("Empresa não informada.");
  else if (!empresa) erros.push(`Empresa "${p.empresa}" não existe na NEXTI.`);
  if (limpar(p.cargo) && !cargo) erros.push(`Cargo "${p.cargo}" não existe na NEXTI.`);
  if (!limpar(p.cargo)) avisos.push("Cargo não informado.");
  if (limpar(p.escala) && !escala) erros.push(`Escala "${p.escala}" não existe na NEXTI.`);

  // Regra: posto não localizado pelo nome → tenta pelo código externo (matrícula)
  // da escala compatível; se ainda assim não achar, lota em "NOVAS ADMISSÕES".
  const destinoNovas = acharOpcao(paraOpcoes(listas.postosRaw), POSTO_NOVAS_ADMISSOES);
  if (limpar(p.posto) && !posto) {
    const escalaRaw = escala
      ? listas.escalasRaw.find((e) => Number(e["id"] ?? 0) === escala!.id)
      : undefined;
    const pelaEscala = acharPostoPelaEscala(listas.postosRaw, escalaRaw, escala);
    if (pelaEscala) {
      posto = pelaEscala;
      avisos.push(
        `Posto "${p.posto}" identificado pelo código da escala${escala?.externalId ? ` (${escala.externalId})` : ""}: "${pelaEscala.nome}".`,
      );
    } else if (destinoNovas) {
      avisos.push(`Posto "${p.posto}" não localizado — será lotado em "${destinoNovas.nome}".`);
      posto = destinoNovas;
    } else {
      erros.push(`Posto "${p.posto}" não encontrado e não existe o posto "${POSTO_NOVAS_ADMISSOES}" na NEXTI.`);
    }
  }
  if (posto && posto.id !== destinoNovas?.id) {
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
    ...(limpar(p.matricula) ? { externalId: limpar(p.matricula) } : {}),
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
    ...(cargo
      ? {
          careerId: cargo.id,
          ...(cargo.externalId ? { externalCareerId: cargo.externalId } : {}),
        }
      : {}),
    ...(posto
      ? {
          workplaceId: posto.id,
          ...(posto.externalId ? { externalWorkplaceId: posto.externalId } : {}),
        }
      : {}),
    // A NEXTI aceita a escala com nomes diferentes conforme a versão da API.
    ...(escala
      ? {
          scheduleId: escala.id,
          ...(escala.externalId ? { externalScheduleId: escala.externalId } : {}),
          rotationCode: (() => {
            const registro = listas.escalasRaw.find((item) => Number(item["id"] ?? 0) === escala.id);
            const rotacoes = registro && Array.isArray(registro["rotations"]) ? registro["rotations"] : [];
            const primeira = rotacoes.find(isRec);
            const codigo = Number(primeira?.["code"] ?? 1);
            return Number.isInteger(codigo) && codigo > 0 ? codigo : 1;
          })(),
        }
      : {}),
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

/**
 * Vincula a escala ao colaborador depois do cadastro. Algumas versões da API
 * da NEXTI ignoram o scheduleId no POST /api/persons e exigem uma chamada
 * própria de alocação de escala — tentamos os formatos conhecidos.
 */
async function vincularEscala(
  config: Awaited<ReturnType<typeof loadConfig>>,
  personId: number,
  personExternalId: string,
  scheduleId: number,
  scheduleExternalId: string,
  rotationCode: number,
  inicio: string,
): Promise<{ ok: boolean; erro?: string }> {
  const agora = new Date();
  const hoje = `${String(agora.getUTCDate()).padStart(2, "0")}${String(agora.getUTCMonth() + 1).padStart(2, "0")}${agora.getUTCFullYear()}000000`;
  const transferDateTime = /^\d{14}$/.test(inicio) ? inicio : hoje;
  // Regra: sem código externo (matrícula), o vínculo usa o id da escala.
  if (!scheduleId) {
    return { ok: false, erro: "a escala não foi identificada na NEXTI" };
  }

  const corpo: Record<string, string | number | boolean> = {
    personId,
    scheduleId,
    rotationCode: Number.isInteger(rotationCode) && rotationCode > 0 ? rotationCode : 1,
    transferDateTime,
  };
  if (personExternalId) corpo["personExternalId"] = personExternalId;
  if (scheduleExternalId) corpo["scheduleExternalId"] = scheduleExternalId;

  const tentativas: Array<{ endpoint: string; method: "POST"; body: Record<string, unknown> }> = [
    {
      endpoint: "/scheduletransfers",
      method: "POST",
      body: corpo,
    },
    {
      endpoint: "/api/scheduletransfers",
      method: "POST",
      body: corpo,
    },
  ];

  let ultimoErro = "sem resposta da NEXTI";
  for (const t of tentativas) {
    try {
      const res = await requestNexti({
        config,
        endpoint: t.endpoint,
        method: t.method,
        body: t.body as Record<string, string | number | boolean>,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      ultimoErro = `${t.endpoint} respondeu ${res.status}`;
    } catch (error) {
      ultimoErro = (error as Error)?.message ?? "erro desconhecido";
    }
  }
  return { ok: false, erro: ultimoErro };
}

/** Procura na NEXTI um colaborador já cadastrado pelo CPF ou pela matrícula. */
async function buscarPessoaExistente(
  config: Awaited<ReturnType<typeof loadConfig>>,
  cpf: string,
  matricula: string,
): Promise<{ id: number; nome: string } | null> {
  const tentativas: string[] = [];
  if (cpf) tentativas.push(`/api/persons/cpf/${cpf}`, `/api/persons/document/${cpf}`);
  if (matricula)
    tentativas.push(
      `/api/persons/externalid/${encodeURIComponent(matricula)}`,
      `/api/persons/registration/${encodeURIComponent(matricula)}`,
    );

  const corresponde = (candidato: Record<string, unknown>) => {
    // A NEXTI às vezes responde HTTP 200 com { id: 200, message: "não encontrado" }.
    // Esse "id" é um código da mensagem, não o identificador de uma pessoa.
    const temDadosDePessoa = ["name", "cpf", "enrolment", "externalId", "companyId"].some(
      (campo) => candidato[campo] !== undefined && candidato[campo] !== null,
    );
    if (!temDadosDePessoa) return false;
    const cpfRetornado = soDigitos(String(candidato["cpf"] ?? candidato["document"] ?? ""));
    const matriculaRetornada = limpar(
      String(
        candidato["enrolment"] ??
          candidato["externalId"] ??
          candidato["registration"] ??
          candidato["registerNumber"] ??
          "",
      ),
    );
    return Boolean((cpf && cpfRetornado === cpf) || (matricula && matriculaRetornada === matricula));
  };

  for (const endpoint of tentativas) {
    try {
      const res = await requestNexti({ config, endpoint, method: "GET" });
      let corpo: unknown = res.data;
      if (typeof corpo === "string") {
        try {
          corpo = JSON.parse(corpo);
        } catch {
          /* resposta sem JSON */
        }
      }
      const candidatos: unknown[] = Array.isArray(corpo)
        ? corpo
        : isRec(corpo)
          ? Array.isArray(corpo["content"])
            ? (corpo["content"] as unknown[])
            : [isRec(corpo["value"]) ? corpo["value"] : corpo]
          : [];
      for (const c of candidatos) {
        if (!isRec(c)) continue;
        const id = Number(c["id"] ?? 0);
        if (id > 0 && corresponde(c)) {
          return { id, nome: String(c["name"] ?? c["nome"] ?? "") };
        }
      }
    } catch {
      /* tenta o próximo formato de consulta */
    }
  }

  // Algumas instalações não oferecem consulta direta por CPF/matrícula.
  // Nesse caso, usa a listagem com filtro e confirma os identificadores antes de atualizar.
  for (const filtro of [cpf, matricula].filter(Boolean)) {
    try {
      const res = await requestNexti({
        config,
        endpoint: "/api/persons/all",
        method: "GET",
        query: { page: 0, size: 100, filter: filtro },
      });
      const candidatos =
        isRec(res.data) && Array.isArray(res.data["content"])
          ? (res.data["content"] as unknown[])
          : [];
      for (const c of candidatos) {
        if (!isRec(c) || !corresponde(c)) continue;
        const id = Number(c["id"] ?? 0);
        if (id > 0) return { id, nome: String(c["name"] ?? c["nome"] ?? "") };
      }
    } catch {
      /* tenta o próximo filtro */
    }
  }
  return null;
}

/** Atualiza o cadastro de um colaborador que já existe na NEXTI. */
async function atualizarPessoa(
  config: Awaited<ReturnType<typeof loadConfig>>,
  personId: number,
  payload: Record<string, string | number | boolean>,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const consulta = await requestNexti({
      config,
      endpoint: `/api/persons/${personId}`,
      method: "GET",
    });
    const raiz = isRec(consulta.data) ? consulta.data : null;
    const atual = raiz && isRec(raiz["value"]) ? raiz["value"] : raiz;
    const temPessoa =
      atual && ["name", "cpf", "enrolment", "externalId", "companyId"].some((campo) => atual[campo] !== undefined);
    if (!atual || !temPessoa) return { ok: false, erro: "A NEXTI não encontrou o cadastro para atualização." };

    // A atualização de pessoas exige o registro completo já existente. Preserva os
    // campos obrigatórios da NEXTI e substitui somente os dados vindos da planilha.
    const corpo: Record<string, unknown> = {
      ...atual,
      ...payload,
      id: personId,
      ignoreValidation: true,
    };
    delete corpo["message"];
    const res = await requestNexti({
      config,
      endpoint: `/api/persons/${personId}`,
      method: "PUT",
      body: corpo as Record<string, string | number | boolean>,
    });
    return res.status >= 200 && res.status < 300
      ? { ok: true }
      : { ok: false, erro: `/api/persons/${personId} respondeu ${res.status}` };
  } catch (error) {
    return { ok: false, erro: (error as Error)?.message ?? "erro desconhecido" };
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

      const vincular = async (personId: number) => {
        const escalaId = Number(payload["scheduleId"] ?? 0);
        if (!(escalaId > 0)) return "";
        const vinculo = await vincularEscala(
          config,
          personId,
          String(payload["externalId"] ?? payload["enrolment"] ?? ""),
          escalaId,
          String(payload["externalScheduleId"] ?? ""),
          Number(payload["rotationCode"] ?? 1),
          String(payload["admissionDate"] ?? ""),
        );
        return vinculo.ok
          ? " Escala vinculada na NEXTI."
          : ` Atenção: não foi possível vincular a escala automaticamente (${vinculo.erro}).`;
      };

      let res: Awaited<ReturnType<typeof requestNexti>>;
      try {
        res = await requestNexti({
          config,
          endpoint: "/api/persons",
          method: "POST",
          body: payload,
        });
      } catch (error) {
        const status = Number((error as { httpStatus?: number }).httpStatus ?? 0);
        // 409 = a NEXTI já tem esse colaborador (CPF/matrícula duplicados).
        if (status !== 409) throw error;

        const existente = await buscarPessoaExistente(
          config,
          String(payload["cpf"] ?? payload["document"] ?? ""),
          String(payload["enrolment"] ?? payload["externalId"] ?? ""),
        );
        if (!existente) {
          return {
            nome,
            ok: false,
            personId: null,
            mensagem: `Este colaborador já está cadastrado na NEXTI (CPF ou matrícula em uso) e não foi possível localizá-lo para atualizar. Confira o CPF e a matrícula.${extra}`,
          };
        }

        const atualizado = await atualizarPessoa(config, existente.id, payload);
        const infoVinculo = atualizado.ok ? await vincular(existente.id) : "";
        return {
          nome,
          ok: atualizado.ok,
          personId: existente.id,
          mensagem: atualizado.ok
            ? `Colaborador já existia na NEXTI (matrícula interna ${existente.id}) — cadastro atualizado.${extra}${infoVinculo}`
            : `Colaborador já existe na NEXTI (matrícula interna ${existente.id}), mas a atualização falhou: ${atualizado.erro}.${extra}`,
        };
      }

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
        // Garante que a escala fique realmente vinculada ao colaborador.
        const infoVinculo = await vincular(personId);
        return {
          nome,
          ok: true,
          personId,
          mensagem: `Cadastrado na NEXTI (matrícula interna ${personId}).${extra}${infoVinculo}`,
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
