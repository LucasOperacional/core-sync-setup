import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PosicaoRastreio {
  id: string;
  userId: string;
  nome: string;
  latitude: number;
  longitude: number;
  precisaoMetros: number | null;
  velocidade: number | null;
  direcao: number | null;
  tipoSinal: string | null;
  bateria: number | null;
  capturadoEm: string;
}

const PAPEIS_GESTOR = ["admin", "diretor", "cordenador"] as const;

/** O próprio usuário envia a posição do celular (GPS + rede 4G/5G). */
export const registrarLocalizacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      latitude: number;
      longitude: number;
      precisaoMetros?: number | null;
      velocidade?: number | null;
      direcao?: number | null;
      tipoSinal?: string | null;
      bateria?: number | null;
      capturadoEm?: string | null;
    }) => {
      if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
        throw new Error("Coordenadas inválidas.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Regra: apenas usuários com papel de Supervisor podem enviar localização.
    const { data: ehSupervisor } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "supervisor",
    });
    if (ehSupervisor !== true) {
      throw new Error("Apenas supervisores podem compartilhar a localização.");
    }

    const { data: perfil } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    const { error } = await supabase.from("rastreamento_localizacoes").insert({
      user_id: userId,
      nome: perfil?.display_name ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      precisao_metros: data.precisaoMetros ?? null,
      velocidade: data.velocidade ?? null,
      direcao: data.direcao ?? null,
      tipo_sinal: data.tipoSinal ?? null,
      bateria: data.bateria ?? null,
      capturado_em: data.capturadoEm ?? new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Última posição conhecida de cada pessoa que está compartilhando. */
export const listarLocalizacoesAtuais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PosicaoRastreio[]> => {
    const { supabase, userId } = context;
    let autorizado = false;
    for (const papel of PAPEIS_GESTOR) {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: papel });
      if (data === true) {
        autorizado = true;
        break;
      }
    }
    if (!autorizado) {
      throw new Error("Você não tem permissão para monitorar localizações.");
    }

    const desde = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("rastreamento_localizacoes")
      .select(
        "id,user_id,nome,latitude,longitude,precisao_metros,velocidade,direcao,tipo_sinal,bateria,capturado_em",
      )
      .gte("capturado_em", desde)
      .order("capturado_em", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const porPessoa = new Map<string, PosicaoRastreio>();
    for (const linha of data ?? []) {
      if (porPessoa.has(linha.user_id)) continue;
      porPessoa.set(linha.user_id, {
        id: linha.id,
        userId: linha.user_id,
        nome: linha.nome ?? "Sem nome",
        latitude: Number(linha.latitude),
        longitude: Number(linha.longitude),
        precisaoMetros: linha.precisao_metros === null ? null : Number(linha.precisao_metros),
        velocidade: linha.velocidade === null ? null : Number(linha.velocidade),
        direcao: linha.direcao === null ? null : Number(linha.direcao),
        tipoSinal: linha.tipo_sinal ?? null,
        bateria: linha.bateria === null ? null : Number(linha.bateria),
        capturadoEm: linha.capturado_em,
      });
    }

    return [...porPessoa.values()].sort(
      (a, b) => new Date(b.capturadoEm).getTime() - new Date(a.capturadoEm).getTime(),
    );
  });

export interface ParadaAcompanhamento {
  inicio: string;
  fim: string;
  minutos: number;
  latitude: number;
  longitude: number;
  pontos: number;
}

export interface LinhaAcompanhamento {
  userId: string;
  nome: string;
  pontos: number;
  primeiroEm: string;
  ultimoEm: string;
  distanciaKm: number;
  paradas: ParadaAcompanhamento[];
}

function distanciaKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  const r = 6371;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Relatório de acompanhamento: por onde cada supervisor passou no período.
 * Gestores veem todos; o supervisor vê apenas o próprio histórico.
 */
export const relatorioAcompanhamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { de: string; ate: string; userId?: string | null }) => {
    if (!input.de || !input.ate) throw new Error("Informe o período do relatório.");
    return input;
  })
  .handler(async ({ data, context }): Promise<LinhaAcompanhamento[]> => {
    const { supabase, userId } = context;

    let gestor = false;
    for (const papel of PAPEIS_GESTOR) {
      const { data: ok } = await supabase.rpc("has_role", { _user_id: userId, _role: papel });
      if (ok === true) {
        gestor = true;
        break;
      }
    }

    const inicio = new Date(`${data.de}T00:00:00`).toISOString();
    const fim = new Date(`${data.ate}T23:59:59`).toISOString();

    let consulta = supabase
      .from("rastreamento_localizacoes")
      .select("user_id,nome,latitude,longitude,capturado_em")
      .gte("capturado_em", inicio)
      .lte("capturado_em", fim)
      .order("capturado_em", { ascending: true })
      .limit(5000);

    if (!gestor) consulta = consulta.eq("user_id", userId);
    else if (data.userId) consulta = consulta.eq("user_id", data.userId);

    const { data: linhas, error } = await consulta;
    if (error) throw new Error(error.message);

    const porPessoa = new Map<
      string,
      { nome: string; pontos: { lat: number; lon: number; em: string }[] }
    >();
    for (const l of linhas ?? []) {
      const atual = porPessoa.get(l.user_id) ?? { nome: l.nome ?? "Sem nome", pontos: [] };
      atual.nome = l.nome ?? atual.nome;
      atual.pontos.push({
        lat: Number(l.latitude),
        lon: Number(l.longitude),
        em: l.capturado_em,
      });
      porPessoa.set(l.user_id, atual);
    }

    const resultado: LinhaAcompanhamento[] = [];
    for (const [id, pessoa] of porPessoa) {
      const pts = pessoa.pontos;
      if (pts.length === 0) continue;

      let km = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const d = distanciaKm(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon);
        if (d > 0.02) km += d; // ignora oscilação do GPS
      }

      // Paradas: pontos consecutivos dentro de ~120 m.
      const paradas: ParadaAcompanhamento[] = [];
      let grupo = [pts[0]!];
      const fecharGrupo = () => {
        const primeiro = grupo[0]!;
        const ultimo = grupo[grupo.length - 1]!;
        const minutos = Math.round(
          (new Date(ultimo.em).getTime() - new Date(primeiro.em).getTime()) / 60000,
        );
        if (minutos >= 5 || grupo.length >= 3) {
          paradas.push({
            inicio: primeiro.em,
            fim: ultimo.em,
            minutos,
            latitude: primeiro.lat,
            longitude: primeiro.lon,
            pontos: grupo.length,
          });
        }
      };
      for (let i = 1; i < pts.length; i += 1) {
        const base = grupo[0]!;
        if (distanciaKm(base.lat, base.lon, pts[i]!.lat, pts[i]!.lon) <= 0.12) {
          grupo.push(pts[i]!);
        } else {
          fecharGrupo();
          grupo = [pts[i]!];
        }
      }
      fecharGrupo();

      resultado.push({
        userId: id,
        nome: pessoa.nome,
        pontos: pts.length,
        primeiroEm: pts[0]!.em,
        ultimoEm: pts[pts.length - 1]!.em,
        distanciaKm: Math.round(km * 10) / 10,
        paradas,
      });
    }

    return resultado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });
