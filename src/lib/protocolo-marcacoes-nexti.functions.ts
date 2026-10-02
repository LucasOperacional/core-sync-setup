/**
 * Consulta direto na API da NEXTI quem teve marcação de ponto em um mês
 * (dia 1 ao último dia). Usado pela aba "Status de protocolação": quem não
 * tem nenhuma marcação no mês não precisa de folha e sai dos pendentes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, requestNexti, type NextiConfig } from "@/lib/nexti.functions";

type Rec = Record<string, unknown>;
const ehRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

function lista(payload: unknown): Rec[] {
  if (Array.isArray(payload)) return payload.filter(ehRec);
  if (!ehRec(payload)) return [];
  for (const k of ["content", "data", "items", "list", "records", "result", "results", "rows"]) {
    const v = payload[k];
    if (Array.isArray(v)) return v.filter(ehRec);
    if (ehRec(v)) {
      const n = lista(v);
      if (n.length) return n;
    }
  }
  return [];
}

export type MarcacoesMesResultado = {
  ok: boolean;
  mes: string;
  nomes: string[];
  diasConsultados: number;
  diasComFalha: number;
  erro?: string;
};

export const nomesComMarcacaoNoMes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }): Promise<MarcacoesMesResultado> => {
    const [ano, mes] = data.mes.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const mm = String(mes).padStart(2, "0");
    try {
      const bruta = await loadConfig(context.supabase);
      const config: NextiConfig = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };

      const ids = new Set<number>();
      const nomes = new Set<string>();
      let falhas = 0;

      const consultarDia = async (dia: number) => {
        const dd = String(dia).padStart(2, "0");
        const ini = `${dd}${mm}${ano}000000`;
        const fim = `${dd}${mm}${ano}235959`;
        for (const endpoint of [`/api/clockings/start/${ini}/finish/${fim}`, `/clockings/start/${ini}/finish/${fim}`]) {
          try {
            for (let page = 0; page < 60; page++) {
              const r = await requestNexti({ config, endpoint, method: "GET", query: { page, size: 1000 } });
              const itens = lista(r.data);
              for (const m of itens) {
                if (m["removed"] === true) continue;
                const id = Number(m["personId"] ?? m["idPerson"]);
                if (Number.isFinite(id) && id > 0) ids.add(id);
                const nome = m["personName"];
                if (typeof nome === "string" && nome.trim()) nomes.add(nome.trim());
              }
              if (itens.length < 1000) break;
            }
            return;
          } catch {
            // tenta o próximo caminho
          }
        }
        falhas++;
      };

      const dias = Array.from({ length: ultimoDia }, (_, i) => i + 1);
      for (let i = 0; i < dias.length; i += 6) {
        await Promise.all(dias.slice(i, i + 6).map(consultarDia));
      }

      // Marcações que vieram só com o código da pessoa: busca o nome no cadastro.
      if (ids.size) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const todos = Array.from(ids);
        for (let i = 0; i < todos.length; i += 500) {
          const { data: pessoas } = await supabaseAdmin
            .from("nexti_persons")
            .select("nome")
            .in("nexti_id", todos.slice(i, i + 500));
          for (const p of pessoas ?? []) if (p.nome) nomes.add(p.nome);
        }
      }

      if (falhas === ultimoDia) {
        return { ok: false, mes: data.mes, nomes: [], diasConsultados: ultimoDia, diasComFalha: falhas, erro: "Não foi possível consultar as marcações na NEXTI." };
      }
      return { ok: true, mes: data.mes, nomes: Array.from(nomes), diasConsultados: ultimoDia, diasComFalha: falhas };
    } catch (e) {
      return { ok: false, mes: data.mes, nomes: [], diasConsultados: 0, diasComFalha: 0, erro: e instanceof Error ? e.message : "Falha ao consultar a NEXTI." };
    }
  });
