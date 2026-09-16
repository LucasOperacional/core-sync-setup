/**
 * Importa do NEXTI Control 2.0 os LOCAIS DE VISITAS (postos) e o vínculo de
 * cada local com os checklists respondidos pelos Gerentes de Área.
 *
 * A API da NEXTI não devolve o posto dentro da resposta do checklist na maior
 * parte dos relatórios; o vínculo confiável é checklist -> postos habilitados.
 * Por isso a importação atualiza `nexti_workplaces` (locais) e os
 * `workplace_ids` de `nexti_checklists`, que alimentam o painel de locais.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConfig, normalizeBaseUrl, type NextiConfig } from "@/lib/nexti.functions";
import { garantirPostos, parseNextiDate, varrerChecklists } from "@/lib/nexti-visitas.functions";
import { ehGerenteAreaA, gerenteAreaACanonico } from "@/lib/gerentes-area-a";

export type NextiLocaisResultado = {
  ok: boolean;
  locais: number;
  checklists: number;
  vinculos: number;
  porGerente: { gerente: string; locais: number; relatorios: number }[];
  erro?: string;
};

export const syncNextiLocaisVisitas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inicio?: string; fim?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<NextiLocaisResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const bruta = await loadConfig((context as { supabase: unknown }).supabase);
      const config: NextiConfig = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };

      const fimPedido = data.fim ? new Date(`${data.fim}T23:59:59Z`) : null;
      const inicioPedido = data.inicio ? new Date(`${data.inicio}T00:00:00Z`) : null;
      const finish = fimPedido && !Number.isNaN(fimPedido.getTime()) ? fimPedido : new Date();
      const start =
        inicioPedido && !Number.isNaN(inicioPedido.getTime())
          ? inicioPedido
          : new Date(finish.getTime() - 1095 * 86400000);

      // 1. Locais de visita (postos) direto da API.
      const postos = await garantirPostos(config, supabaseAdmin as never);
      let ids = postos.map((p) => Number(p["nexti_id"])).filter((n) => Number.isFinite(n));
      if (ids.length === 0) {
        const { data: doBanco } = await supabaseAdmin
          .from("nexti_workplaces")
          .select("nexti_id")
          .limit(5000);
        ids = (doBanco ?? []).map((p) => Number(p.nexti_id)).filter((n) => Number.isFinite(n));
      }

      // 2. Checklists por local, para gravar o vínculo local <-> checklist.
      const checklists = await varrerChecklists(config, ids, start, finish);
      const linhas = [...checklists.entries()].map(([id, { raw, postos: ps }]) => ({
        nexti_id: id,
        name: String(raw["name"] ?? "Checklist"),
        checklist_type_id: Number.isFinite(Number(raw["checklistTypeId"]))
          ? Number(raw["checklistTypeId"])
          : null,
        status_id: Number.isFinite(Number(raw["statusId"])) ? Number(raw["statusId"]) : null,
        start_date_time: parseNextiDate(raw["startDateTime"]),
        finish_date_time: parseNextiDate(raw["finishDateTime"]),
        questions: (raw["questions"] ?? []) as never,
        workplace_ids: [...ps],
        raw_payload: raw as never,
        last_synced_at: new Date().toISOString(),
      }));
      for (let i = 0; i < linhas.length; i += 200) {
        await supabaseAdmin
          .from("nexti_checklists")
          .upsert(linhas.slice(i, i + 200) as never, { onConflict: "nexti_id" });
      }

      // 3. Resumo por Gerente de Área: locais alcançados e relatórios.
      const postosPorChecklist = new Map<number, number[]>();
      for (const l of linhas) postosPorChecklist.set(Number(l.nexti_id), l.workplace_ids);

      const { data: respostas } = await supabaseAdmin
        .from("nexti_checklist_answers")
        .select("checklist_id,supervisor_nome,workplace_id")
        .limit(20000);

      const resumo = new Map<string, { locais: Set<number>; relatorios: number }>();
      for (const r of respostas ?? []) {
        const nome = (r.supervisor_nome ?? "").trim();
        if (!nome || !ehGerenteAreaA(nome)) continue;
        const canonico = gerenteAreaACanonico(nome) ?? nome;
        const atual = resumo.get(canonico) ?? { locais: new Set<number>(), relatorios: 0 };
        atual.relatorios += 1;
        const direto = Number(r.workplace_id);
        if (Number.isFinite(direto) && direto > 0) atual.locais.add(direto);
        for (const wid of postosPorChecklist.get(Number(r.checklist_id)) ?? []) {
          atual.locais.add(Number(wid));
        }
        resumo.set(canonico, atual);
      }

      const porGerente = [...resumo.entries()]
        .map(([gerente, v]) => ({ gerente, locais: v.locais.size, relatorios: v.relatorios }))
        .sort((a, b) => b.locais - a.locais);

      return {
        ok: true,
        locais: ids.length,
        checklists: linhas.length,
        vinculos: linhas.reduce((t, l) => t + l.workplace_ids.length, 0),
        porGerente,
      };
    } catch (error) {
      return {
        ok: false,
        locais: 0,
        checklists: 0,
        vinculos: 0,
        porGerente: [],
        erro:
          error instanceof Error
            ? error.message
            : "Falha ao importar os locais de visitas da NEXTI.",
      };
    }
  });
