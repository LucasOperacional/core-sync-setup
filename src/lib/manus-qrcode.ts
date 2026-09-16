/**
 * Validação do QR Code do atestado com a Manus AI.
 *
 * Recebe o conteúdo lido do QR (URL ou código) e os dados lidos do atestado
 * (médico, CRM, paciente, datas). A Manus abre o link/consulta o código no
 * portal emissor e devolve, em JSON, o que o próprio emissor mostra — em
 * especial o nome do médico — comparando com o que está impresso no atestado.
 */

import { manusExecutarTarefa } from "./manus.functions";
import { loadManusConfig, hasManusKey } from "./manus-ai";
import type { QrCodeLido } from "./atestado-qrcode";

export interface QrCampoValidado {
  campo: string;
  valorNoQrCode: string;
  valorNoAtestado: string;
  situacao: "confere" | "divergente" | "nao_encontrado";
}

export interface QrCodeValidacao {
  disponivel: boolean;
  mensagem: string;
  /** QR Codes lidos localmente do documento. */
  codigos: QrCodeLido[];
  /** Página emissora aberta pela Manus. */
  emissor: string;
  urlVerificada: string;
  /** O portal confirmou o documento? */
  documentoConfirmado: "sim" | "nao" | "indeterminado";
  nomeMedicoNoQrCode: string;
  crmNoQrCode: string;
  nomePacienteNoQrCode: string;
  dataNoQrCode: string;
  medicoConfere: "sim" | "nao" | "indeterminado";
  campos: QrCampoValidado[];
  alertas: string[];
  conclusao: string;
  fontes: Array<{ titulo: string; url: string }>;
  taskId: string;
}

const VAZIO: QrCodeValidacao = {
  disponivel: false,
  mensagem: "",
  codigos: [],
  emissor: "",
  urlVerificada: "",
  documentoConfirmado: "indeterminado",
  nomeMedicoNoQrCode: "",
  crmNoQrCode: "",
  nomePacienteNoQrCode: "",
  dataNoQrCode: "",
  medicoConfere: "indeterminado",
  campos: [],
  alertas: [],
  conclusao: "",
  fontes: [],
  taskId: "",
};

function texto(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function lista(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function trio(raw: unknown): "sim" | "nao" | "indeterminado" {
  return raw === "sim" || raw === "nao" ? raw : "indeterminado";
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

export interface DadosAtestadoParaQr {
  nomeMedico: string;
  crm: string;
  ufCrm: string;
  nomePaciente: string;
  cpfPaciente: string;
  dataConsulta: string;
  nomeHospital: string;
  codigoValidacao: string;
}

function montarPrompt(codigos: QrCodeLido[], d: DadosAtestadoParaQr): string {
  const nd = "Não identificado";
  const ou = (v: string) => (v && v !== nd ? v : "não informado");
  const listaCodigos = codigos
    .map((c, i) => `${i + 1}. (página ${c.pagina}) ${c.conteudo}`)
    .join("\n");

  return `Você é um verificador de atestados médicos brasileiros. Abaixo está o conteúdo lido do QR Code impresso em um atestado. Acesse o link (ou o portal do emissor, informando o código quando o site pedir) e confira o que o EMISSOR mostra sobre esse documento. Devolva SOMENTE um JSON válido, sem markdown.

Conteúdo lido do QR Code:
${listaCodigos}

Dados impressos no atestado (para comparação):
- Médico: ${ou(d.nomeMedico)}
- CRM: ${ou(d.crm)} ${d.ufCrm && d.ufCrm !== nd ? `(${d.ufCrm})` : ""}
- Paciente: ${ou(d.nomePaciente)}
- CPF do paciente: ${ou(d.cpfPaciente)}
- Data da consulta: ${ou(d.dataConsulta)}
- Hospital/Clínica: ${ou(d.nomeHospital)}
- Código de validação impresso: ${ou(d.codigoValidacao)}

Regras obrigatórias:
- Abra a URL do QR Code. Se ela exigir um código/hash, use o próprio conteúdo do QR ou o código de validação impresso.
- Se o site estiver fora do ar, exigir login, ou não permitir acesso, diga isso em "conclusao" e use "indeterminado".
- NUNCA invente dados: só preencha o que a página do emissor realmente mostrar.
- Compare especialmente o NOME DO MÉDICO mostrado pelo emissor com o nome impresso no atestado. Nomes iguais com abreviação ou acento diferente contam como "confere"; nomes de pessoas diferentes são "divergente".
- Verifique também se o domínio do QR Code pertence de fato ao hospital/clínica/sistema emissor citado no atestado; se não pertencer, gere alerta.

Formato exato do JSON:
{
  "emissor": "nome do site/sistema que validou",
  "urlVerificada": "",
  "documentoConfirmado": "sim|nao|indeterminado",
  "nomeMedicoNoQrCode": "",
  "crmNoQrCode": "",
  "nomePacienteNoQrCode": "",
  "dataNoQrCode": "",
  "medicoConfere": "sim|nao|indeterminado",
  "campos": [ { "campo": "", "valorNoQrCode": "", "valorNoAtestado": "", "situacao": "confere|divergente|nao_encontrado" } ],
  "alertas": [""],
  "conclusao": "parecer curto em português do Brasil",
  "fontes": [ { "titulo": "", "url": "" } ]
}`;
}

/**
 * Valida com a Manus os QR Codes já lidos do documento. Nunca lança.
 */
export async function validarQrCodeComManus(
  codigos: QrCodeLido[],
  dados: DadosAtestadoParaQr,
  onProgress?: (etapa: string) => void,
): Promise<QrCodeValidacao> {
  if (!codigos.length) {
    return {
      ...VAZIO,
      mensagem: "Nenhum QR Code foi lido nas imagens deste documento.",
    };
  }

  if (!hasManusKey()) {
    return {
      ...VAZIO,
      codigos,
      mensagem:
        "QR Code lido, mas a validação online precisa da chave da Manus AI (card “Manus AI” da IA Operacional).",
    };
  }

  const config = loadManusConfig();
  onProgress?.("Validando o QR Code do atestado com a Manus AI...");

  try {
    const res = await manusExecutarTarefa({
      data: {
        apiKey: config.apiKey,
        prompt: montarPrompt(codigos, dados),
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
      onProgress?.("Organizando o resultado do QR Code...");
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

    return {
      disponivel: true,
      mensagem: "",
      codigos,
      emissor: texto(j["emissor"]),
      urlVerificada: texto(j["urlVerificada"]) || codigos[0]?.url || "",
      documentoConfirmado: trio(j["documentoConfirmado"]),
      nomeMedicoNoQrCode: texto(j["nomeMedicoNoQrCode"]),
      crmNoQrCode: texto(j["crmNoQrCode"]),
      nomePacienteNoQrCode: texto(j["nomePacienteNoQrCode"]),
      dataNoQrCode: texto(j["dataNoQrCode"]),
      medicoConfere: trio(j["medicoConfere"]),
      campos: Array.isArray(j["campos"])
        ? (j["campos"] as Array<Record<string, unknown>>).map((c) => {
            const s = c["situacao"];
            return {
              campo: texto(c["campo"]),
              valorNoQrCode: texto(c["valorNoQrCode"]),
              valorNoAtestado: texto(c["valorNoAtestado"]),
              situacao:
                s === "divergente" || s === "nao_encontrado"
                  ? (s as "divergente" | "nao_encontrado")
                  : "confere",
            };
          })
        : [],
      alertas: lista(j["alertas"]),
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
      codigos,
      mensagem:
        "A Manus AI não concluiu a validação do QR Code: " +
        (err instanceof Error ? err.message : "erro desconhecido"),
    };
  }
}
