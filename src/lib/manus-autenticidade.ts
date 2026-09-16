/**
 * Investigação completa de autenticidade do atestado com a Manus AI.
 *
 * Assim que um atestado (PDF ou foto) é importado, esta etapa envia à Manus AI
 * todos os dados já lidos do documento e pede uma investigação real na
 * internet: portal do CFM/CRM, portal emissor do QR Code, CNES, CNPJ do
 * estabelecimento e notícias de sanções. A Manus devolve, em JSON, o veredito
 * de autenticidade (autêntico, suspeito, falso ou inconclusivo) com cada
 * evidência e a fonte consultada.
 *
 * Nunca lança: em falha devolve `disponivel: false` com a mensagem.
 */

import { manusExecutarTarefa } from "./manus.functions";
import { loadManusConfig, hasManusKey } from "./manus-ai";
import { mascararCpf } from "./atestado-parecer";

export type VereditoManus = "autentico" | "suspeito" | "falso" | "inconclusivo";

export interface ManusEvidencia {
  campo: string;
  valorNoAtestado: string;
  valorNaFonte: string;
  situacao: "confere" | "divergente" | "nao_encontrado";
  fonte: string;
  comentario: string;
}

export interface ManusIndicioFraude {
  indicio: string;
  gravidade: "baixa" | "media" | "alta";
  fonte: string;
}

export interface ManusAutenticidade {
  disponivel: boolean;
  mensagem: string;
  veredito: VereditoManus;
  probabilidadeFalsidade: number; // 0–100
  confianca: number; // 0–100
  /** O registro do médico foi confirmado em fonte oficial? */
  registroMedicoConfirmado: "sim" | "nao" | "indeterminado";
  /** O estabelecimento existe e está ativo? */
  estabelecimentoConfirmado: "sim" | "nao" | "indeterminado";
  /** O emissor/portal confirmou este documento? */
  documentoConfirmadoPeloEmissor: "sim" | "nao" | "indeterminado";
  evidencias: ManusEvidencia[];
  indiciosFraude: ManusIndicioFraude[];
  investigacoesRealizadas: string[];
  limitacoes: string[];
  recomendacao: "aceitar" | "revisar" | "recusar" | "indisponivel";
  parecer: string;
  fontes: Array<{ titulo: string; url: string }>;
  /** Relatório completo, exatamente como a Manus AI devolveu. */
  relatorioCompleto: string;
  taskId: string;
}

const VAZIO: ManusAutenticidade = {
  disponivel: false,
  mensagem: "",
  veredito: "inconclusivo",
  probabilidadeFalsidade: 0,
  confianca: 0,
  registroMedicoConfirmado: "indeterminado",
  estabelecimentoConfirmado: "indeterminado",
  documentoConfirmadoPeloEmissor: "indeterminado",
  evidencias: [],
  indiciosFraude: [],
  investigacoesRealizadas: [],
  limitacoes: [],
  recomendacao: "indisponivel",
  parecer: "",
  fontes: [],
  relatorioCompleto: "",
  taskId: "",
};

/* ─────────── Utilidades ─────────── */

const ND = "Não identificado";

function texto(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  return "";
}

function lista(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => texto(v)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function trio(raw: unknown): "sim" | "nao" | "indeterminado" {
  return raw === "sim" || raw === "nao" ? raw : "indeterminado";
}

function numero(raw: unknown): number {
  return Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));
}

function informado(v: string): boolean {
  return Boolean(v) && v !== ND && v.toLowerCase() !== "não informado";
}

function extrairJson(conteudo: string): Record<string, unknown> {
  const limpo = conteudo.replace(/```(?:json)?/gi, "```").trim();
  const candidatos: string[] = [];
  for (const m of limpo.matchAll(/```([\s\S]*?)```/g)) {
    const c = (m[1] ?? "").trim();
    if (c.includes("{")) candidatos.push(c);
  }
  const i = limpo.indexOf("{");
  const f = limpo.lastIndexOf("}");
  if (i !== -1 && f > i) candidatos.push(limpo.slice(i, f + 1));

  for (const bruto of candidatos) {
    const a = bruto.indexOf("{");
    const b = bruto.lastIndexOf("}");
    if (a === -1 || b <= a) continue;
    try {
      const parsed = JSON.parse(bruto.slice(a, b + 1));
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* próximo candidato */
    }
  }
  throw new Error("A Manus não devolveu um JSON válido.");
}

/* ─────────── Entrada ─────────── */

export interface DadosParaManusAutenticidade {
  arquivo: { nome: string; tipo: string; tamanho: number; hash: string };
  nomePaciente: string;
  cpfPaciente: string;
  nomeMedico: string;
  crm: string;
  ufCrm: string;
  especialidade: string;
  cid: string;
  cidDescricao: string;
  dataConsulta: string;
  diasAfastamento: string;
  dataInicioAfastamento: string;
  dataFimAfastamento: string;
  nomeHospital: string;
  enderecoHospital: string;
  cnpjHospital: string;
  telefoneHospital: string;
  codigoValidacao: string;
  qrCodeDetectado: boolean;
  qrCodeConteudo: string[];
  assinaturaDetectada: boolean;
  carimboDetectado: boolean;
  observacoes: string;
  /** Texto do documento (OCR/PDF), já truncado pelo chamador. */
  textoExtraido: string;
  /** Alertas e divergências que o sistema já detectou. */
  alertasDoSistema: string[];
}

function montarPrompt(d: DadosParaManusAutenticidade): string {
  const ou = (v: string) => (informado(v) ? v : "não informado");

  return `Você é um analista de autenticidade documental especializado em atestados médicos brasileiros. Investigue NA INTERNET, em fontes oficiais, se o atestado descrito abaixo é autêntico ou falso. Devolva SOMENTE um JSON válido, sem markdown e sem texto fora do JSON.

ARQUIVO IMPORTADO
- Nome: ${d.arquivo.nome}
- Tipo: ${d.arquivo.tipo}
- Tamanho: ${d.arquivo.tamanho} bytes
- Hash SHA-256: ${d.arquivo.hash}
- Data da análise: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

DADOS LIDOS NO ATESTADO
- Paciente: ${ou(d.nomePaciente)}
- CPF do paciente (mascarado): ${mascararCpf(d.cpfPaciente) || "não informado"}
- Médico: ${ou(d.nomeMedico)}
- CRM: ${ou(d.crm)} ${informado(d.ufCrm) ? `(UF ${d.ufCrm})` : ""}
- Especialidade: ${ou(d.especialidade)}
- CID: ${ou(d.cid)} ${informado(d.cidDescricao) ? `— ${d.cidDescricao}` : ""}
- Data do atendimento: ${ou(d.dataConsulta)}
- Afastamento: ${ou(d.diasAfastamento)} dia(s), de ${ou(d.dataInicioAfastamento)} a ${ou(d.dataFimAfastamento)}
- Estabelecimento: ${ou(d.nomeHospital)}
- Endereço: ${ou(d.enderecoHospital)}
- CNPJ: ${ou(d.cnpjHospital)}
- Telefone: ${ou(d.telefoneHospital)}
- Código de validação impresso: ${ou(d.codigoValidacao)}
- QR Code detectado: ${d.qrCodeDetectado ? "sim" : "não"}${d.qrCodeConteudo.length ? `\n- Conteúdo do QR Code: ${d.qrCodeConteudo.join(" | ")}` : ""}
- Assinatura visual: ${d.assinaturaDetectada ? "presente" : "não localizada"} · Carimbo: ${d.carimboDetectado ? "presente" : "não localizado"}
- Observações da leitura: ${ou(d.observacoes)}

TEXTO DO DOCUMENTO
${d.textoExtraido.trim().slice(0, 5000) || "(sem texto disponível)"}

ALERTAS JÁ DETECTADOS PELO SISTEMA
${d.alertasDoSistema.length ? d.alertasDoSistema.map((a) => `- ${a}`).join("\n") : "- (nenhum)"}

INVESTIGAÇÃO OBRIGATÓRIA, NESTA ORDEM
1. Portal de busca de médicos do CFM: o CRM informado existe, está ATIVO e pertence a esse nome? A especialidade confere?
2. Site do CRM da UF informada: situação do registro e eventuais sanções éticas.
3. Se houver QR Code ou código de validação: abra o link/portal do emissor e verifique se ESTE documento é confirmado, comparando médico, paciente e datas.
4. CNES e Receita Federal (CNPJ): o estabelecimento existe, está ativo e o endereço confere?
5. Notícias e decisões públicas sobre fraude, cassação ou suspensão envolvendo esse médico ou esse estabelecimento.
6. Confira a coerência interna: dias de afastamento x datas de início/fim, CID x especialidade, data do atendimento x período.

REGRAS
- NUNCA invente informação: o que não for confirmado fica vazio ou "nao_encontrado", e entra em "limitacoes".
- Cada evidência precisa da URL da fonte consultada em "fonte".
- Divergência de médico, CRM, paciente, data de atendimento ou período de afastamento entre o documento e a fonte oficial é indício GRAVE.
- Só use veredito "falso" quando houver evidência objetiva de fonte oficial (registro inexistente, documento negado pelo emissor, dados incompatíveis). Havendo dúvida, use "suspeito" ou "inconclusivo".
- Só use "autentico" quando fonte oficial ou o próprio emissor confirmar o documento.
- Não reproduza CPF completo nem detalhe clínico desnecessário.
- Escreva em português do Brasil, de forma objetiva.

FORMATO EXATO DO JSON
{
  "veredito": "autentico|suspeito|falso|inconclusivo",
  "probabilidadeFalsidade": 0,
  "confianca": 0,
  "registroMedicoConfirmado": "sim|nao|indeterminado",
  "estabelecimentoConfirmado": "sim|nao|indeterminado",
  "documentoConfirmadoPeloEmissor": "sim|nao|indeterminado",
  "evidencias": [
    { "campo": "", "valorNoAtestado": "", "valorNaFonte": "", "situacao": "confere|divergente|nao_encontrado", "fonte": "", "comentario": "" }
  ],
  "indiciosFraude": [ { "indicio": "", "gravidade": "baixa|media|alta", "fonte": "" } ],
  "investigacoesRealizadas": [""],
  "limitacoes": [""],
  "recomendacao": "aceitar|revisar|recusar",
  "parecer": "",
  "fontes": [ { "titulo": "", "url": "" } ]
}`;
}

/* ─────────── Execução ─────────── */

/**
 * Investiga a autenticidade do atestado com a Manus AI. Nunca lança.
 */
export async function investigarAtestadoComManus(
  d: DadosParaManusAutenticidade,
  onProgress?: (etapa: string) => void,
): Promise<ManusAutenticidade> {
  if (!hasManusKey()) {
    return {
      ...VAZIO,
      mensagem:
        "A investigação de autenticidade precisa da chave da Manus AI (card “Manus AI” da IA Operacional).",
    };
  }

  if (!informado(d.nomeMedico) && !informado(d.crm) && !d.qrCodeConteudo.length) {
    return {
      ...VAZIO,
      mensagem:
        "Não foi possível investigar: o documento não trouxe médico, CRM nem QR Code para conferência.",
    };
  }

  const config = loadManusConfig();
  onProgress?.("Investigando a autenticidade do atestado com a Manus AI...");

  try {
    const res = await manusExecutarTarefa({
      data: {
        apiKey: config.apiKey,
        prompt: montarPrompt(d),
        agentProfile: config.agentProfile,
        locale: config.locale || "pt-BR",
        hideInTaskList: config.hideInTaskList,
        timeoutMs: 270_000,
      },
    });

    let j: Record<string, unknown>;
    let taskId = res.taskId;
    let relatorioCompleto = res.content ?? "";
    try {
      j = extrairJson(res.content);
    } catch {
      onProgress?.("Organizando o resultado da investigação...");
      const res2 = await manusExecutarTarefa({
        data: {
          apiKey: config.apiKey,
          taskId: res.taskId,
          prompt:
            "Devolva agora SOMENTE o JSON no formato exato pedido antes, sem markdown, sem comentários e sem texto fora do JSON.",
          agentProfile: config.agentProfile,
          locale: config.locale || "pt-BR",
          hideInTaskList: config.hideInTaskList,
          timeoutMs: 180_000,
        },
      });
      taskId = res2.taskId || res.taskId;
      relatorioCompleto = [res.content, res2.content].filter(Boolean).join("\n\n");
      j = extrairJson(res2.content);
    }

    const vRaw = j["veredito"];
    const veredito: VereditoManus =
      vRaw === "autentico" || vRaw === "suspeito" || vRaw === "falso"
        ? (vRaw as VereditoManus)
        : "inconclusivo";

    const rRaw = j["recomendacao"];
    const recomendacao =
      rRaw === "aceitar" || rRaw === "revisar" || rRaw === "recusar"
        ? (rRaw as "aceitar" | "revisar" | "recusar")
        : "revisar";

    const evidencias: ManusEvidencia[] = Array.isArray(j["evidencias"])
      ? (j["evidencias"] as Array<Record<string, unknown>>).map((e) => {
          const s = e["situacao"];
          return {
            campo: texto(e["campo"]),
            valorNoAtestado: texto(e["valorNoAtestado"]),
            valorNaFonte: texto(e["valorNaFonte"]),
            situacao:
              s === "divergente" || s === "nao_encontrado"
                ? (s as "divergente" | "nao_encontrado")
                : "confere",
            fonte: texto(e["fonte"]),
            comentario: texto(e["comentario"]),
          };
        })
      : [];

    const indiciosFraude: ManusIndicioFraude[] = Array.isArray(j["indiciosFraude"])
      ? (j["indiciosFraude"] as Array<Record<string, unknown>>)
          .map((i): ManusIndicioFraude => {
            const g = i["gravidade"];
            return {
              indicio: texto(i["indicio"]),
              gravidade: g === "alta" || g === "media" ? g : "baixa",
              fonte: texto(i["fonte"]),
            };
          })
          .filter((i) => i.indicio)
      : [];

    const registroMedicoConfirmado = trio(j["registroMedicoConfirmado"]);
    const documentoConfirmadoPeloEmissor = trio(j["documentoConfirmadoPeloEmissor"]);

    // Regra do sistema: registro inexistente ou documento negado pelo emissor
    // nunca pode terminar como "autentico".
    const vereditoFinal: VereditoManus =
      veredito === "autentico" &&
      (registroMedicoConfirmado === "nao" || documentoConfirmadoPeloEmissor === "nao")
        ? "suspeito"
        : veredito;

    return {
      disponivel: true,
      mensagem: "",
      veredito: vereditoFinal,
      probabilidadeFalsidade: numero(j["probabilidadeFalsidade"]),
      confianca: numero(j["confianca"]),
      registroMedicoConfirmado,
      estabelecimentoConfirmado: trio(j["estabelecimentoConfirmado"]),
      documentoConfirmadoPeloEmissor,
      evidencias,
      indiciosFraude,
      investigacoesRealizadas: lista(j["investigacoesRealizadas"]),
      limitacoes: lista(j["limitacoes"]),
      recomendacao,
      parecer: texto(j["parecer"]),
      fontes: Array.isArray(j["fontes"])
        ? (j["fontes"] as Array<Record<string, unknown>>)
            .map((f) => ({ titulo: texto(f["titulo"]), url: texto(f["url"]) }))
            .filter((f) => f.url)
        : [],
      relatorioCompleto,
      taskId,
    };
  } catch (err) {
    return {
      ...VAZIO,
      mensagem:
        "A Manus AI não concluiu a investigação de autenticidade: " +
        (err instanceof Error ? err.message : "erro desconhecido"),
    };
  }
}

export const ROTULO_VEREDITO_MANUS: Record<VereditoManus, string> = {
  autentico: "Atestado autêntico",
  suspeito: "Atestado suspeito",
  falso: "Atestado falso",
  inconclusivo: "Investigação inconclusiva",
};
