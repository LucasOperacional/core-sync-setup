/**
 * IA Operacional — auditoria independente de atestados médicos.
 *
 * Usa a IA nativa do projeto (Lovable AI Gateway, multimodal) para:
 *  - "extrair": ler o documento do zero, sem depender da chave Gemini do usuário;
 *  - "auditar": reler o documento e conferir, campo a campo, o que a leitura
 *    anterior (Gemini) extraiu, apontando divergências e risco de fraude.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const paginaSchema = z.string().startsWith("data:image/").max(9_000_000);

const schema = z.object({
  modo: z.enum(["extrair", "auditar", "parecer"]),
  paginas: z.array(paginaSchema).min(1).max(3),
  textoExtraido: z.string().max(12000).optional(),
  dadosPrevios: z.string().max(12000).optional(),
  parecerWeb: z.string().max(12000).optional(),
  /** Contexto auxiliar já montado pelo chamador (modo "parecer"). */
  contexto: z.string().max(24000).optional(),
});

const MODELOS = ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openai/gpt-5.4-mini"];

const PROMPT_EXTRACAO = `Você é um perito em documentos médicos brasileiros. Leia as imagens do atestado/declaração e devolva SOMENTE JSON:
{
  "qualidadeImagem": { "nota": 0-100, "legivel": true, "comentario": "" },
  "dados": {
    "nomePaciente": {"valor":"","confianca":0},
    "cpfPaciente": {"valor":"","confianca":0},
    "nomeMedico": {"valor":"","confianca":0},
    "crm": {"valor":"","confianca":0},
    "ufCrm": {"valor":"","confianca":0},
    "especialidade": {"valor":"","confianca":0},
    "cid": {"valor":"","confianca":0},
    "cidDescricao": {"valor":"","confianca":0},
    "dataConsulta": {"valor":"","confianca":0},
    "horaConsulta": {"valor":"","confianca":0},
    "diasAfastamento": {"valor":"","confianca":0},
    "dataInicioAfastamento": {"valor":"","confianca":0},
    "dataFimAfastamento": {"valor":"","confianca":0},
    "nomeHospital": {"valor":"","confianca":0},
    "enderecoHospital": {"valor":"","confianca":0},
    "cnpjHospital": {"valor":"","confianca":0},
    "telefoneHospital": {"valor":"","confianca":0},
    "codigoValidacao": {"valor":"","confianca":0},
    "qrCodeDetectado": false,
    "assinaturaDetectada": false,
    "carimboDetectado": false,
    "observacoes": ""
  },
  "alertas": [{"tipo":"","descricao":"","severidade":"baixa|media|alta"}],
  "confiancaGlobal": 0-100,
  "autenticidade": 0-100,
  "veredito": ""
}
Transcreva exatamente o que está escrito; nunca invente. Campo ausente = "Não identificado" com confianca 0. Datas em DD/MM/AAAA.`;

const PROMPT_AUDITORIA = `Você é a IA Operacional de auditoria de atestados médicos. Releia o documento nas imagens e CONFIRA, campo a campo, a leitura feita por outra IA. Devolva SOMENTE JSON:
{
  "conferencia": [
    { "campo": "", "valorLido": "", "valorInformado": "", "situacao": "confere|divergente|nao_verificavel", "comentario": "" }
  ],
  "divergencias": [ { "campo": "", "descricao": "", "severidade": "baixa|media|alta" } ],
  "coerencia": "",
  "riscoFraude": 0-100,
  "confiabilidade": 0-100,
  "recomendacao": "aceitar|revisar|recusar",
  "parecer": ""
}
Regras:
- "valorLido" é o que VOCÊ lê na imagem; "valorInformado" é o que veio da leitura anterior.
- Confira também coerência interna: dias de afastamento x datas de início/fim, CID x especialidade, data da consulta x período, presença de CRM/assinatura/carimbo, sinais de edição (fontes diferentes, alinhamento, rasura, recorte).
- Considere o parecer da pesquisa web, se houver, mas não invente informação que não esteja no documento.
- "parecer" é um texto curto e objetivo em português do Brasil.`;

const PROMPT_PARECER = `Você é um analista de autenticidade documental especializado em atestados médicos brasileiros. Sua função é auxiliar um sistema de validação documental, realizando análise técnica, comparação de dados e classificação de risco.

Você NÃO é perito criminal, médico, advogado ou autoridade pública. Nunca afirme categoricamente que um documento é falso, fraudado ou que houve crime com base apenas em indícios. Use classificações técnicas (validado, não validado, inconsistente, alto risco, inconclusivo) explicando objetivamente os fundamentos.

Objetivos: extrair e organizar os dados legíveis; conferir a consistência interna; comparar texto, imagem, metadados e dados de QR Code/código de validação/API; identificar divergências entre paciente, datas, período de afastamento, médico, CRM, UF, instituição, CID, assinatura e número do documento; avaliar se há assinatura digital criptograficamente verificável ou apenas imagem de assinatura/carimbo; distinguir fatos, indícios, limitações e conclusões; recomendar confirmação humana ou institucional quando a evidência for insuficiente; preservar a privacidade do paciente.

Análise visual: avalie MIME, extensão, tamanho, dimensões, resolução, orientação, páginas; nitidez, foco, iluminação, sombras, reflexos, perspectiva, cortes e legibilidade; OCR e localização aproximada dos campos; QR Codes, códigos de barras, selos, carimbos, logotipos e assinaturas; sinais de recorte, colagem, sobreposição, clonagem, compressão desigual ou edição localizada; incoerências de fonte, alinhamento, espaçamento, escala, cor e traço; áreas com aparência de montagem, apagamento ou preenchimento posterior; metadados como indícios auxiliares; diferença entre documento fotografado/escaneado e originalmente digital; comparação entre versões enviadas; e a possibilidade de o problema ser apenas baixa qualidade, compressão, perspectiva ou OCR incorreto.

Regras obrigatórias:
- Nunca considere o documento autêntico só por ter logotipo, carimbo, assinatura visual, QR Code ou página dizendo "validado".
- Um QR Code só valida o documento se os dados retornados coincidirem com os do arquivo analisado. Se o QR retornar outro médico, CRM, paciente, data, período, instituição ou identificador, classifique como inconsistente e, no mínimo, alto_risco_nao_validado.
- Não invente dados ausentes nem complete campos por suposição; buscadores privados não são comprovação oficial.
- Metadados de criação/modificação são indícios auxiliares, nunca prova isolada de falsidade.
- Assinatura desenhada ou em imagem não equivale a assinatura digital verificável; a ausência dela não prova falsidade de documento digitalizado.
- Não declare edição apenas por baixa resolução, ruído, compressão JPEG, ausência de EXIF ou aparência diferente: registre como "indicio" ou "limitacao".
- Informe a fonte, a data da consulta e a oficialidade de qualquer consulta externa.
- Não exponha CPF completo (mascare como ***.***.***-XX), dados clínicos ou informações pessoais desnecessárias.
- Não faça diagnóstico médico nem avalie a adequação clínica do afastamento; não acuse paciente, médico, clínica ou empregador.
- Conflitos entre documento e serviço de validação devem aparecer em "divergencias".
- Dados insuficientes ou imagem ilegível = "inconclusivo", indicando exatamente o que falta e quais campos não puderam ser avaliados.

Escala de "resultado" (use exatamente um): validado | aparentemente_consistente | inconsistente | alto_risco_nao_validado | inconclusivo.

Responda SOMENTE com JSON válido, sem Markdown e sem texto fora do objeto, neste formato:
{
  "resultado": "validado | aparentemente_consistente | inconsistente | alto_risco_nao_validado | inconclusivo",
  "nivel_confianca": 0,
  "resumo": "",
  "dados_documento": { "paciente": null, "cpf_mascarado": null, "data_atendimento": null, "data_emissao": null, "afastamento_dias": null, "inicio_afastamento": null, "fim_afastamento": null, "medico": null, "crm": null, "uf_crm": null, "instituicao": null, "municipio": null, "cid": null, "codigo_documento": null },
  "fontes_verificadas": [ { "tipo": "documento | qr_code | api | site_institucional | metadados | assinatura_digital | outra", "identificacao": "", "oficialidade": "oficial | institucional | terceiro | desconhecida", "resultado": "", "data_consulta": null } ],
  "divergencias": [ { "campo": "", "valor_documento": "", "valor_fonte": "", "gravidade": "baixa | media | alta", "explicacao": "" } ],
  "achados_tecnicos": [ { "achado": "", "tipo": "fato | indicio | limitacao", "impacto": "baixo | medio | alto" } ],
  "assinatura_e_integridade": { "assinatura_digital_verificada": null, "assinatura_visual_presente": null, "arquivo_assinado_criptograficamente": null, "hash_sha256": null, "observacoes": null },
  "analise_visual": { "formato_arquivo": null, "mime_type": null, "dimensoes": null, "resolucao_dpi": null, "orientacao": null, "qualidade_visual": "boa | aceitavel | baixa | ilegivel | nao_informada", "ocr_confianca": null, "qr_code_detectado": null, "codigo_barras_detectado": null, "carimbo_detectado": null, "assinatura_visual_detectada": null, "logotipo_detectado": null, "documento_cortado": null, "perspectiva_ou_inclinacao": null, "sinais_de_edicao": "nao_observados | possiveis | fortes | inconclusivo", "areas_suspeitas": [ { "regiao": "topo | corpo | assinatura | rodape | outra", "descricao": "", "impacto": "baixo | medio | alto" } ], "comparacao_entre_arquivos": null, "observacoes": null },
  "recomendacoes": [ "" ],
  "mensagem_operacional": ""
}
"nivel_confianca" é um inteiro de 0 a 100 e representa a confiança na classificação técnica, não a certeza de fraude.`;

type Mensagem = { role: string; content: unknown };

async function chamarGateway(apiKey: string, messages: Mensagem[]): Promise<string> {
  let ultimoErro = "";
  for (const model of MODELOS) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return json.choices?.[0]?.message?.content?.trim() ?? "";
      }

      const texto = await res.text().catch(() => "");
      ultimoErro = `HTTP ${res.status} (${model}) ${texto.slice(0, 200)}`;

      if (res.status === 429 || res.status >= 500) {
        const espera = Number(res.headers.get("retry-after")) * 1000;
        await new Promise((r) =>
          setTimeout(r, Number.isFinite(espera) && espera > 0 ? espera : 900 * (tentativa + 1)),
        );
        continue;
      }
      if (res.status === 402) {
        throw new Error("Os créditos de IA do projeto acabaram. Adicione créditos para continuar.");
      }
      if (res.status === 403) {
        throw new Error("A IA está bloqueada pelas configurações do workspace.");
      }
      break;
    }
  }
  throw new Error(`Falha ao consultar a IA Operacional. ${ultimoErro}`);
}

export const atestadoIaOperacional = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA Operacional indisponível: chave da IA do projeto ausente.");

    const hojeBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const instrucao =
      data.modo === "extrair"
        ? PROMPT_EXTRACAO
        : data.modo === "parecer"
          ? PROMPT_PARECER
          : PROMPT_AUDITORIA;

    const partes: Array<Record<string, unknown>> = [
      { type: "text", text: `${instrucao}\n\nHoje é ${hojeBR} (fuso de São Paulo).` },
    ];
    for (const pagina of data.paginas) {
      partes.push({ type: "image_url", image_url: { url: pagina } });
    }
    if (data.dadosPrevios?.trim()) {
      partes.push({
        type: "text",
        text: `LEITURA ANTERIOR (a conferir):\n${data.dadosPrevios.trim()}`,
      });
    }
    if (data.parecerWeb?.trim()) {
      partes.push({ type: "text", text: `PARECER DA PESQUISA WEB:\n${data.parecerWeb.trim()}` });
    }
    if (data.contexto?.trim()) {
      partes.push({ type: "text", text: data.contexto.trim() });
    }

    if (data.textoExtraido?.trim()) {
      partes.push({
        type: "text",
        text: `TEXTO EMBUTIDO NO ARQUIVO (apoio; a imagem tem prioridade):\n${data.textoExtraido.trim().slice(0, 6000)}`,
      });
    }

    const bruto = await chamarGateway(apiKey, [{ role: "user", content: partes }]);
    const limpo = bruto
      .replace(/^```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio === -1 || fim === -1) {
      throw new Error("A IA Operacional não devolveu um JSON válido.");
    }
    return { json: limpo.slice(inicio, fim + 1) };
  });
