/**
 * Parecer de autenticidade documental do atestado.
 *
 * Etapa final da análise, em duas partes:
 *  1. Determinística — o sistema compara, campo a campo, o que está no
 *     documento com o que o QR Code / serviço de validação devolveu e com a
 *     conferência da IA Operacional. Divergências em médico, CRM, paciente,
 *     data de atendimento, data de emissão ou período de afastamento impedem
 *     qualquer resultado "validado".
 *  2. Interpretativa (IA) — a IA analista de autenticidade documental organiza
 *     as evidências, explica limitações e devolve a classificação em JSON.
 *
 * O resultado final aplica as regras determinísticas SOBRE a resposta da IA.
 * Nunca lança: em falha devolve `disponivel: false` com a mensagem.
 */

import { atestadoIaOperacional } from "./atestado-auditoria.functions";

/* ─────────── Tipos ─────────── */

export type ResultadoParecer =
  | "validado"
  | "aparentemente_consistente"
  | "inconsistente"
  | "alto_risco_nao_validado"
  | "inconclusivo";

export interface ParecerFonte {
  tipo: string;
  identificacao: string;
  oficialidade: "oficial" | "institucional" | "terceiro" | "desconhecida";
  resultado: string;
  dataConsulta: string;
}

export interface ParecerDivergencia {
  campo: string;
  valorDocumento: string;
  valorFonte: string;
  gravidade: "baixa" | "media" | "alta";
  explicacao: string;
}

export interface ParecerAchado {
  achado: string;
  tipo: "fato" | "indicio" | "limitacao";
  impacto: "baixo" | "medio" | "alto";
}

export interface ParecerAreaSuspeita {
  regiao: string;
  descricao: string;
  impacto: "baixo" | "medio" | "alto";
}

export interface ParecerAutenticidade {
  disponivel: boolean;
  mensagem: string;
  resultado: ResultadoParecer;
  nivelConfianca: number;
  resumo: string;
  dadosDocumento: Record<string, string>;
  fontesVerificadas: ParecerFonte[];
  divergencias: ParecerDivergencia[];
  achadosTecnicos: ParecerAchado[];
  assinaturaIntegridade: {
    assinaturaDigitalVerificada: boolean | null;
    assinaturaVisualPresente: boolean | null;
    arquivoAssinadoCriptograficamente: boolean | null;
    hashSha256: string;
    observacoes: string;
  };
  analiseVisual: {
    formatoArquivo: string;
    mimeType: string;
    dimensoes: string;
    resolucaoDpi: string;
    orientacao: string;
    qualidadeVisual: string;
    qrCodeDetectado: boolean | null;
    codigoBarrasDetectado: boolean | null;
    carimboDetectado: boolean | null;
    assinaturaVisualDetectada: boolean | null;
    logotipoDetectado: boolean | null;
    documentoCortado: boolean | null;
    perspectivaOuInclinacao: string;
    sinaisDeEdicao: "nao_observados" | "possiveis" | "fortes" | "inconclusivo";
    areasSuspeitas: ParecerAreaSuspeita[];
    observacoes: string;
  };
  recomendacoes: string[];
  mensagemOperacional: string;
  /** Divergências encontradas pelas regras do sistema (não pela IA). */
  regrasDeterministicas: ParecerDivergencia[];
  /** O resultado da IA foi rebaixado pelas regras do sistema? */
  rebaixadoPorRegra: boolean;
  exigeConfirmacaoHumana: boolean;
}

const VAZIO: ParecerAutenticidade = {
  disponivel: false,
  mensagem: "",
  resultado: "inconclusivo",
  nivelConfianca: 0,
  resumo: "",
  dadosDocumento: {},
  fontesVerificadas: [],
  divergencias: [],
  achadosTecnicos: [],
  assinaturaIntegridade: {
    assinaturaDigitalVerificada: null,
    assinaturaVisualPresente: null,
    arquivoAssinadoCriptograficamente: null,
    hashSha256: "",
    observacoes: "",
  },
  analiseVisual: {
    formatoArquivo: "",
    mimeType: "",
    dimensoes: "",
    resolucaoDpi: "",
    orientacao: "",
    qualidadeVisual: "nao_informada",
    qrCodeDetectado: null,
    codigoBarrasDetectado: null,
    carimboDetectado: null,
    assinaturaVisualDetectada: null,
    logotipoDetectado: null,
    documentoCortado: null,
    perspectivaOuInclinacao: "",
    sinaisDeEdicao: "inconclusivo",
    areasSuspeitas: [],
    observacoes: "",
  },
  recomendacoes: [],
  mensagemOperacional: "",
  regrasDeterministicas: [],
  rebaixadoPorRegra: false,
  exigeConfirmacaoHumana: true,
};

/* ─────────── Entrada ─────────── */

export interface DadosParecerDocumento {
  nomePaciente: string;
  cpfPaciente: string;
  nomeMedico: string;
  crm: string;
  ufCrm: string;
  especialidade: string;
  cid: string;
  dataConsulta: string;
  diasAfastamento: string;
  dataInicioAfastamento: string;
  dataFimAfastamento: string;
  nomeHospital: string;
  enderecoHospital: string;
  cnpjHospital: string;
  codigoValidacao: string;
  qrCodeDetectado: boolean;
  assinaturaDetectada: boolean;
  carimboDetectado: boolean;
}

export interface DadosParecerFonte {
  campo: string;
  valorDocumento: string;
  valorFonte: string;
}

/* ─────────── Utilidades ─────────── */

const ND = "Não identificado";

function texto(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  return "";
}

function booleanOuNulo(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

function lista(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => texto(v)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function gravidade(raw: unknown): "baixa" | "media" | "alta" {
  return raw === "alta" || raw === "media" ? raw : "baixa";
}

function impacto(raw: unknown): "baixo" | "medio" | "alto" {
  return raw === "alto" || raw === "medio" ? raw : "baixo";
}

function informado(v: string): boolean {
  return Boolean(v) && v !== ND && v.toLowerCase() !== "não informado";
}

/** Máscara de CPF: mantém apenas os dois últimos dígitos. */
export function mascararCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 3) return informado(valor) ? "***.***.***-**" : "";
  return `***.***.***-${digitos.slice(-2)}`;
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** Compara dois valores tolerando acento, pontuação e caixa. */
function mesmoValor(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

/* ─────────── Etapa determinística ─────────── */

/** Campos cuja divergência impede qualquer resultado "validado". */
const CAMPOS_CRITICOS = [
  "médico",
  "medico",
  "crm",
  "paciente",
  "data de atendimento",
  "data do atendimento",
  "data de emissão",
  "data de emissao",
  "período de afastamento",
  "periodo de afastamento",
  "afastamento",
];

function ehCampoCritico(campo: string): boolean {
  const c = campo.toLowerCase();
  return CAMPOS_CRITICOS.some((k) => c.includes(k));
}

/**
 * Compara os dados do documento com os dados devolvidos pela fonte de
 * validação (QR Code / API). Devolve apenas as divergências encontradas.
 */
export function conferirRegrasDeterministicas(
  comparacoes: DadosParecerFonte[],
): ParecerDivergencia[] {
  const out: ParecerDivergencia[] = [];
  for (const c of comparacoes) {
    if (!informado(c.valorDocumento) || !informado(c.valorFonte)) continue;
    if (mesmoValor(c.valorDocumento, c.valorFonte)) continue;
    out.push({
      campo: c.campo,
      valorDocumento: c.valorDocumento,
      valorFonte: c.valorFonte,
      gravidade: ehCampoCritico(c.campo) ? "alta" : "media",
      explicacao: ehCampoCritico(c.campo)
        ? "Campo essencial divergente entre o documento e a fonte de validação: exige confirmação institucional ou revisão humana."
        : "Divergência entre o documento e a fonte de validação.",
    });
  }
  return out;
}

/** Aplica as regras do sistema sobre a classificação devolvida pela IA. */
function aplicarRegras(
  resultadoIa: ResultadoParecer,
  regras: ParecerDivergencia[],
  qrConfirmado: "sim" | "nao" | "indeterminado",
  assinaturaDigitalVerificada: boolean | null,
): { resultado: ResultadoParecer; rebaixado: boolean; exigeConfirmacao: boolean } {
  const criticas = regras.filter((r) => r.gravidade === "alta");
  let resultado = resultadoIa;
  let rebaixado = false;

  if (criticas.length) {
    resultado = "alto_risco_nao_validado";
    rebaixado = resultado !== resultadoIa;
  } else if (regras.length) {
    if (resultado === "validado" || resultado === "aparentemente_consistente") {
      resultado = "inconsistente";
      rebaixado = true;
    }
  }

  if (qrConfirmado === "nao" && resultado !== "alto_risco_nao_validado") {
    resultado = "alto_risco_nao_validado";
    rebaixado = true;
  }

  // "validado" exige autenticação oficial: QR/serviço confirmando ou
  // assinatura digital criptograficamente verificada.
  if (resultado === "validado" && qrConfirmado !== "sim" && assinaturaDigitalVerificada !== true) {
    resultado = "aparentemente_consistente";
    rebaixado = true;
  }

  const exigeConfirmacao = resultado !== "validado";
  return { resultado, rebaixado, exigeConfirmacao };
}

/* ─────────── Etapa de IA ─────────── */

function parseJson(bruto: string): Record<string, unknown> {
  const limpo = bruto
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const i = limpo.indexOf("{");
  const f = limpo.lastIndexOf("}");
  if (i === -1 || f <= i) throw new Error("A IA não devolveu um JSON válido.");
  return JSON.parse(limpo.slice(i, f + 1)) as Record<string, unknown>;
}

function resultadoValido(raw: unknown): ResultadoParecer {
  return raw === "validado" ||
    raw === "aparentemente_consistente" ||
    raw === "inconsistente" ||
    raw === "alto_risco_nao_validado"
    ? raw
    : "inconclusivo";
}

export interface ArgsParecer {
  arquivo: { nome: string; tipo: string; tamanho: number; hash: string };
  paginas: string[];
  dados: DadosParecerDocumento;
  textoExtraido: string;
  /** Análise visual/OCR já produzida pelo sistema (JSON serializável). */
  analiseVisual: Record<string, unknown>;
  /** Resultado da leitura/validação do QR Code (JSON serializável). */
  qrCode: Record<string, unknown>;
  /** Parecer da pesquisa web / fontes institucionais. */
  parecerWeb: string;
  fontesInstitucionais: Record<string, unknown>;
  /** Comparações campo a campo entre documento e fonte de validação. */
  comparacoes: DadosParecerFonte[];
  qrConfirmado: "sim" | "nao" | "indeterminado";
  assinaturaDigitalVerificada: boolean | null;
}

function montarContexto(a: ArgsParecer, regras: ParecerDivergencia[]): string {
  const ou = (v: string) => (informado(v) ? v : "não informado");
  const j = (v: unknown) => JSON.stringify(v ?? {}, null, 1).slice(0, 6000);

  return `Analise o atestado médico das imagens e os dados auxiliares abaixo. Compare rigorosamente as informações e retorne SOMENTE o JSON no formato definido.

ARQUIVO
- Nome: ${a.arquivo.nome}
- Tipo/MIME: ${a.arquivo.tipo}
- Tamanho: ${a.arquivo.tamanho} bytes
- Páginas/imagens enviadas: ${a.paginas.length}
- Hash SHA-256: ${a.arquivo.hash}
- Data/hora da análise: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

DADOS JÁ EXTRAÍDOS PELO SISTEMA (confira na imagem; não presuma)
- Paciente: ${ou(a.dados.nomePaciente)}
- CPF (mascarado): ${mascararCpf(a.dados.cpfPaciente) || "não informado"}
- Médico: ${ou(a.dados.nomeMedico)}
- CRM/UF: ${ou(a.dados.crm)} ${informado(a.dados.ufCrm) ? `(${a.dados.ufCrm})` : ""}
- Especialidade: ${ou(a.dados.especialidade)}
- CID: ${ou(a.dados.cid)}
- Data do atendimento: ${ou(a.dados.dataConsulta)}
- Afastamento: ${ou(a.dados.diasAfastamento)} dia(s), de ${ou(a.dados.dataInicioAfastamento)} a ${ou(a.dados.dataFimAfastamento)}
- Instituição: ${ou(a.dados.nomeHospital)} — ${ou(a.dados.enderecoHospital)} — CNPJ ${ou(a.dados.cnpjHospital)}
- Código do documento: ${ou(a.dados.codigoValidacao)}
- QR Code detectado: ${a.dados.qrCodeDetectado ? "sim" : "não"} · Assinatura visual: ${a.dados.assinaturaDetectada ? "sim" : "não"} · Carimbo: ${a.dados.carimboDetectado ? "sim" : "não"}

TEXTO EXTRAÍDO (OCR/PDF)
${a.textoExtraido.trim().slice(0, 6000) || "(sem texto embutido)"}

ANÁLISE VISUAL E OCR (JSON)
${j(a.analiseVisual)}

LEITURA/VALIDAÇÃO DO QR CODE OU CÓDIGO DE VALIDAÇÃO (JSON)
${j(a.qrCode)}

CONTEÚDO RETORNADO PELA PESQUISA/API DE VALIDAÇÃO
${a.parecerWeb.trim().slice(0, 5000) || "(não disponível)"}

FONTES INSTITUCIONAIS CONSULTADAS (JSON)
${j(a.fontesInstitucionais)}

VERIFICAÇÃO DE ASSINATURA DIGITAL
${
  a.assinaturaDigitalVerificada === true
    ? "Assinatura digital criptograficamente verificada."
    : a.assinaturaDigitalVerificada === false
      ? "Não foi encontrada assinatura digital criptograficamente verificável neste arquivo."
      : "Verificação de assinatura digital não realizada."
}

DIVERGÊNCIAS JÁ DETECTADAS PELAS REGRAS DO SISTEMA (determinísticas)
${regras.length ? j(regras) : "(nenhuma)"}

INSTRUÇÃO FINAL
Compare os dados sem fazer suposições. Se houver divergência entre o documento e o QR Code/API, destaque cada divergência individualmente e classifique o resultado como "inconsistente" ou "alto_risco_nao_validado", conforme a gravidade. Não afirme fraude definitiva. Se não houver dados suficientes, classifique como "inconclusivo". Não reproduza CPF completo nem dados clínicos desnecessários.`;
}

/**
 * Gera o parecer de autenticidade. Nunca lança.
 */
export async function gerarParecerAutenticidade(
  a: ArgsParecer,
  onProgress?: (etapa: string) => void,
): Promise<ParecerAutenticidade> {
  const regras = conferirRegrasDeterministicas(a.comparacoes);

  onProgress?.("Emitindo o parecer de autenticidade documental...");

  try {
    const resp = await atestadoIaOperacional({
      data: {
        modo: "parecer",
        paginas: a.paginas.slice(0, 3),
        contexto: montarContexto(a, regras).slice(0, 24000),
        ...(a.textoExtraido.trim() ? { textoExtraido: a.textoExtraido.slice(0, 12000) } : {}),
      },
    });

    const j = parseJson(resp.json);
    const dd = (j["dados_documento"] ?? {}) as Record<string, unknown>;
    const ai = (j["assinatura_e_integridade"] ?? {}) as Record<string, unknown>;
    const av = (j["analise_visual"] ?? {}) as Record<string, unknown>;

    const divergenciasIa: ParecerDivergencia[] = Array.isArray(j["divergencias"])
      ? (j["divergencias"] as Array<Record<string, unknown>>).map((d) => ({
          campo: texto(d["campo"]),
          valorDocumento: texto(d["valor_documento"]),
          valorFonte: texto(d["valor_fonte"]),
          gravidade: gravidade(d["gravidade"]),
          explicacao: texto(d["explicacao"]),
        }))
      : [];

    const dadosDocumento: Record<string, string> = {};
    for (const [k, v] of Object.entries(dd)) {
      const valor = texto(v);
      if (valor) dadosDocumento[k] = k === "cpf_mascarado" ? mascararCpf(valor) : valor;
    }
    if (!dadosDocumento["cpf_mascarado"]) {
      const mascarado = mascararCpf(a.dados.cpfPaciente);
      if (mascarado) dadosDocumento["cpf_mascarado"] = mascarado;
    }

    const assinaturaDigital =
      booleanOuNulo(ai["assinatura_digital_verificada"]) ?? a.assinaturaDigitalVerificada;

    const sinais = av["sinais_de_edicao"];
    const { resultado, rebaixado, exigeConfirmacao } = aplicarRegras(
      resultadoValido(j["resultado"]),
      regras,
      a.qrConfirmado,
      assinaturaDigital,
    );

    return {
      disponivel: true,
      mensagem: "",
      resultado,
      nivelConfianca: Math.min(100, Math.max(0, Math.round(Number(j["nivel_confianca"]) || 0))),
      resumo: texto(j["resumo"]),
      dadosDocumento,
      fontesVerificadas: Array.isArray(j["fontes_verificadas"])
        ? (j["fontes_verificadas"] as Array<Record<string, unknown>>).map((f) => {
            const of = f["oficialidade"];
            return {
              tipo: texto(f["tipo"]) || "outra",
              identificacao: texto(f["identificacao"]),
              oficialidade:
                of === "oficial" || of === "institucional" || of === "terceiro"
                  ? (of as "oficial" | "institucional" | "terceiro")
                  : "desconhecida",
              resultado: texto(f["resultado"]),
              dataConsulta: texto(f["data_consulta"]),
            };
          })
        : [],
      divergencias: [...regras, ...divergenciasIa],
      achadosTecnicos: Array.isArray(j["achados_tecnicos"])
        ? (j["achados_tecnicos"] as Array<Record<string, unknown>>).map((t) => {
            const tipo = t["tipo"];
            return {
              achado: texto(t["achado"]),
              tipo:
                tipo === "fato" || tipo === "limitacao"
                  ? (tipo as "fato" | "limitacao")
                  : "indicio",
              impacto: impacto(t["impacto"]),
            };
          })
        : [],
      assinaturaIntegridade: {
        assinaturaDigitalVerificada: assinaturaDigital,
        assinaturaVisualPresente:
          booleanOuNulo(ai["assinatura_visual_presente"]) ?? a.dados.assinaturaDetectada,
        arquivoAssinadoCriptograficamente: booleanOuNulo(ai["arquivo_assinado_criptograficamente"]),
        hashSha256: texto(ai["hash_sha256"]) || a.arquivo.hash,
        observacoes: texto(ai["observacoes"]),
      },
      analiseVisual: {
        formatoArquivo: texto(av["formato_arquivo"]) || a.arquivo.tipo,
        mimeType: texto(av["mime_type"]) || a.arquivo.tipo,
        dimensoes: texto(av["dimensoes"]),
        resolucaoDpi: texto(av["resolucao_dpi"]),
        orientacao: texto(av["orientacao"]),
        qualidadeVisual: texto(av["qualidade_visual"]) || "nao_informada",
        qrCodeDetectado: booleanOuNulo(av["qr_code_detectado"]) ?? a.dados.qrCodeDetectado,
        codigoBarrasDetectado: booleanOuNulo(av["codigo_barras_detectado"]),
        carimboDetectado: booleanOuNulo(av["carimbo_detectado"]) ?? a.dados.carimboDetectado,
        assinaturaVisualDetectada:
          booleanOuNulo(av["assinatura_visual_detectada"]) ?? a.dados.assinaturaDetectada,
        logotipoDetectado: booleanOuNulo(av["logotipo_detectado"]),
        documentoCortado: booleanOuNulo(av["documento_cortado"]),
        perspectivaOuInclinacao: texto(av["perspectiva_ou_inclinacao"]),
        sinaisDeEdicao:
          sinais === "nao_observados" || sinais === "possiveis" || sinais === "fortes"
            ? (sinais as "nao_observados" | "possiveis" | "fortes")
            : "inconclusivo",
        areasSuspeitas: Array.isArray(av["areas_suspeitas"])
          ? (av["areas_suspeitas"] as Array<Record<string, unknown>>).map((s) => ({
              regiao: texto(s["regiao"]) || "outra",
              descricao: texto(s["descricao"]),
              impacto: impacto(s["impacto"]),
            }))
          : [],
        observacoes: texto(av["observacoes"]),
      },
      recomendacoes: lista(j["recomendacoes"]),
      mensagemOperacional: texto(j["mensagem_operacional"]),
      regrasDeterministicas: regras,
      rebaixadoPorRegra: rebaixado,
      exigeConfirmacaoHumana: exigeConfirmacao,
    };
  } catch (err) {
    return {
      ...VAZIO,
      regrasDeterministicas: regras,
      divergencias: regras,
      exigeConfirmacaoHumana: true,
      mensagem:
        "Não foi possível emitir o parecer de autenticidade: " +
        (err instanceof Error ? err.message : "erro desconhecido"),
    };
  }
}

export const ROTULO_RESULTADO: Record<ResultadoParecer, string> = {
  validado: "Validado",
  aparentemente_consistente: "Aparentemente consistente",
  inconsistente: "Inconsistente",
  alto_risco_nao_validado: "Alto risco · não validado",
  inconclusivo: "Inconclusivo",
};
