import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { areaGerenteCanonica } from "@/lib/areas-gerentes";
import { normalizarNome } from "@/lib/gerentes-area-a";

/** Distância, em metros, para considerar que o supervisor chegou ao posto. */
export const RAIO_CHEGADA_METROS = 200;
/** Tempo mínimo entre dois avisos do mesmo posto (evita mensagens repetidas). */
const INTERVALO_AVISO_HORAS = 4;

export type PostoChegada = {
  id: number | null;
  nome: string;
  cliente: string;
  cidade: string;
  distanciaMetros: number;
};

export type ChegadaResultado = {
  chegou: boolean;
  posto: PostoChegada | null;
  avisoWhatsapp: boolean;
  mensagem: string;
};

function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Transforma o telefone digitado em um identificador de conversa do WhatsApp. */
function chatIdDoTelefone(telefone: string): string | null {
  const numeros = telefone.replace(/\D/g, "");
  if (numeros.length < 10) return null;
  const comPais = numeros.length <= 11 ? `55${numeros}` : numeros;
  return `${comPais}@c.us`;
}

/** Envia o aviso pelo WhatsApp (silencioso quando o servidor não está configurado). */
async function enviarWhatsapp(telefone: string, texto: string): Promise<string | null> {
  const baseUrl = (process.env["WWEBJS_BASE_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["WWEBJS_TOKEN"] ?? "";
  if (!baseUrl) return "Servidor do WhatsApp não configurado.";
  const chatId = chatIdDoTelefone(telefone);
  if (!chatId) return "Telefone inválido.";
  try {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ chatId, message: texto }),
    });
    if (!res.ok) return `Erro ${res.status} ao enviar no WhatsApp.`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Falha ao enviar no WhatsApp.";
  }
}

/** Telefone do usuário logado que recebe os avisos de chegada ao posto. */
export const meuTelefoneAviso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ telefone: string }> => {
    const { data } = await context.supabase
      .from("user_profiles")
      .select("telefone")
      .eq("id", context.userId)
      .maybeSingle();
    return { telefone: (data?.telefone as string | null) ?? "" };
  });

/** Salva o telefone que recebe os avisos de chegada ao posto. */
export const salvarTelefoneAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { telefone: string }) => {
    const telefone = String(input?.telefone ?? "").trim();
    if (telefone && telefone.replace(/\D/g, "").length < 10)
      throw new Error("Informe o telefone com DDD.");
    return { telefone };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const { error } = await context.supabase
      .from("user_profiles")
      .update({ telefone: data.telefone || null })
      .eq("id", context.userId);
    return error ? { ok: false, erro: error.message } : { ok: true };
  });

/**
 * Regra automática: com a posição do celular, verifica se o supervisor está a
 * menos de 200 m de um posto dele. Se estiver, registra a chegada e dispara o
 * aviso no WhatsApp — uma vez a cada 4 horas por posto.
 */
export const verificarChegadaPosto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { latitude: number; longitude: number }) => ({
    latitude: Number(input?.latitude),
    longitude: Number(input?.longitude),
  }))
  .handler(async ({ data, context }): Promise<ChegadaResultado> => {
    const vazio: ChegadaResultado = {
      chegou: false,
      posto: null,
      avisoWhatsapp: false,
      mensagem: "",
    };
    if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return vazio;

    const { data: perfil } = await context.supabase
      .from("user_profiles")
      .select("display_name, telefone")
      .eq("id", context.userId)
      .maybeSingle();

    const nomePerfil = (perfil?.display_name ?? "").trim();
    const gerenteNome = nomePerfil ? areaGerenteCanonica(nomePerfil) : null;

    // Postos permitidos: quando o usuário é gerente de área, só os da área dele.
    let permitidos: Set<string> | null = null;
    if (gerenteNome) {
      const { data: vinculados } = await context.supabase
        .from("areas_gerentes_postos")
        .select("posto_nome")
        .eq("gerente_nome", gerenteNome);
      if (vinculados && vinculados.length > 0) {
        permitidos = new Set(vinculados.map((p) => normalizarNome(p.posto_nome)));
      }
    }

    const COLUNAS = "nexti_id,name,client_name,city,latitude,longitude,active";
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
    if (consulta.error) return vazio;

    let maisProximo: PostoChegada | null = null;
    for (const linha of consulta.data ?? []) {
      const nome = String(linha.name ?? "Posto");
      if (permitidos && !permitidos.has(normalizarNome(nome))) continue;
      const metros = distanciaMetros(
        data.latitude,
        data.longitude,
        Number(linha.latitude),
        Number(linha.longitude),
      );
      if (!Number.isFinite(metros)) continue;
      if (!maisProximo || metros < maisProximo.distanciaMetros) {
        maisProximo = {
          id: Number.isFinite(Number(linha.nexti_id)) ? Number(linha.nexti_id) : null,
          nome,
          cliente: String(linha.client_name ?? ""),
          cidade: String(linha.city ?? ""),
          distanciaMetros: Math.round(metros),
        };
      }
    }

    if (!maisProximo || maisProximo.distanciaMetros > RAIO_CHEGADA_METROS) return vazio;

    // Evita repetir o aviso do mesmo posto dentro da janela definida.
    const desde = new Date(Date.now() - INTERVALO_AVISO_HORAS * 3600_000).toISOString();
    const { data: recente } = await context.supabase
      .from("chegadas_posto")
      .select("id")
      .eq("user_id", context.userId)
      .eq("posto_nome", maisProximo.nome)
      .gte("created_at", desde)
      .limit(1);
    if (recente && recente.length > 0) return vazio;

    const texto =
      `📍 Você chegou ao posto ${maisProximo.nome}` +
      (maisProximo.cidade ? ` (${maisProximo.cidade})` : "") +
      `.\nA Supervisão de Campo foi aberta automaticamente e o tempo já está sendo contado.`;

    const telefone = String((perfil?.telefone as string | null) ?? "").trim();
    const erroAviso = telefone ? await enviarWhatsapp(telefone, texto) : "Telefone não cadastrado.";

    await context.supabase.from("chegadas_posto").insert({
      user_id: context.userId,
      posto_nexti_id: maisProximo.id,
      posto_nome: maisProximo.nome,
      distancia_metros: maisProximo.distanciaMetros,
      latitude: data.latitude,
      longitude: data.longitude,
      avisado_whatsapp: !erroAviso,
      erro_aviso: erroAviso,
    });

    return {
      chegou: true,
      posto: maisProximo,
      avisoWhatsapp: !erroAviso,
      mensagem: texto,
    };
  });
