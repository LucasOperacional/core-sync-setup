/**
 * Leitura assistida por GEMINI dos relatórios do NEXTI CONTROL 2.0.
 *
 * A extração local (pdf.js + heurísticas) é rápida mas pode falhar em layouts
 * diferentes, quebras de coluna e PDFs digitalizados. Esta função envia o texto
 * bruto de cada visita para o Gemini (Lovable AI Gateway) e devolve os dados
 * estruturados e já classificados, garantindo dados exatos por relatório.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  trechos: z
    .array(
      z.object({
        indice: z.number().int().min(0),
        texto: z.string().min(20).max(16000),
      }),
    )
    .min(1)
    .max(6),
});

export type RespostaLida = {
  pergunta: string;
  resposta: string;
  classificacao: "conforme" | "nao_conforme" | "neutro";
};

export type VisitaLida = {
  indice: number;
  cliente: string;
  local: string;
  posto: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  responsavel: string;
  cargo: string;
  inicio: string | null;
  fim: string | null;
  respostas: RespostaLida[];
  relatos: string[];
};

export type LeituraGemini = { visitas: VisitaLida[]; modelo: string };

const MODELOS = ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];

const PROMPT = `Você extrai dados de relatórios de visita de supervisão do sistema NEXTI CONTROL 2.0 (empresa de facilities/portaria/limpeza).

Receberá o TEXTO BRUTO de uma ou mais visitas (pode vir de OCR, com quebras de linha ruins e colunas embaralhadas). Para CADA trecho recebido devolva os dados exatos, sem inventar nada. Campo desconhecido = string vazia (ou null em inicio/fim).

Regras críticas:
- "responsavel" e "cargo" vêm do bloco REALIZADOR DA TAREFA (NOME: / CARGO:). Nunca use o nome do cliente ou do responsável do posto.
- "inicio"/"fim" no formato exato "dd/MM/yyyy HH:mm" (TAREFA INICIADA / TAREFA FINALIZADA).
- respostas: TODOS os pares pergunta/resposta do checklist, na ordem do documento, com o texto integral da pergunta e da resposta. Não repita itens, não corte a pergunta, não traduza.
- classificacao de cada resposta: "conforme" (item adequado/regular/tratado), "nao_conforme" (falha, ausência, irregularidade, efetivo incompleto, reprovação) ou "neutro" (apenas informativo, "não se aplica", posto sem o serviço, resposta vazia).
- relatos: textos livres do bloco RELATOS DA VISITA (sem assinaturas, sem rodapé de página).
- Ignore rodapés, números de página, "foto anexada" e blocos de assinatura.

Devolva SOMENTE JSON válido:
{"visitas":[{"indice":0,"cliente":"","local":"","posto":"","endereco":"","bairro":"","cidade":"","uf":"","responsavel":"","cargo":"","inicio":null,"fim":null,"respostas":[{"pergunta":"","resposta":"","classificacao":"conforme"}],"relatos":[""]}]}
O campo "indice" deve repetir exatamente o índice do trecho correspondente.`;

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

      const corpo = await res.text().catch(() => "");
      ultimoErro = `HTTP ${res.status} (${model}) ${corpo.slice(0, 200)}`;

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

const CLASSES = ["conforme", "nao_conforme", "neutro"] as const;

export const lerRelatorioGemini = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<LeituraGemini> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Leitura com IA indisponível: chave da IA do projeto ausente.");

    const conteudo = data.trechos
      .map((t) => `### TRECHO indice=${t.indice}\n${t.texto}`)
      .join("\n\n");

    const { texto, modelo } = await chamarGateway(apiKey, [
      { role: "system", content: PROMPT },
      { role: "user", content: conteudo },
    ]);

    const limpo = texto
      .replace(/^```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio === -1 || fim === -1) throw new Error("O Gemini não devolveu um JSON válido.");

    const parsed = JSON.parse(limpo.slice(inicio, fim + 1)) as { visitas?: unknown };
    const lista = Array.isArray(parsed.visitas) ? parsed.visitas : [];

    const visitas: VisitaLida[] = lista.map((raw, i) => {
      const v = (raw ?? {}) as Record<string, unknown>;
      const str = (k: string) =>
        String(v[k] ?? "")
          .replace(/\s+/g, " ")
          .trim();
      const respostasRaw = Array.isArray(v["respostas"]) ? (v["respostas"] as unknown[]) : [];
      const relatosRaw = Array.isArray(v["relatos"]) ? (v["relatos"] as unknown[]) : [];
      return {
        indice: Number.isFinite(Number(v["indice"]))
          ? Number(v["indice"])
          : (data.trechos[i]?.indice ?? i),
        cliente: str("cliente"),
        local: str("local"),
        posto: str("posto"),
        endereco: str("endereco"),
        bairro: str("bairro"),
        cidade: str("cidade"),
        uf: str("uf").slice(0, 2),
        responsavel: str("responsavel"),
        cargo: str("cargo"),
        inicio: str("inicio") || null,
        fim: str("fim") || null,
        respostas: respostasRaw
          .map((r) => {
            const o = (r ?? {}) as Record<string, unknown>;
            const classe = String(o["classificacao"] ?? "");
            return {
              pergunta: String(o["pergunta"] ?? "")
                .replace(/\s+/g, " ")
                .trim(),
              resposta: String(o["resposta"] ?? "")
                .replace(/\s+/g, " ")
                .trim(),
              classificacao: (CLASSES as readonly string[]).includes(classe)
                ? (classe as RespostaLida["classificacao"])
                : "neutro",
            };
          })
          .filter((r) => r.pergunta.length > 3),
        relatos: relatosRaw
          .map((r) =>
            String(r ?? "")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter((r) => r.length > 20),
      };
    });

    return { visitas, modelo };
  });
