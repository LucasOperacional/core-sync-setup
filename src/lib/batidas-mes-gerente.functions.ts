/**
 * Verificação completa, dia a dia, das batidas na NEXTI dos colaboradores
 * lotados nos postos de um gerente de área (Mesa Operacional).
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
  }
  return [];
}
const chave = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

type Classe = "folga" | "falta" | "atestado";
export type ColaboradorBatidas = {
  nome: string;
  dias: number[];
  /** Dias sem batida e sem nenhum lançamento que explique (batida ausente). */
  semBatida: number[];
  folgas: number[];
  faltas: number[];
  atestados: number[];
};
export type PostoBatidas = { posto: string; colaboradores: ColaboradorBatidas[] };
export type BatidasMesResultado = {
  ok: boolean;
  mes: string;
  ultimoDia: number;
  postos: PostoBatidas[];
  diasComFalha: number;
  atualizadoEm: string;
  erro?: string;
};

export const verificarBatidasMesGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/), postos: z.array(z.string().max(300)).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<BatidasMesResultado> => {
    const ano = Number(data.mes.slice(0, 4));
    const mes = Number(data.mes.slice(5, 7));
    const mm = String(mes).padStart(2, "0");
    const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    let ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    if (hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes) ultimoDia = hoje.getDate();
    const base: BatidasMesResultado = {
      ok: false, mes: data.mes, ultimoDia, postos: [], diasComFalha: 0, atualizadoEm: new Date().toISOString(),
    };
    const alvo = new Set(data.postos.map(chave));
    if (!alvo.size) return { ...base, ok: true };
    try {
      // Postos (id -> nome) e colaboradores ativos lotados nos postos do gerente
      const { data: locais } = await context.supabase.from("nexti_workplaces").select("nexti_id, name").limit(5000);
      const nomePosto = new Map<number, string>();
      for (const l of locais ?? []) if (l.nexti_id != null && l.name) nomePosto.set(Number(l.nexti_id), l.name);

      const pessoas: { id: number; nome: string; posto: string }[] = [];
      for (let p = 0; p < 20; p++) {
        const { data: linhas } = await context.supabase
          .from("nexti_persons")
          .select("nexti_id, nome, workplace_id, workplace_name")
          .is("demission_date", null)
          .range(p * 1000, p * 1000 + 999);
        for (const r of linhas ?? []) {
          const posto = (r.workplace_id ? nomePosto.get(Number(r.workplace_id)) : undefined) ?? r.workplace_name ?? "";
          if (posto && alvo.has(chave(posto))) pessoas.push({ id: Number(r.nexti_id), nome: r.nome ?? "Sem nome", posto });
        }
        if ((linhas ?? []).length < 1000) break;
      }
      if (!pessoas.length) return { ...base, ok: true };

      const bruta = await loadConfig(context.supabase);
      const config: NextiConfig = { ...bruta, baseUrl: normalizeBaseUrl(bruta.baseUrl) };
      const idsAlvo = new Set(pessoas.map((p) => p.id));
      const nomesAlvo = new Map(pessoas.map((p) => [chave(p.nome), p.id]));
      const diasPorPessoa = new Map<number, Set<number>>();
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
                let id = Number(m["personId"] ?? m["idPerson"]);
                if (!idsAlvo.has(id) && typeof m["personName"] === "string") id = nomesAlvo.get(chave(m["personName"])) ?? id;
                if (!idsAlvo.has(id)) continue;
                const s = diasPorPessoa.get(id) ?? new Set<number>();
                s.add(dia);
                diasPorPessoa.set(id, s);
              }
              if (Array.isArray(r.data) || itens.length < 1000) break;
            }
            return;
          } catch {
            // tenta o próximo caminho
          }
        }
        falhas++;
      };
      const dias = Array.from({ length: ultimoDia }, (_, i) => i + 1);
      for (let i = 0; i < dias.length; i += 6) await Promise.all(dias.slice(i, i + 6).map(consultarDia));
      if (falhas === ultimoDia) return { ...base, erro: "Não foi possível consultar as batidas na NEXTI." };

      // Lançamentos de ausência na NEXTI no mês: classifica em folga, falta ou atestado.
      const situacoes = new Map<number, string>();
      for (const endpoint of ["/api/absencesituations/all", "/absencesituations/all"]) {
        try {
          const r = await requestNexti({ config, endpoint, method: "GET" });
          for (const s of lista(r.data)) {
            const id = Number(s["id"] ?? s["nextiId"]);
            if (Number.isFinite(id)) situacoes.set(id, String(s["name"] ?? s["description"] ?? ""));
          }
          if (situacoes.size) break;
        } catch {
          // tenta o próximo caminho
        }
      }
      const classificar = (nomeSit: string, cid: unknown): Classe => {
        const n = chave(nomeSit);
        if ((typeof cid === "string" && cid.trim()) || /ATESTADO|MEDIC|LICENCA|INSS|AFAST/.test(n)) return "atestado";
        if (/FOLGA|DSR|DESCANSO|FERIAS|COMPENS|FERIADO|BANCO/.test(n)) return "folga";
        return "falta";
      };
      const ausencias = new Map<number, Map<number, Classe>>();
      const prioridade: Record<Classe, number> = { atestado: 3, falta: 2, folga: 1 };
      const ini = `01${mm}${ano}000000`;
      const fim = `${String(ultimoDia).padStart(2, "0")}${mm}${ano}235959`;
      for (const endpoint of [`/api/absences/start/${ini}/finish/${fim}`, `/absences/start/${ini}/finish/${fim}`]) {
        try {
          const r = await requestNexti({ config, endpoint, method: "GET" });
          const itens = lista(r.data);
          for (const a of itens) {
            if (a["removed"] === true) continue;
            let id = Number(a["personId"] ?? a["idPerson"]);
            if (!idsAlvo.has(id) && typeof a["personName"] === "string") id = nomesAlvo.get(chave(a["personName"])) ?? id;
            if (!idsAlvo.has(id)) continue;
            const idSit = Number(a["absenceSituationId"] ?? a["situationId"]);
            const nomeSit = String(a["absenceSituationName"] ?? a["situationName"] ?? situacoes.get(idSit) ?? "");
            const classe = classificar(nomeSit, a["cidCode"]);
            const diaDe = (v: unknown, padrao: number) => {
              const s = String(v ?? "");
              let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (m) return Number(m[1]) === ano && Number(m[2]) === mes ? Number(m[3]) : padrao;
              m = s.match(/^(\d{2})(\d{2})(\d{4})/);
              if (m) return Number(m[3]) === ano && Number(m[2]) === mes ? Number(m[1]) : padrao;
              return padrao;
            };
            const d1 = Math.max(1, diaDe(a["startDateTime"] ?? a["startDate"], 1));
            const d2 = Math.min(ultimoDia, diaDe(a["finishDateTime"] ?? a["finishDate"], ultimoDia));
            const mapa = ausencias.get(id) ?? new Map<number, Classe>();
            for (let d = d1; d <= d2; d++) {
              const atual = mapa.get(d);
              if (!atual || prioridade[classe] > prioridade[atual]) mapa.set(d, classe);
            }
            ausencias.set(id, mapa);
          }
          break;
        } catch {
          // tenta o próximo caminho
        }
      }

      const porPosto = new Map<string, PostoBatidas>();
      for (const p of pessoas) {
        const com = Array.from(diasPorPessoa.get(p.id) ?? []).sort((a, b) => a - b);
        const aus = ausencias.get(p.id) ?? new Map<number, Classe>();
        const folgas: number[] = [], faltas: number[] = [], atestados: number[] = [], sem: number[] = [];
        for (const d of dias) {
          if (com.includes(d)) continue;
          const c = aus.get(d);
          if (c === "folga") folgas.push(d);
          else if (c === "falta") faltas.push(d);
          else if (c === "atestado") atestados.push(d);
          else sem.push(d);
        }
        const item = porPosto.get(p.posto) ?? { posto: p.posto, colaboradores: [] };
        item.colaboradores.push({ nome: p.nome, dias: com, semBatida: sem, folgas, faltas, atestados });
        porPosto.set(p.posto, item);
      }
      const postos = Array.from(porPosto.values()).sort((a, b) => a.posto.localeCompare(b.posto));
      for (const p of postos) p.colaboradores.sort((a, b) => a.nome.localeCompare(b.nome));
      return { ...base, ok: true, postos, diasComFalha: falhas };
    } catch (e) {
      return { ...base, erro: e instanceof Error ? e.message : "Falha ao consultar a NEXTI." };
    }
  });
