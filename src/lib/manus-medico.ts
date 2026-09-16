/**
 * Dossiê do médico com a Manus AI.
 *
 * A Manus é um agente com navegação na internet: recebe os dados lidos do
 * atestado (médico, CRM, UF, especialidade, hospital) e devolve um dossiê
 * estruturado com tudo o que conseguiu confirmar publicamente — registro no
 * CRM/CFM, situação do registro, especialidades, locais de atendimento,
 * telefones, vínculos e sinais de irregularidade.
 */

import { manusExecutarTarefa } from "./manus.functions";
import { loadManusConfig, hasManusKey } from "./manus-ai";

export interface DossieItemMedico {
  campo: string;
  valor: string;
  fonte: string;
  situacao: "confirmado" | "divergente" | "nao_encontrado";
}

export interface DossieMedico {
  disponivel: boolean;
  mensagem: string;
  /** Nome completo confirmado do profissional. */
  nomeCompleto: string;
  crm: string;
  ufCrm: string;
  situacaoRegistro: string;
  registroValido: "sim" | "nao" | "indeterminado";
  especialidades: string[];
  inscricaoPrimaria: string;
  outrasInscricoes: string[];
  locaisAtendimento: string[];
  telefones: string[];
  enderecos: string[];
  vinculos: string[];
  sancoes: string[];
  detalhes: DossieItemMedico[];
  alertas: string[];
  riscoFraude: number; // 0–100
  confiabilidade: number; // 0–100
  conclusao: string;
  fontes: Array<{ titulo: string; url: string }>;
  taskId: string;
}

const VAZIO: DossieMedico = {
  disponivel: false,
  mensagem: "",
  nomeCompleto: "",
  crm: "",
  ufCrm: "",
  situacaoRegistro: "",
  registroValido: "indeterminado",
  especialidades: [],
  inscricaoPrimaria: "",
  outrasInscricoes: [],
  locaisAtendimento: [],
  telefones: [],
  enderecos: [],
  vinculos: [],
  sancoes: [],
  detalhes: [],
  alertas: [],
  riscoFraude: 0,
  confiabilidade: 0,
  conclusao: "",
  fontes: [],
  taskId: "",
};

function lista(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function texto(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function numero(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/**
 * A Manus é um agente conversacional: às vezes devolve o JSON dentro de um
 * bloco de código, cercado de texto, ou com mais de um bloco na mesma
 * resposta. Aqui tentamos todas essas formas antes de desistir.
 */
function extrairJson(conteudo: string): Record<string, unknown> {
  const limpo = conteudo.replace(/```(?:json)?/gi, "```").trim();
  const candidatos: string[] = [];

  // blocos ```...```
  for (const m of limpo.matchAll(/```([\s\S]*?)```/g)) {
    const c = (m[1] ?? "").trim();
    if (c.includes("{")) candidatos.push(c);
  }
  // maior trecho entre a primeira { e a última }
  const i = limpo.indexOf("{");
  const f = limpo.lastIndexOf("}");
  if (i !== -1 && f > i) candidatos.push(limpo.slice(i, f + 1));

  for (const bruto of candidatos) {
    const a = bruto.indexOf("{");
    const b = bruto.lastIndexOf("}");
    if (a === -1 || b <= a) continue;
    const alvo = bruto.slice(a, b + 1);
    try {
      const parsed = JSON.parse(alvo);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* tenta o próximo candidato */
    }
  }

  throw new Error("A Manus não devolveu um JSON válido.");
}

export interface DadosMedicoParaDossie {
  nomeMedico: string;
  crm: string;
  ufCrm: string;
  especialidade: string;
  nomeHospital: string;
  enderecoHospital: string;
  cnpjHospital: string;
  cid: string;
  dataConsulta: string;
}

function montarPrompt(d: DadosMedicoParaDossie): string {
  const nd = "Não identificado";
  const ou = (v: string) => (v && v !== nd ? v : "não informado");

  return `Você é um investigador de documentos médicos brasileiros. Pesquise na internet TUDO o que puder confirmar sobre o médico abaixo, que assinou um atestado médico, e devolva SOMENTE um JSON válido (sem markdown).

Dados lidos do atestado:
- Médico: ${ou(d.nomeMedico)}
- CRM: ${ou(d.crm)}
- UF do CRM: ${ou(d.ufCrm)}
- Especialidade informada: ${ou(d.especialidade)}
- Hospital/Clínica: ${ou(d.nomeHospital)}
- Endereço informado: ${ou(d.enderecoHospital)}
- CNPJ informado: ${ou(d.cnpjHospital)}
- CID informado: ${ou(d.cid)}
- Data da consulta: ${ou(d.dataConsulta)}

Fontes obrigatórias a consultar (quando acessíveis): portal de consulta de CRM do CFM (portal.cfm.org.br/busca-medicos), o site do CRM da UF informada, Cadastro Nacional de Estabelecimentos de Saúde (CNES), Doctoralia/BoaConsulta, Receita Federal (CNPJ do estabelecimento) e notícias públicas sobre sanções éticas.

Regras:
- Nunca invente dados. O que não for confirmado deve vir vazio ou com situacao "nao_encontrado".
- Compare cada dado do atestado com o que encontrou e marque "divergente" quando não bater.
- Cite a URL da fonte de cada informação.

Formato exato do JSON:
{
  "nomeCompleto": "",
  "crm": "",
  "ufCrm": "",
  "situacaoRegistro": "ex.: Ativo / Regular / Cancelado / Suspenso",
  "registroValido": "sim|nao|indeterminado",
  "especialidades": [""],
  "inscricaoPrimaria": "",
  "outrasInscricoes": [""],
  "locaisAtendimento": [""],
  "telefones": [""],
  "enderecos": [""],
  "vinculos": [""],
  "sancoes": [""],
  "detalhes": [ { "campo": "", "valor": "", "fonte": "url", "situacao": "confirmado|divergente|nao_encontrado" } ],
  "alertas": [""],
  "riscoFraude": 0,
  "confiabilidade": 0,
  "conclusao": "parecer curto em português do Brasil",
  "fontes": [ { "titulo": "", "url": "" } ]
}`;
}

/**
 * Executa o dossiê do médico na Manus. Nunca lança: devolve o objeto com
 * `disponivel: false` e a mensagem do motivo quando não for possível.
 */
export async function investigarMedicoComManus(
  dados: DadosMedicoParaDossie,
  onProgress?: (etapa: string) => void,
): Promise<DossieMedico> {
  if (!hasManusKey()) {
    return {
      ...VAZIO,
      mensagem:
        "Configure a chave da Manus AI no card “Manus AI” da IA Operacional para gerar o dossiê completo do médico.",
    };
  }

  const nd = "Não identificado";
  const temBase = (dados.nomeMedico && dados.nomeMedico !== nd) || (dados.crm && dados.crm !== nd);
  if (!temBase) {
    return {
      ...VAZIO,
      mensagem: "O documento não trouxe nome do médico nem CRM para pesquisar.",
    };
  }

  const config = loadManusConfig();
  onProgress?.("Investigando o médico com a Manus AI...");

  try {
    const res = await manusExecutarTarefa({
      data: {
        apiKey: config.apiKey,
        prompt: montarPrompt(dados),
        agentProfile: config.agentProfile,
        locale: config.locale || "pt-BR",
        hideInTaskList: config.hideInTaskList,
        timeoutMs: 270_000,
      },
    });

    let j: Record<string, unknown>;
    let taskId = res.taskId;
    try {
      j = extrairJson(res.content);
    } catch {
      // A Manus respondeu em texto: pedimos o JSON na mesma tarefa.
      onProgress?.("Organizando o dossiê do médico...");
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
      j = extrairJson(res2.content);
    }
    const rv = j["registroValido"];

    return {
      disponivel: true,
      mensagem: "",
      nomeCompleto: texto(j["nomeCompleto"]),
      crm: texto(j["crm"]),
      ufCrm: texto(j["ufCrm"]),
      situacaoRegistro: texto(j["situacaoRegistro"]),
      registroValido: rv === "sim" || rv === "nao" ? rv : "indeterminado",
      especialidades: lista(j["especialidades"]),
      inscricaoPrimaria: texto(j["inscricaoPrimaria"]),
      outrasInscricoes: lista(j["outrasInscricoes"]),
      locaisAtendimento: lista(j["locaisAtendimento"]),
      telefones: lista(j["telefones"]),
      enderecos: lista(j["enderecos"]),
      vinculos: lista(j["vinculos"]),
      sancoes: lista(j["sancoes"]),
      detalhes: Array.isArray(j["detalhes"])
        ? (j["detalhes"] as Array<Record<string, unknown>>).map((d) => {
            const s = d["situacao"];
            return {
              campo: texto(d["campo"]),
              valor: texto(d["valor"]),
              fonte: texto(d["fonte"]),
              situacao:
                s === "divergente" || s === "nao_encontrado"
                  ? (s as "divergente" | "nao_encontrado")
                  : "confirmado",
            };
          })
        : [],
      alertas: lista(j["alertas"]),
      riscoFraude: numero(j["riscoFraude"]),
      confiabilidade: numero(j["confiabilidade"]),
      conclusao: texto(j["conclusao"]),
      fontes: Array.isArray(j["fontes"])
        ? (j["fontes"] as Array<Record<string, unknown>>)
            .map((f) => ({ titulo: texto(f["titulo"]), url: texto(f["url"]) }))
            .filter((f) => f.url)
        : [],
      taskId,
    };
  } catch (err) {
    return {
      ...VAZIO,
      mensagem:
        "A Manus AI não concluiu o dossiê do médico: " +
        (err instanceof Error ? err.message : "erro desconhecido"),
    };
  }
}
