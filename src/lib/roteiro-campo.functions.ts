import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarMensagemEvolution } from "@/lib/evolution-go.functions";

const respostaSchema = z.enum(["conforme", "nao_conforme", "na"]);

const roteiroSchema = z.object({
  dataVisita: z.string().min(8),
  posto: z.string().min(1),
  postoNextiId: z.number().int().nullable().default(null),
  postoExternalId: z.string().default(""),
  cliente: z.string().default(""),
  empresa: z.string().default(""),
  funcao: z.string().min(1),
  colaborador: z.string().default(""),
  supervisor: z.string().default(""),
  respostas: z.record(z.string(), respostaSchema).default({}),
  observacoes: z.record(z.string(), z.string()).default({}),
  totalConformes: z.number().int().default(0),
  totalNaoConformes: z.number().int().default(0),
  totalNaoAplicaveis: z.number().int().default(0),
  criticasAbertas: z.number().int().default(0),
  percentualConformidade: z.number().int().default(0),
  observacaoGeral: z.string().default(""),
  planoAcao: z.string().default(""),
  /** Tempo gasto para preencher o relatório, em segundos. */
  duracaoSegundos: z.number().int().min(0).max(86400).nullable().default(null),
  numeroNotificacao: z.string().default(""),
  fotos: z
    .array(
      z.object({
        perguntaId: z.string().default(""),
        perguntaTexto: z.string().default(""),
        dataUrl: z.string().min(32),
        capturadaEm: z.string().default(() => new Date().toISOString()),
        latitude: z.number().nullable().default(null),
        longitude: z.number().nullable().default(null),
        precisao: z.number().nullable().default(null),
        geoStatus: z.string().default("indisponivel"),
        observacao: z.string().default(""),
      }),
    )
    .max(30)
    .default([]),
});

function dataUrlParaBytes(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export type RoteiroVisitaCampo = {
  id: string;
  data_visita: string;
  posto: string;
  posto_external_id: string;
  cliente: string;
  empresa: string;
  funcao: string;
  colaborador: string;
  supervisor: string;
  total_conformes: number;
  total_nao_conformes: number;
  total_nao_aplicaveis: number;
  criticas_abertas: number;
  percentual_conformidade: number;
  observacao_geral: string;
  plano_acao: string;
  created_at: string;
};

/** Grava um roteiro de visita preenchido pelo supervisor de campo. */
export const salvarRoteiroVisita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => roteiroSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: perfilEnvio } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    const enviadoPorNome =
      (perfilEnvio?.nome as string | undefined) ||
      (perfilEnvio?.email as string | undefined) ||
      (context.claims?.email as string | undefined) ||
      data.supervisor ||
      "Usuário";

    const { error, data: inserido } = await context.supabase
      .from("roteiros_visita_campo")
      .insert({
        user_id: context.userId,
        enviado_por_nome: enviadoPorNome,
        data_visita: data.dataVisita,
        posto: data.posto,
        posto_nexti_id: data.postoNextiId,
        posto_external_id: data.postoExternalId,
        cliente: data.cliente,
        empresa: data.empresa,
        funcao: data.funcao,
        colaborador: data.colaborador,
        supervisor: data.supervisor,
        respostas: data.respostas,
        observacoes: data.observacoes,
        total_conformes: data.totalConformes,
        total_nao_conformes: data.totalNaoConformes,
        total_nao_aplicaveis: data.totalNaoAplicaveis,
        criticas_abertas: data.criticasAbertas,
        percentual_conformidade: data.percentualConformidade,
        observacao_geral: data.observacaoGeral,
        plano_acao: data.planoAcao,
        duracao_segundos: data.duracaoSegundos,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Não foi possível salvar o roteiro: ${error.message}`);

    const roteiroId = inserido?.id as string;
    if (data.numeroNotificacao) {
      const mensagem = `✅ Control finalizado com sucesso.\nPosto: ${data.posto}\nData: ${data.dataVisita}`;
      void enviarMensagemEvolution(data.numeroNotificacao, mensagem).catch(() => {});
    }
    let fotosSalvas = 0;

    for (const [indice, foto] of data.fotos.entries()) {
      try {
        const caminho = `${context.userId}/${roteiroId}/${Date.now()}-${indice}.jpg`;
        const upload = await context.supabase.storage
          .from("checklist-fotos")
          .upload(caminho, dataUrlParaBytes(foto.dataUrl), {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (upload.error) continue;
        const registro = await context.supabase.from("roteiro_visita_fotos").insert({
          roteiro_id: roteiroId,
          pergunta_id: foto.perguntaId,
          pergunta_texto: foto.perguntaTexto,
          user_id: context.userId,
          storage_path: caminho,
          capturada_em: foto.capturadaEm,
          latitude: foto.latitude,
          longitude: foto.longitude,
          precisao_metros: foto.precisao,
          geo_status: foto.geoStatus,
          observacao: foto.observacao,
        });
        if (!registro.error) fotosSalvas += 1;
      } catch {
        // uma foto com problema não impede o registro do roteiro
      }
    }

    return { ok: true, id: roteiroId, fotosSalvas, fotosEnviadas: data.fotos.length };
  });

/** Lista os roteiros de visita já registrados (mais recentes primeiro). */
export const listarRoteirosVisita = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("roteiros_visita_campo")
      .select(
        "id,data_visita,posto,posto_external_id,cliente,empresa,funcao,colaborador,supervisor,total_conformes,total_nao_conformes,total_nao_aplicaveis,criticas_abertas,percentual_conformidade,observacao_geral,plano_acao,created_at",
      )
      .order("data_visita", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(`Não foi possível carregar os roteiros: ${error.message}`);
    return { roteiros: (data ?? []) as RoteiroVisitaCampo[] };
  });

/** Anexa o relatório em PDF do roteiro e o disponibiliza para a Coordenação. */
export const enviarRelatorioRoteiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ roteiroId: z.string().uuid(), pdfBase64: z.string().min(100) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const bytes = dataUrlParaBytes(data.pdfBase64);
    const caminho = `${context.userId}/${data.roteiroId}/relatorio-${Date.now()}.pdf`;
    const upload = await context.supabase.storage
      .from("checklist-fotos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) return { ok: false, erro: upload.error.message };

    const { error } = await context.supabase
      .from("roteiros_visita_campo")
      .update({ relatorio_pdf_path: caminho, relatorio_enviado_em: new Date().toISOString() })
      .eq("id", data.roteiroId);
    if (error) return { ok: false, erro: error.message };

    return { ok: true, caminho };
  });

export type RelatorioRoteiroCoordenacao = {
  id: string;
  data_visita: string;
  posto: string;
  cliente: string;
  funcao: string;
  colaborador: string;
  supervisor: string;
  percentual_conformidade: number;
  total_nao_conformes: number;
  criticas_abertas: number;
  relatorio_enviado_em: string | null;
  enviado_por_nome: string | null;
  duracao_segundos?: number | null;
  url: string | null;
};

/** Lista, para a Coordenação, os relatórios em PDF enviados pela supervisão de campo. */
export const listarRelatoriosRoteiroCoordenacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("roteiros_visita_campo")
      .select(
        "id,data_visita,posto,cliente,funcao,colaborador,supervisor,percentual_conformidade,total_nao_conformes,criticas_abertas,relatorio_enviado_em,relatorio_pdf_path,enviado_por_nome,duracao_segundos",
      )
      .not("relatorio_pdf_path", "is", null)
      .order("relatorio_enviado_em", { ascending: false })
      .limit(100);

    if (error)
      return { ok: false, erro: error.message, relatorios: [] as RelatorioRoteiroCoordenacao[] };

    const relatorios: RelatorioRoteiroCoordenacao[] = [];
    for (const linha of data ?? []) {
      const caminho = (linha as { relatorio_pdf_path: string | null }).relatorio_pdf_path;
      let url: string | null = null;
      if (caminho) {
        const assinado = await context.supabase.storage
          .from("checklist-fotos")
          .createSignedUrl(caminho, 60 * 60);
        url = assinado.data?.signedUrl ?? null;
      }
      const { relatorio_pdf_path: _ignorado, ...resto } = linha as Record<string, unknown> & {
        relatorio_pdf_path: string | null;
      };
      relatorios.push({ ...(resto as Omit<RelatorioRoteiroCoordenacao, "url">), url });
    }

    return { ok: true, erro: "", relatorios };
  });

/* ------------------------------------------------------------------ */
/* Postos NEXTI próximos à posição atual do supervisor                 */
/* ------------------------------------------------------------------ */

export type PostoProximo = {
  id: number;
  nome: string;
  externalId: string;
  cliente: string;
  cidade: string;
  distanciaKm: number;
};

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Lista os postos da NEXTI mais próximos da posição informada. */
export const postosProximosSupervisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { latitude: number; longitude: number }) => ({
    latitude: Number(input?.latitude),
    longitude: Number(input?.longitude),
  }))
  .handler(async ({ data, context }) => {
    try {
      if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
        return { ok: false, erro: "Localização inválida.", postos: [] as PostoProximo[] };
      }

      const COLUNAS = "nexti_id,name,external_id,client_name,city,latitude,longitude,active";

      let query = await context.supabase
        .from("nexti_workplaces")
        .select(COLUNAS)
        .eq("active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(2000);

      // Se a política de acesso bloquear a leitura, tenta com o cliente privilegiado.
      if (query.error || !(query.data ?? []).length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tentativa = await supabaseAdmin
          .from("nexti_workplaces")
          .select(COLUNAS)
          .eq("active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .limit(2000);
        if (!tentativa.error) query = tentativa;
      }

      if (query.error)
        return { ok: false, erro: query.error.message, postos: [] as PostoProximo[] };

      const postos: PostoProximo[] = (query.data ?? [])
        .map((linha) => ({
          id: Number(linha.nexti_id),
          nome: String(linha.name ?? "Posto"),
          externalId: String(linha.external_id ?? ""),
          cliente: String(linha.client_name ?? ""),
          cidade: String(linha.city ?? ""),
          distanciaKm: distanciaKm(
            data.latitude,
            data.longitude,
            Number(linha.latitude),
            Number(linha.longitude),
          ),
        }))
        .filter((p) => Number.isFinite(p.id) && Number.isFinite(p.distanciaKm))
        .sort((a, b) => a.distanciaKm - b.distanciaKm)
        .slice(0, 8);

      return { ok: true, erro: "", postos };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Falha ao buscar os postos próximos.",
        postos: [] as PostoProximo[],
      };
    }
  });
