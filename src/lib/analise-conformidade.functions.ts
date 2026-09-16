/**
 * Análise de conformidade com GEMINI (Lovable AI Gateway).
 *
 * Recebe os pares pergunta/resposta agregados dos relatórios do NEXTI CONTROL 2.0
 * e devolve a classificação semântica de cada resposta (conforme / não conforme /
 * neutro), a severidade e a ação recomendada — muito mais preciso que a
 * heurística por texto usada na importação.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  contexto: z.string().max(300).optional(),
  itens: z
    .array(
      z.object({
        pergunta: z.string().min(1).max(400),
        resposta: z.string().max(400),
        quantidade: z.number().int().min(0).max(100000),
      }),
    )
    .min(1)
    .max(120),
});

export type ClassificacaoGemini = {
  pergunta: string;
  resposta: string;
  classificacao: "conforme" | "nao_conforme" | "neutro";
  severidade: "nenhuma" | "baixa" | "media" | "alta";
  motivo: string;
  acao: string;
};

export type AnaliseConformidadeGemini = {
  classificacoes: ClassificacaoGemini[];
  resumo: string;
  prioridades: string[];
  modelo: string;
};

const MODELOS = ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];

const PROMPT = `Você é auditor de qualidade de supervisão de postos (empresa de facilities/portaria/limpeza) e analisa checklists do sistema NEXTI CONTROL 2.0.

Para CADA par pergunta/resposta recebido, classifique:
- "conforme": a resposta indica que o item está adequado / dentro do padrão / tratado.
- "nao_conforme": a resposta indica falha, ausência, irregularidade, reprovação do cliente, equipamento fora de conformidade, efetivo incompleto, etc.
- "neutro": a resposta é apenas informativa e não representa falha do posto (ex.: "esse posto não possui serviço de portaria", "não ocorreu contato direto com o cliente", resposta vazia). Neutro NÃO conta como não conformidade.

Devolva SOMENTE JSON válido:
{
  "classificacoes": [
    { "pergunta": "texto exatamente como recebido", "resposta": "texto exatamente como recebido", "classificacao": "conforme|nao_conforme|neutro", "severidade": "nenhuma|baixa|media|alta", "motivo": "1 frase objetiva", "acao": "ação recomendada curta ou vazio" }
  ],
  "resumo": "2 a 4 frases sobre o estado de conformidade da operação analisada",
  "prioridades": ["até 5 ações prioritárias, da mais crítica para a menos crítica"]
}
Regras: use exatamente os textos recebidos nos campos pergunta/resposta; classifique TODOS os itens; severidade "nenhuma" para conforme e neutro; considere a quantidade de ocorrências ao definir prioridades.`;

type Mensagem = { role: string; content: string };

async function chamarGateway(
  apiKey: string,
  messages: Mensagem[],
): Promise<{ texto: string; modelo: string }> {
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
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { texto: json.choices?.[0]?.message?.content?.trim() ?? "", modelo: model };
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
      if (res.status === 402)
        throw new Error("Os créditos de IA do projeto acabaram. Adicione créditos para continuar.");
      if (res.status === 403)
        throw new Error("A IA está bloqueada pelas configurações do workspace.");
      break;
    }
  }
  throw new Error(`Falha ao consultar o Gemini. ${ultimoErro}`);
}

export const analisarConformidadeGemini = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<AnaliseConformidadeGemini> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Análise indisponível: chave da IA do projeto ausente.");

    const lista = data.itens
      .map(
        (i, idx) =>
          `${idx + 1}. PERGUNTA: ${i.pergunta}\n   RESPOSTA: ${i.resposta || "(vazia)"}\n   OCORRÊNCIAS: ${i.quantidade}`,
      )
      .join("\n");

    const { texto, modelo } = await chamarGateway(apiKey, [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: `${data.contexto ? `Escopo: ${data.contexto}\n\n` : ""}Pares pergunta/resposta:\n${lista}`,
      },
    ]);

    const limpo = texto
      .replace(/^```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio === -1 || fim === -1) throw new Error("O Gemini não devolveu um JSON válido.");

    const parsed = JSON.parse(limpo.slice(inicio, fim + 1)) as Partial<AnaliseConformidadeGemini>;
    const classificacoes = (parsed.classificacoes ?? []).map((c) => ({
      pergunta: String(c?.pergunta ?? ""),
      resposta: String(c?.resposta ?? ""),
      classificacao: (["conforme", "nao_conforme", "neutro"] as const).includes(
        c?.classificacao as never,
      )
        ? (c.classificacao as ClassificacaoGemini["classificacao"])
        : "neutro",
      severidade: (["nenhuma", "baixa", "media", "alta"] as const).includes(c?.severidade as never)
        ? (c.severidade as ClassificacaoGemini["severidade"])
        : "nenhuma",
      motivo: String(c?.motivo ?? ""),
      acao: String(c?.acao ?? ""),
    }));

    return {
      classificacoes,
      resumo: String(parsed.resumo ?? ""),
      prioridades: Array.isArray(parsed.prioridades)
        ? parsed.prioridades.map(String).slice(0, 5)
        : [],
      modelo,
    };
  });
