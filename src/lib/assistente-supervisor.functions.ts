/**
 * Assistente do supervisor com a IA do Gemini.
 *
 * Reúne o que o supervisor tem em aberto (faltas lançadas, movimentações
 * pendentes, checklists de supervisão de campo e o posto mais próximo do
 * celular) e pede ao Gemini uma lista curta de avisos e próximos passos.
 * Se a IA estiver indisponível, devolve os mesmos avisos calculados no código.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gerenteAreaACanonico, normalizarNome } from "./gerentes-area-a";
import { areaGerenteCanonica } from "./areas-gerentes";

export const ROTAS_AVISO = [
  "/faltas",
  "/supervisor-faltas",
  "/supervisor-campo",
  "/movimentacao-posto",
] as const;
export type RotaAviso = (typeof ROTAS_AVISO)[number];

export type AvisoSupervisor = {
  titulo: string;
  mensagem: string;
  prioridade: "alta" | "media" | "baixa";
  rota: RotaAviso | null;
  acao: string;
};

export type PostoPertoAviso = {
  nome: string;
  cliente: string;
  cidade: string;
  distanciaMetros: number;
  checklistHoje: boolean;
};

export type AvisosSupervisorResultado = {
  ehSupervisor: boolean;
  gerenteNome: string | null;
  avisos: AvisoSupervisor[];
  postoPerto: PostoPertoAviso | null;
  resumo: {
    faltasRegistros: number;
    faltasTotal: number;
    ultimoLancamento: string | null;
    postosVinculados: number;
    postosSemChecklist: string[];
    movimentacoesPendentes: number;
    checklists30Dias: number;
    criticasAbertas: number;
  };
  fonte: "gemini" | "regras";
  modelo: string | null;
};

const schema = z.object({
  latitude: z.number().finite().nullable().default(null),
  longitude: z.number().finite().nullable().default(null),
});

const MODELOS = ["google/gemini-3.8-flash", "google/gemini-3.7-flash", "google/gemini-3.6-flash"];

/** Raio, em metros, para considerar que o supervisor está no posto. */
const RAIO_POSTO_METROS = 300;

function metrosEntre(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const PROMPT = `Você é o assistente operacional de um supervisor de área de uma empresa de facilities (portaria, limpeza, conservação).

Receberá um JSON com a situação atual do supervisor: faltas que ele lançou, postos vinculados a ele, checklists de supervisão de campo já enviados, movimentações de posto pendentes de assinatura e, quando houver, o posto em que ele está agora (pelo GPS do celular).

Sua tarefa: escrever de 2 a 5 avisos curtos, em português do Brasil, dizendo o que ele precisa fazer agora. Prioridades:
1. Se ele está dentro de um posto (postoPerto) e ainda não fez o checklist de hoje nesse posto, o aviso mais importante é preencher o checklist da Supervisão de Campo daquele posto (rota "/supervisor-campo").
2. Faltas: lembrar de lançar/conferir as faltas do período quando não houver lançamento recente ou quando houver poucos registros (rota "/faltas").
3. Movimentações de posto pendentes de assinatura precisam ser concluídas corretamente (rota "/movimentacao-posto").
4. Postos vinculados sem checklist nos últimos 30 dias (rota "/supervisor-campo") e não conformidades críticas abertas.

Regras:
- Nunca invente números: use apenas os do JSON.
- Cada aviso: titulo com no máximo 60 caracteres, mensagem com no máximo 220 caracteres, tom direto e cordial.
- "rota" deve ser exatamente uma destas ou null: "/faltas", "/supervisor-faltas", "/supervisor-campo", "/movimentacao-posto".
- "acao" é o texto do botão (máx. 30 caracteres).
- prioridade: "alta", "media" ou "baixa".

Responda SOMENTE com JSON válido:
{"avisos":[{"titulo":"","mensagem":"","prioridade":"alta","rota":"/supervisor-campo","acao":""}]}`;

function avisosPorRegras(
  resumo: AvisosSupervisorResultado["resumo"],
  postoPerto: PostoPertoAviso | null,
): AvisoSupervisor[] {
  const lista: AvisoSupervisor[] = [];

  if (postoPerto && !postoPerto.checklistHoje) {
    lista.push({
      titulo: `Checklist do posto ${postoPerto.nome}`,
      mensagem: `Você está a ${postoPerto.distanciaMetros} m do posto ${postoPerto.nome}${postoPerto.cidade ? ` (${postoPerto.cidade})` : ""} e ainda não enviou o checklist de hoje. Preencha a Supervisão de Campo antes de sair.`,
      prioridade: "alta",
      rota: "/supervisor-campo",
      acao: "Abrir checklist",
    });
  }

  if (resumo.movimentacoesPendentes > 0) {
    lista.push({
      titulo: "Movimentações aguardando assinatura",
      mensagem: `Existem ${resumo.movimentacoesPendentes} movimentação(ões) de posto pendentes. Confira os dados e conclua a assinatura para o colaborador ficar no posto correto.`,
      prioridade: "alta",
      rota: "/movimentacao-posto",
      acao: "Ver movimentações",
    });
  }

  if (resumo.faltasRegistros === 0) {
    lista.push({
      titulo: "Nenhuma falta lançada no seu nome",
      mensagem:
        "Ainda não há faltas registradas no seu nome. Confira e lance as faltas do período dos seus postos.",
      prioridade: "alta",
      rota: "/faltas",
      acao: "Lançar faltas",
    });
  } else {
    lista.push({
      titulo: "Confira as faltas do período",
      mensagem: `Você tem ${resumo.faltasRegistros} registro(s) e ${resumo.faltasTotal} falta(s) lançada(s). Confirme se todas as faltas do período já foram enviadas.`,
      prioridade: "media",
      rota: "/faltas",
      acao: "Conferir faltas",
    });
  }

  if (resumo.postosSemChecklist.length > 0) {
    lista.push({
      titulo: "Postos sem visita nos últimos 30 dias",
      mensagem: `Estes postos ainda não têm checklist recente: ${resumo.postosSemChecklist.slice(0, 5).join(", ")}.`,
      prioridade: "media",
      rota: "/supervisor-campo",
      acao: "Fazer checklist",
    });
  }

  if (resumo.criticasAbertas > 0) {
    lista.push({
      titulo: "Não conformidades críticas abertas",
      mensagem: `Há ${resumo.criticasAbertas} não conformidade(s) crítica(s) registrada(s) nas suas visitas. Trate e registre o plano de ação.`,
      prioridade: "alta",
      rota: "/supervisor-campo",
      acao: "Ver visitas",
    });
  }

  return lista.slice(0, 5);
}

async function pedirAoGemini(
  apiKey: string,
  contexto: unknown,
): Promise<{ avisos: AvisoSupervisor[]; modelo: string } | null> {
  for (const model of MODELOS) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: JSON.stringify(contexto) },
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) continue;
        return null;
      }

      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const texto = (json.choices?.[0]?.message?.content ?? "").trim();
      const inicio = texto.indexOf("{");
      const fim = texto.lastIndexOf("}");
      if (inicio === -1 || fim === -1) continue;

      const parsed = JSON.parse(texto.slice(inicio, fim + 1)) as { avisos?: unknown };
      const bruto = Array.isArray(parsed.avisos) ? parsed.avisos : [];
      const avisos = bruto
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          const rota = String(o["rota"] ?? "");
          const prioridade = String(o["prioridade"] ?? "media");
          return {
            titulo: String(o["titulo"] ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80),
            mensagem: String(o["mensagem"] ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300),
            prioridade: (["alta", "media", "baixa"].includes(prioridade)
              ? prioridade
              : "media") as AvisoSupervisor["prioridade"],
            rota: (ROTAS_AVISO as readonly string[]).includes(rota) ? (rota as RotaAviso) : null,
            acao: String(o["acao"] ?? "Abrir").slice(0, 40) || "Abrir",
          };
        })
        .filter((a) => a.titulo.length > 3 && a.mensagem.length > 10)
        .slice(0, 5);

      if (avisos.length > 0) return { avisos, modelo: model };
    } catch {
      /* tenta o próximo modelo */
    }
  }
  return null;
}

export const avisosSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<AvisosSupervisorResultado> => {
    const vazio: AvisosSupervisorResultado = {
      ehSupervisor: false,
      gerenteNome: null,
      avisos: [],
      postoPerto: null,
      resumo: {
        faltasRegistros: 0,
        faltasTotal: 0,
        ultimoLancamento: null,
        postosVinculados: 0,
        postosSemChecklist: [],
        movimentacoesPendentes: 0,
        checklists30Dias: 0,
        criticasAbertas: 0,
      },
      fonte: "regras",
      modelo: null,
    };

    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    const nome = (perfil?.display_name ?? "").trim();
    const gerenteNome = nome ? (gerenteAreaACanonico(nome) ?? areaGerenteCanonica(nome)) : null;
    if (!gerenteNome) return vazio;

    const desde30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

    const [faltas, postos, roteiros, movimentacoes] = await Promise.all([
      context.supabase
        .from("faltas_lancamentos")
        .select("faltas, periodo, created_at")
        .eq("gerente_nome", gerenteNome)
        .order("created_at", { ascending: false })
        .limit(2000),
      context.supabase
        .from("areas_gerentes_postos")
        .select("posto_nome")
        .eq("gerente_nome", gerenteNome),
      context.supabase
        .from("roteiros_visita_campo")
        .select("posto, data_visita, criticas_abertas")
        .eq("user_id", context.userId)
        .gte("data_visita", desde30)
        .order("data_visita", { ascending: false })
        .limit(500),
      context.supabase
        .from("movimentacoes_posto")
        .select("id")
        .eq("criado_por", context.userId)
        .eq("status", "pendente")
        .limit(200),
    ]);

    const linhasFaltas = faltas.data ?? [];
    const listaPostos = (postos.data ?? []).map((p) => String(p.posto_nome ?? "")).filter(Boolean);
    const listaRoteiros = roteiros.data ?? [];

    const postosVisitados = new Set(listaRoteiros.map((r) => normalizarNome(String(r.posto ?? ""))));
    const postosSemChecklist = listaPostos.filter((p) => !postosVisitados.has(normalizarNome(p)));

    const resumo: AvisosSupervisorResultado["resumo"] = {
      faltasRegistros: linhasFaltas.length,
      faltasTotal: linhasFaltas.reduce((s, l) => s + (l.faltas ?? 0), 0),
      ultimoLancamento: (linhasFaltas[0]?.created_at as string | undefined) ?? null,
      postosVinculados: listaPostos.length,
      postosSemChecklist: postosSemChecklist.slice(0, 10),
      movimentacoesPendentes: (movimentacoes.data ?? []).length,
      checklists30Dias: listaRoteiros.length,
      criticasAbertas: listaRoteiros.reduce((s, r) => s + (r.criticas_abertas ?? 0), 0),
    };

    // Posto onde ele está agora (GPS), limitado aos postos vinculados a ele.
    let postoPerto: PostoPertoAviso | null = null;
    if (data.latitude !== null && data.longitude !== null) {
      const COLUNAS = "name,client_name,city,latitude,longitude,active";
      let consulta = await context.supabase
        .from("nexti_workplaces")
        .select(COLUNAS)
        .eq("active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(3000);
      if (consulta.error || !(consulta.data ?? []).length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tentativa = await supabaseAdmin
          .from("nexti_workplaces")
          .select(COLUNAS)
          .eq("active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .limit(3000);
        if (!tentativa.error) consulta = tentativa;
      }

      const permitidos =
        listaPostos.length > 0 ? new Set(listaPostos.map((p) => normalizarNome(p))) : null;
      const hoje = new Date().toISOString().slice(0, 10);

      for (const linha of consulta.data ?? []) {
        const nomePosto = String(linha.name ?? "").trim();
        if (!nomePosto) continue;
        if (permitidos && !permitidos.has(normalizarNome(nomePosto))) continue;
        const metros = metrosEntre(
          data.latitude,
          data.longitude,
          Number(linha.latitude),
          Number(linha.longitude),
        );
        if (!Number.isFinite(metros) || metros > RAIO_POSTO_METROS) continue;
        if (postoPerto && postoPerto.distanciaMetros <= metros) continue;
        postoPerto = {
          nome: nomePosto,
          cliente: String(linha.client_name ?? ""),
          cidade: String(linha.city ?? ""),
          distanciaMetros: Math.round(metros),
          checklistHoje: listaRoteiros.some(
            (r) =>
              String(r.data_visita ?? "").slice(0, 10) === hoje &&
              normalizarNome(String(r.posto ?? "")) === normalizarNome(nomePosto),
          ),
        };
      }
    }

    const regras = avisosPorRegras(resumo, postoPerto);

    const apiKey = process.env["LOVABLE_API_KEY"];
    let avisos = regras;
    let fonte: "gemini" | "regras" = "regras";
    let modelo: string | null = null;

    if (apiKey) {
      const ia = await pedirAoGemini(apiKey, {
        supervisor: gerenteNome,
        hoje: new Date().toISOString().slice(0, 10),
        postoPerto,
        ...resumo,
      });
      if (ia) {
        avisos = ia.avisos;
        fonte = "gemini";
        modelo = ia.modelo;
      }
    }

    return {
      ehSupervisor: true,
      gerenteNome,
      avisos,
      postoPerto,
      resumo,
      fonte,
      modelo,
    };
  });
