/**
 * Fonte NEXTI para o DASHBOARD CONTROL.
 *
 * Lê tudo o que a API da NEXTI já trouxe para o banco (respostas de checklist,
 * postos de trabalho e pessoas) e converte no mesmo formato `Visit` usado pelo
 * Control, para que os indicadores sejam alimentados diretamente pela API —
 * sem depender da importação manual de PDFs.
 */
import { supabase } from "@/integrations/supabase/client";
import { classificarResposta, type Answer, type Visit } from "@/lib/report-parser";
import { gerenteAreaACanonico } from "@/lib/gerentes-area-a";

type ItemChecklist = {
  pergunta?: string | null;
  resposta?: string | null;
  conforme?: boolean | null;
  observacao?: string | null;
};

function dataBR(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function respostaTexto(item: ItemChecklist): string {
  const bruta = (item.resposta ?? "").trim();
  const rotulo = item.conforme === false ? "NÃO CONFORME" : "CONFORME";
  if (!bruta) return rotulo;
  const classe = classificarResposta(bruta, item.pergunta ?? undefined);
  const combina =
    (item.conforme === false && classe === "nao_conforme") ||
    (item.conforme !== false && classe === "conforme");
  return combina ? bruta : `${rotulo} — ${bruta}`;
}

/** Converte as respostas de checklist da NEXTI em visitas do Control. */
export async function carregarVisitasNextiControl(limite = 3000): Promise<Visit[]> {
  const [respostas, postos, pessoas, checklists] = await Promise.all([
    supabase
      .from("nexti_checklist_answers")
      .select(
        "id,nexti_id,checklist_id,checklist_name,supervisor_nome,person_id,workplace_id,workplace_name,cliente,cidade,uf,answer_date,register_date,conformes,nao_conformes,total_perguntas,itens",
      )
      .order("answer_date", { ascending: false })
      .limit(limite),
    supabase
      .from("nexti_workplaces")
      .select("nexti_id,name,client_name,city,state,department,cost_center")
      .limit(5000),
    supabase
      .from("nexti_persons")
      .select("nexti_id,nome,career_name,workplace_id,workplace_name")
      .limit(5000),
    supabase.from("nexti_checklists").select("nexti_id,name,workplace_ids").limit(2000),
  ]);

  const linhas = respostas.data ?? [];
  if (linhas.length === 0) return [];

  const mapaPostos = new Map((postos.data ?? []).map((p) => [Number(p.nexti_id), p] as const));
  const mapaPessoas = new Map((pessoas.data ?? []).map((p) => [Number(p.nexti_id), p] as const));
  // Quando o checklist vale para um único posto, a resposta pertence a esse posto.
  const postoUnicoDoChecklist = new Map<number, number>();
  for (const c of checklists.data ?? []) {
    const ids = (c.workplace_ids ?? []) as number[];
    if (ids.length === 1) postoUnicoDoChecklist.set(Number(c.nexti_id), Number(ids[0]));
  }

  const cargoPorNome = new Map<string, string>();
  for (const p of pessoas.data ?? []) {
    const nome = (p.nome ?? "").trim().toUpperCase();
    if (nome && p.career_name) cargoPorNome.set(nome, p.career_name);
  }

  const visitas: Visit[] = [];

  for (const linha of linhas) {
    // REALIZADOR DA TAREFA vindo do NEXTI CONTROL 2.0. Todos os relatórios
    // entram no dashboard; o realizador separa cada visita.
    const supervisorBruto = (linha.supervisor_nome ?? "").trim();
    const responsavel =
      gerenteAreaACanonico(supervisorBruto) || supervisorBruto || "Realizador não informado";

    const pessoa = mapaPessoas.get(Number(linha.person_id));
    // A API da NEXTI não devolve o posto na resposta do checklist. Usamos, em ordem:
    // posto da resposta, posto único do checklist e posto cadastrado do supervisor.
    const postoId =
      Number(linha.workplace_id) ||
      postoUnicoDoChecklist.get(Number(linha.checklist_id)) ||
      Number(pessoa?.workplace_id) ||
      0;
    const posto = mapaPostos.get(postoId);
    const local = (
      linha.workplace_name ??
      posto?.name ??
      pessoa?.workplace_name ??
      linha.checklist_name ??
      "Posto não informado"
    ).trim();

    const itens: ItemChecklist[] = Array.isArray(linha.itens)
      ? (linha.itens as unknown as ItemChecklist[])
      : [];

    const answers: Answer[] = itens
      .filter((i) => (i.pergunta ?? "").trim().length > 0)
      .map((i) => ({ question: (i.pergunta ?? "").trim(), answer: respostaTexto(i) }));

    const relatos = itens
      .map((i) => (i.observacao ?? "").trim())
      .filter((t) => t.length > 0)
      .filter((t, idx, arr) => arr.indexOf(t) === idx);

    const inicio = dataBR(linha.answer_date ?? null);
    const fim = dataBR(linha.register_date ?? linha.answer_date ?? null);
    const dIni = linha.answer_date ? new Date(linha.answer_date) : null;
    const dFim = linha.register_date ? new Date(linha.register_date) : null;
    const duracaoMin =
      dIni && dFim && !Number.isNaN(dIni.getTime()) && !Number.isNaN(dFim.getTime())
        ? Math.max(0, Math.round((dFim.getTime() - dIni.getTime()) / 60000))
        : null;

    const conformes =
      linha.conformes ??
      answers.filter((a) => classificarResposta(a.answer, a.question) === "conforme").length;
    const naoConformes = linha.nao_conformes ?? Math.max(0, answers.length - conformes);

    visitas.push({
      id: `nexti-${linha.nexti_id ?? linha.id}`,
      cliente: (linha.cliente ?? posto?.client_name ?? local).trim(),
      local,
      posto: local,
      endereco: (posto?.department ?? "").trim(),
      bairro: (posto?.cost_center ?? "").trim(),
      cidade: (linha.cidade ?? posto?.city ?? "").trim(),
      uf: (linha.uf ?? posto?.state ?? "").trim(),
      responsavel,
      cargo: (
        pessoa?.career_name ??
        cargoPorNome.get(responsavel.toUpperCase()) ??
        "Gerente de Área"
      )
        .toString()
        .trim(),
      inicio,
      fim,
      duracaoMin,
      respostas: answers,
      conformes,
      naoConformes,
      relatos,
      arquivo: linha.checklist_name ?? "Checklist NEXTI",
    });
  }

  return visitas;
}

/** Junta visitas de PDF com visitas da NEXTI removendo duplicidades. */
export function mesclarVisitas(pdf: Visit[], nexti: Visit[]): Visit[] {
  const chave = (v: Visit) =>
    `${(v.local || v.cliente || "").toUpperCase()}|${v.responsavel.toUpperCase()}|${v.inicio ?? "?"}`;
  const vistos = new Set(nexti.map(chave));
  return [...nexti, ...pdf.filter((v) => !vistos.has(chave(v)))];
}
