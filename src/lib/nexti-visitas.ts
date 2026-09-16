import { supabase } from "@/integrations/supabase/client";
import {
  GERENTES_AREA_A,
  ehGerenteAreaA,
  gerenteAreaACanonico,
  normalizarNome,
} from "@/lib/gerentes-area-a";

export type VisitaItem = {
  pergunta: string;
  resposta: string;
  conforme: boolean;
  observacao: string | null;
};

export type VisitaSupervisao = {
  id: string;
  nextiId: number;
  checklist: string;
  supervisor: string;
  posto: string;
  cliente: string;
  cidade: string;
  uf: string;
  data: string | null;
  conformes: number;
  naoConformes: number;
  total: number;
  itens: VisitaItem[];
};

export type PerguntaResumo = {
  pergunta: string;
  total: number;
  conformes: number;
  naoConformes: number;
  conformidade: number;
  respostas: { resposta: string; quantidade: number }[];
};

export type PerguntasPorGerente = {
  nome: string;
  visitas: number;
  total: number;
  conformes: number;
  naoConformes: number;
  conformidade: number;
  perguntas: PerguntaResumo[];
};

export type ResumoVisitas = {
  visitas: VisitaSupervisao[];
  totalVisitas: number;
  visitasMes: number;
  visitasHoje: number;
  postosVisitados: number;
  supervisores: number;
  conformidade: number;
  naoConformidades: number;
  totalPerguntasRespondidas: number;
  perguntasDistintas: number;
  checklists: { nome: string; visitas: number }[];
  perguntas: PerguntaResumo[];
  perguntasPorGerente: PerguntasPorGerente[];
  porSupervisor: {
    nome: string;
    visitas: number;
    postos: number;
    conformidade: number;
    naoConformes: number;
  }[];
  porItem: { pergunta: string; conformes: number; naoConformes: number }[];
  porDia: { dia: string; visitas: number }[];
  ultimaSync: string | null;
};

const VAZIO: ResumoVisitas = {
  visitas: [],
  totalVisitas: 0,
  visitasMes: 0,
  visitasHoje: 0,
  postosVisitados: 0,
  supervisores: 0,
  conformidade: 0,
  naoConformidades: 0,
  totalPerguntasRespondidas: 0,
  perguntasDistintas: 0,
  checklists: [],
  perguntas: [],
  perguntasPorGerente: [],
  porSupervisor: [],
  porItem: [],
  porDia: [],
  ultimaSync: null,
};

/** Supervisores exibidos nos gráficos do dashboard (ranking) — Gerentes de Área A ativos */
export const SUPERVISORES_GRAFICO: string[] = [...GERENTES_AREA_A];

const normalizar = normalizarNome;

const supervisorPermitido = (nome: string) => ehGerenteAreaA(nome);

/** Devolve o nome oficial do gerente de área A correspondente ao supervisor da visita. */
const gerenteCanonico = (nome: string): string | null => gerenteAreaACanonico(nome);

type AccItens = Map<
  string,
  { rotulo: string; conformes: number; naoConformes: number; respostas: Map<string, number> }
>;

function acumularItem(acc: AccItens, item: VisitaItem) {
  const rotulo = item.pergunta.trim();
  const key = rotulo.toUpperCase();
  const e = acc.get(key) ?? {
    rotulo,
    conformes: 0,
    naoConformes: 0,
    respostas: new Map<string, number>(),
  };
  if (item.conforme) e.conformes += 1;
  else e.naoConformes += 1;
  const resp = (item.resposta ?? "—").trim() || "—";
  e.respostas.set(resp, (e.respostas.get(resp) ?? 0) + 1);
  acc.set(key, e);
}

function resumirPerguntas(acc: AccItens): PerguntaResumo[] {
  return [...acc.values()]
    .map((p) => {
      const total = p.conformes + p.naoConformes;
      return {
        pergunta: p.rotulo,
        total,
        conformes: p.conformes,
        naoConformes: p.naoConformes,
        conformidade: total ? Math.round((p.conformes / total) * 100) : 0,
        respostas: [...p.respostas.entries()]
          .map(([resposta, quantidade]) => ({ resposta, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
      };
    })
    .sort((a, b) => b.naoConformes - a.naoConformes || b.total - a.total);
}

export type PeriodoVisitas = {
  inicio?: string | null | undefined;
  fim?: string | null | undefined;
};

export async function carregarVisitasSupervisao(
  limite = 1500,
  periodo: PeriodoVisitas = {},
): Promise<ResumoVisitas> {
  let query = supabase
    .from("nexti_checklist_answers")
    .select(
      "id,nexti_id,checklist_name,supervisor_nome,workplace_name,cliente,cidade,uf,answer_date,conformes,nao_conformes,total_perguntas,itens,last_synced_at",
    );

  if (periodo.inicio) query = query.gte("answer_date", periodo.inicio);
  if (periodo.fim) query = query.lte("answer_date", periodo.fim);

  const { data, error } = await query.order("answer_date", { ascending: false }).limit(limite);

  if (error || !data) return VAZIO;

  const visitas: VisitaSupervisao[] = data
    .filter((r) => ehGerenteAreaA(r.supervisor_nome ?? ""))
    // Ignora registros sem posto identificado — não entram em nenhum dashboard.
    .filter((r) => Boolean((r.workplace_name ?? "").trim()))
    .map((r) => ({
      id: String(r.id),
      nextiId: Number(r.nexti_id),
      checklist: r.checklist_name ?? "Checklist",
      supervisor:
        gerenteAreaACanonico(r.supervisor_nome ?? "") ?? r.supervisor_nome ?? "Não identificado",
      posto: (r.workplace_name ?? "").trim(),

      cliente: r.cliente ?? "",
      cidade: r.cidade ?? "",
      uf: r.uf ?? "",
      data: r.answer_date ?? null,
      conformes: r.conformes ?? 0,
      naoConformes: r.nao_conformes ?? 0,
      total: r.total_perguntas ?? 0,
      itens: Array.isArray(r.itens) ? (r.itens as unknown as VisitaItem[]) : [],
    }));

  const hoje = new Date();
  const chaveMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const chaveHoje = hoje.toISOString().slice(0, 10);

  let conformes = 0;
  let naoConformes = 0;
  const postos = new Set<string>();
  const porSupervisor = new Map<
    string,
    { nome: string; visitas: number; postos: Set<string>; conformes: number; naoConformes: number }
  >();
  const porItem: AccItens = new Map();
  const porGerente = new Map<string, { visitas: number; itens: AccItens }>();
  const porDia = new Map<string, number>();
  const porChecklist = new Map<string, number>();
  let visitasMes = 0;
  let visitasHoje = 0;

  for (const v of visitas) {
    conformes += v.conformes;
    naoConformes += v.naoConformes;
    if (v.posto) postos.add(v.posto);
    porChecklist.set(v.checklist, (porChecklist.get(v.checklist) ?? 0) + 1);

    const s = porSupervisor.get(v.supervisor) ?? {
      nome: v.supervisor,
      visitas: 0,
      postos: new Set<string>(),
      conformes: 0,
      naoConformes: 0,
    };
    s.visitas += 1;
    if (v.posto) s.postos.add(v.posto);
    s.conformes += v.conformes;
    s.naoConformes += v.naoConformes;
    porSupervisor.set(v.supervisor, s);

    const gerente = gerenteCanonico(v.supervisor);
    const grupo = gerente
      ? (porGerente.get(gerente) ?? { visitas: 0, itens: new Map() as AccItens })
      : null;
    if (gerente && grupo) {
      grupo.visitas += 1;
      porGerente.set(gerente, grupo);
    }

    for (const item of v.itens) {
      acumularItem(porItem, item);
      if (grupo) acumularItem(grupo.itens, item);
    }

    if (v.data) {
      const dia = v.data.slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
      if (dia === chaveHoje) visitasHoje += 1;
      if (dia.slice(0, 7) === chaveMes) visitasMes += 1;
    }
  }

  const totalRespostas = conformes + naoConformes;

  const perguntas: PerguntaResumo[] = resumirPerguntas(porItem);

  const perguntasPorGerente: PerguntasPorGerente[] = SUPERVISORES_GRAFICO.map((nome) => {
    const grupo = porGerente.get(nome);
    const lista = grupo ? resumirPerguntas(grupo.itens) : [];
    const c = lista.reduce((a, p) => a + p.conformes, 0);
    const nc = lista.reduce((a, p) => a + p.naoConformes, 0);
    return {
      nome,
      visitas: grupo?.visitas ?? 0,
      total: c + nc,
      conformes: c,
      naoConformes: nc,
      conformidade: c + nc ? Math.round((c / (c + nc)) * 100) : 0,
      perguntas: lista,
    };
  }).sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    visitas,
    totalVisitas: visitas.length,
    visitasMes,
    visitasHoje,
    postosVisitados: postos.size,
    supervisores: porSupervisor.size,
    conformidade: totalRespostas ? Math.round((conformes / totalRespostas) * 100) : 0,
    naoConformidades: naoConformes,
    totalPerguntasRespondidas: totalRespostas,
    perguntasDistintas: perguntas.length,
    checklists: [...porChecklist.entries()]
      .map(([nome, visitas2]) => ({ nome, visitas: visitas2 }))
      .sort((a, b) => b.visitas - a.visitas),
    perguntas,
    perguntasPorGerente,
    porSupervisor: (() => {
      const lista = [...porSupervisor.values()]
        .filter((s) => supervisorPermitido(s.nome))
        .map((s) => ({
          nome: s.nome,
          visitas: s.visitas,
          postos: s.postos.size,
          naoConformes: s.naoConformes,
          conformidade:
            s.conformes + s.naoConformes
              ? Math.round((s.conformes / (s.conformes + s.naoConformes)) * 100)
              : 0,
        }));
      // Garante que todos os gerentes/supervisores da lista fixa apareçam, mesmo sem visitas
      for (const fixo of SUPERVISORES_GRAFICO) {
        const f = normalizar(fixo);
        const existe = lista.some((s) => {
          const n = normalizar(s.nome);
          return n === f || n.includes(f) || f.includes(n);
        });
        if (!existe) {
          lista.push({ nome: fixo, visitas: 0, postos: 0, naoConformes: 0, conformidade: 0 });
        }
      }
      return lista.sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, "pt-BR"));
    })(),

    porItem: perguntas.slice(0, 12).map((p) => ({
      pergunta: p.pergunta,
      conformes: p.conformes,
      naoConformes: p.naoConformes,
    })),
    porDia: [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([dia, v]) => ({ dia: dia.slice(8, 10) + "/" + dia.slice(5, 7), visitas: v })),
    ultimaSync: (data[0]?.last_synced_at as string | undefined) ?? null,
  };
}

/** Recebe eventos em tempo real das respostas de checklist da NEXTI. */
export function assinarVisitasRealtime(onChange: () => void) {
  const canal = supabase
    .channel("nexti-visitas-supervisao")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "nexti_checklist_answers" },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}

/** Carrega um relatório de visita completo (todas as perguntas, respostas e observações). */
export async function carregarVisitaPorId(id: string): Promise<VisitaSupervisao | null> {
  const { data, error } = await supabase
    .from("nexti_checklist_answers")
    .select(
      "id,nexti_id,checklist_name,supervisor_nome,workplace_name,cliente,cidade,uf,answer_date,conformes,nao_conformes,total_perguntas,itens",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    nextiId: Number(data.nexti_id),
    checklist: data.checklist_name ?? "Checklist",
    supervisor:
      gerenteAreaACanonico(data.supervisor_nome ?? "") ??
      data.supervisor_nome ??
      "Não identificado",
    posto: data.workplace_name ?? "Posto não identificado",
    cliente: data.cliente ?? "",
    cidade: data.cidade ?? "",
    uf: data.uf ?? "",
    data: data.answer_date ?? null,
    conformes: data.conformes ?? 0,
    naoConformes: data.nao_conformes ?? 0,
    total: data.total_perguntas ?? 0,
    itens: Array.isArray(data.itens) ? (data.itens as unknown as VisitaItem[]) : [],
  };
}
