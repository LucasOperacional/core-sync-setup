/**
 * Lembrete de Relatório de Supervisão de Campo por proximidade.
 *
 * Compara a última posição do rastreio (tabela rastreamento_localizacoes) com
 * os postos da API da NEXTI (nexti_workplaces). Quando a pessoa está dentro do
 * raio do posto e ainda não enviou o relatório de hoje daquele posto, dispara
 * uma notificação no celular lembrando de preencher a Supervisão de Campo.
 *
 * Só roda no servidor.
 */

import { normalizarNome } from "./gerentes-area-a";

/** Raio, em metros, para considerar que a pessoa está no posto. */
export const RAIO_POSTO_METROS = 300;
/** Idade máxima, em minutos, da posição do rastreio para valer como "está agora". */
export const IDADE_POSICAO_MINUTOS = 30;

export type LembreteRastreio = {
  userId: string;
  nome: string;
  posto: string | null;
  cidade: string | null;
  distanciaMetros: number | null;
  minutosAtras: number | null;
  relatorioHoje: boolean;
  enviado: boolean;
  motivo: string;
};

function metrosEntre(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

type Posto = { nome: string; cidade: string; latitude: number; longitude: number };

async function carregarPostos(): Promise<Posto[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("nexti_workplaces")
    .select("name, city, latitude, longitude, active")
    .eq("active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(5000);

  return (data ?? [])
    .map((l) => ({
      nome: String(l.name ?? "").trim(),
      cidade: String(l.city ?? ""),
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
    }))
    .filter((p) => p.nome && Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

/**
 * Analisa a proximidade de uma ou mais pessoas e, quando fizer sentido, envia o
 * lembrete do Relatório de Supervisão de Campo.
 */
export async function verificarProximidadeEAvisar(opcoes: {
  userIds: string[];
  /** Posição informada pelo próprio celular agora (opcional, tem prioridade). */
  posicaoAgora?: { latitude: number; longitude: number } | null;
  /** Quando falso, apenas analisa e não envia notificação. */
  enviar: boolean;
}): Promise<{ postos: number; lembretes: LembreteRastreio[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const postos = await carregarPostos();
  const hoje = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - IDADE_POSICAO_MINUTOS * 60_000).toISOString();

  const { data: perfis } = await supabaseAdmin
    .from("user_profiles")
    .select("id, display_name")
    .in("id", opcoes.userIds);
  const nomes = new Map((perfis ?? []).map((p) => [p.id, String(p.display_name ?? "")]));

  const lembretes: LembreteRastreio[] = [];

  for (const userId of opcoes.userIds) {
    const nome = nomes.get(userId) || "Sem nome";
    const base: LembreteRastreio = {
      userId,
      nome,
      posto: null,
      cidade: null,
      distanciaMetros: null,
      minutosAtras: null,
      relatorioHoje: false,
      enviado: false,
      motivo: "",
    };

    let latitude: number | null = opcoes.posicaoAgora?.latitude ?? null;
    let longitude: number | null = opcoes.posicaoAgora?.longitude ?? null;
    let minutosAtras = latitude !== null ? 0 : null;

    if (latitude === null || longitude === null) {
      const { data: posicao } = await supabaseAdmin
        .from("rastreamento_localizacoes")
        .select("latitude, longitude, capturado_em")
        .eq("user_id", userId)
        .gte("capturado_em", desde)
        .order("capturado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!posicao) {
        lembretes.push({ ...base, motivo: "Sem posição recente no rastreio" });
        continue;
      }
      latitude = Number(posicao.latitude);
      longitude = Number(posicao.longitude);
      minutosAtras = Math.round(
        (Date.now() - new Date(String(posicao.capturado_em)).getTime()) / 60_000,
      );
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      lembretes.push({ ...base, motivo: "Posição inválida no rastreio" });
      continue;
    }

    let melhor: { posto: Posto; metros: number } | null = null;
    for (const posto of postos) {
      const metros = metrosEntre(latitude, longitude, posto.latitude, posto.longitude);
      if (!Number.isFinite(metros) || metros > RAIO_POSTO_METROS) continue;
      if (melhor && melhor.metros <= metros) continue;
      melhor = { posto, metros };
    }

    if (!melhor) {
      lembretes.push({ ...base, minutosAtras, motivo: "Nenhum posto da NEXTI por perto" });
      continue;
    }

    const { data: visitas } = await supabaseAdmin
      .from("roteiros_visita_campo")
      .select("posto")
      .eq("user_id", userId)
      .eq("data_visita", hoje)
      .limit(200);

    const alvo = normalizarNome(melhor.posto.nome);
    const relatorioHoje = (visitas ?? []).some(
      (v) => normalizarNome(String(v.posto ?? "")) === alvo,
    );

    const parcial: LembreteRastreio = {
      ...base,
      posto: melhor.posto.nome,
      cidade: melhor.posto.cidade || null,
      distanciaMetros: Math.round(melhor.metros),
      minutosAtras,
      relatorioHoje,
    };

    if (relatorioHoje) {
      lembretes.push({ ...parcial, motivo: "Relatório de hoje já enviado neste posto" });
      continue;
    }

    if (!opcoes.enviar) {
      lembretes.push({ ...parcial, motivo: "Lembrete necessário (apenas conferência)" });
      continue;
    }

    const { dispararNotificacao } = await import("./push-envio.server");
    const titulo = "Relatório de Supervisão de Campo";
    const corpo = `Você está a ${parcial.distanciaMetros} m do posto ${melhor.posto.nome}${
      melhor.posto.cidade ? ` (${melhor.posto.cidade})` : ""
    }. Preencha o relatório de hoje antes de sair.`;

    try {
      const resultado = await dispararNotificacao({
        category: "nexti",
        event: "lembrete_relatorio_supervisao_campo",
        recipientUserIds: [userId],
        context: {
          posto: melhor.posto.nome,
          cidade: melhor.posto.cidade,
          distancia_metros: parcial.distanciaMetros,
        },
        targetUrl: "/supervisor-campo",
        deduplicationKey: `campo:${userId}:${alvo}:${hoje}`,
        titleOverride: titulo.slice(0, 50),
        bodyOverride: corpo.slice(0, 150),
      });
      const item = resultado.resultados[0];
      lembretes.push({
        ...parcial,
        enviado: item?.status === "sent" || item?.status === "partial",
        motivo:
          item?.status === "duplicado"
            ? "Lembrete já enviado hoje neste posto"
            : (item?.motivo ?? (item?.status === "sent" ? "Lembrete enviado" : "Falha no envio")),
      });
    } catch (erro) {
      lembretes.push({
        ...parcial,
        motivo: erro instanceof Error ? erro.message : "Não foi possível enviar o lembrete",
      });
    }
  }

  return { postos: postos.length, lembretes };
}
