/**
 * Leitura da folha de ponto com IA (GEMINI via Lovable AI Gateway).
 *
 * O texto integral do PDF é enviado ao modelo, que localiza o campo "Escala:",
 * os dias e todas as marcações de horário, devolvendo os dados estruturados
 * para o cálculo diário, semanal e mensal.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  texto: z.string().min(20).max(120000),
});

export type DiaIA = {
  dia: string;
  horarios: string[];
  observacao: string;
};

export type FolhaIA = {
  escala: string;
  colaborador: string;
  periodo: string;
  dias: DiaIA[];
  observacoes: string[];
  modelo: string;
};

const MODELOS = ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];

const PROMPT = `Você lê FOLHAS DE PONTO brasileiras (texto extraído de PDF, colunas podem vir embaralhadas) e devolve os dados estruturados para cálculo de horas.

Regras:
- Procure o campo "Escala" (ex.: "Escala: 12x36", "ESCALA 44H SEMANAL") e devolva o valor exato em "escala".
- "colaborador": nome do funcionário. "periodo": período/competência da folha (ex.: "01/09/2026 a 30/09/2026").
- Para CADA dia da folha devolva "dia" no formato "dd/MM/yyyy" (ou "dd/MM" se o ano não existir) e "horarios" com TODAS as marcações do dia na ordem em que aparecem, no formato "HH:mm" (24h).
- Use apenas as marcações reais de entrada/saída/intervalo. NÃO inclua colunas de totais, saldo, adicional noturno, horas extras, previsto ou escala.
- IMPORTANTE: devolva APENAS os dias que possuem horários marcados. Ignore completamente dias em branco, sem marcação, FOLGA, FALTA, ATESTADO, FÉRIAS, DSR e FERIADO.
- Nunca invente horários. Ignore rodapés e textos jurídicos (assinatura eletrônica, Portaria MTE, Medida Provisória, ICP Brasil, Comitê Gestor).
- "observacoes": avisos gerais úteis (marcações ímpares, jornada que vira o dia, divergências).

Devolva SOMENTE JSON válido:
{"escala":"","colaborador":"","periodo":"","dias":[{"dia":"01/09/2026","horarios":["08:00","12:00"],"observacao":""}],"observacoes":[""]}`;

async function chamarGateway(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
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
        await new Promise((r) => setTimeout(r, 900 * (tentativa + 1)));
        continue;
      }
      if (res.status === 402)
        throw new Error("Os créditos de IA do projeto acabaram. Adicione créditos para continuar.");
      if (res.status === 403)
        throw new Error("A IA está bloqueada pelas configurações do workspace.");
      break;
    }
  }
  throw new Error(`Falha ao consultar a IA. ${ultimoErro}`);
}

const RE_HORA_IA = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/;

export const lerFolhaComIA = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<FolhaIA> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Leitura com IA indisponível: chave da IA do projeto ausente.");

    const { texto, modelo } = await chamarGateway(apiKey, [
      { role: "system", content: PROMPT },
      { role: "user", content: data.texto.slice(0, 60000) },
    ]);

    const limpo = texto
      .replace(/^```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio === -1 || fim === -1) throw new Error("A IA não devolveu um JSON válido.");

    const parsed = JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>;
    const str = (v: unknown) =>
      String(v ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const listaDias = Array.isArray(parsed["dias"]) ? (parsed["dias"] as unknown[]) : [];
    const dias: DiaIA[] = listaDias
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        const horariosRaw = Array.isArray(o["horarios"]) ? (o["horarios"] as unknown[]) : [];
        const horarios = horariosRaw
          .map((h) => str(h))
          .map((h) => {
            const m = h.match(RE_HORA_IA);
            return m ? `${String(Number(m[1])).padStart(2, "0")}:${m[2]}` : "";
          })
          .filter(Boolean);
        return { dia: str(o["dia"]), horarios, observacao: str(o["observacao"]) };
      })
      .filter((d) => d.dia.length > 0);

    const observacoesRaw = Array.isArray(parsed["observacoes"])
      ? (parsed["observacoes"] as unknown[])
      : [];

    return {
      escala: str(parsed["escala"]),
      colaborador: str(parsed["colaborador"]),
      periodo: str(parsed["periodo"]),
      dias,
      observacoes: observacoesRaw.map((o) => str(o)).filter((o) => o.length > 3),
      modelo,
    };
  });
