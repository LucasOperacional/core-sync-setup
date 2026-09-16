import { useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO = "protocolo-folhas:atualizado";
export const PROTOCOLO_FOLHAS_BROADCAST_CHANNEL = "protocolo-folhas-sync";
export const STORAGE_ULTIMA_SINCRONIZACAO_PROTOCOLO = "protocolo-folhas:ultima-sincronizacao";

export const protocoloFolhasQueryKeys = {
  dashboardResumo: ["protocolo-folhas-dashboard", "resumo"] as const,
  protocolos: ["protocolos"] as const,
  folhasProtocoladas: ["folhas-protocoladas"] as const,
  folhasProtocoladasComProtocolo: ["folhas-protocoladas-com-protocolo"] as const,
  dashboardFolhas: ["dashboard-cards-folhas"] as const,
  dashboardAtivos: ["dashboard-cards-ativos"] as const,
  funcionariosAtivos: ["funcionarios-ativos"] as const,
  cartoesPontoResumo: ["cartoes-ponto-resumo"] as const,
  cartoesPontoColaboradores: ["cartoes-ponto-colaboradores"] as const,
  cartoesPontoProtocolos: ["cartoes-ponto-protocolos"] as const,
  separarFolhasProtocoladas: ["separar-folhas-protocoladas"] as const,
  horasExtrasProtocoladas: ["horas-extras-protocoladas"] as const,
  /** Fonte unificada dos cards de posto (folhas + ativos + NEXTI). */
  postosCards: ["postos-cards", "pessoas-unificadas"] as const,
  /** Contagem de reservas consultada ao vivo na NEXTI. */
  reservasNexti: ["dashboard-protocolo", "reservas-nexti"] as const,
};

const QUERY_KEYS_PARA_INVALIDAR = Object.values(protocoloFolhasQueryKeys);

/**
 * Consultas caras (leem PDFs do storage e chegam a rodar OCR). Elas continuam
 * sendo invalidadas, mas NUNCA são refeitas automaticamente pelo tempo real ou
 * pelo temporizador — só quando a aba correspondente pede. Sem isso, a análise
 * de horas extras era reexecutada a cada poucos segundos e travava a página.
 */
const QUERY_KEYS_PESADAS: readonly (readonly string[])[] = [
  protocoloFolhasQueryKeys.horasExtrasProtocoladas,
  protocoloFolhasQueryKeys.separarFolhasProtocoladas,
];

function ehConsultaPesada(queryKey: readonly string[]): boolean {
  return QUERY_KEYS_PESADAS.some((pesada) => pesada[0] === queryKey[0]);
}

const QUERY_KEYS_LEVES = QUERY_KEYS_PARA_INVALIDAR.filter((k) => !ehConsultaPesada(k));

type OrigemSincronizacao =
  "importacao" | "protocolacao" | "atualizacao" | "exclusao" | "realtime" | "manual";

export type FolhaParaChave = {
  colaborador?: string | null;
  nome?: string | null;
  empresa?: string | null;
  matricula?: string | null;
};

export function normalizarTextoProtocolo(valor: string | null | undefined): string {
  return String(valor ?? "")
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._/\\-]+/g, " ")
    .trim()
    .toUpperCase();
}

function matriculaValida(valor: string | null | undefined): boolean {
  const normalizada = normalizarTextoProtocolo(valor);
  return (
    normalizada.length > 0 &&
    normalizada !== "NAO IDENTIFICADO" &&
    normalizada !== "NÃO IDENTIFICADO"
  );
}

/**
 * Chave única compartilhada entre preview, gravação e dashboard.
 * A conferência de duplicidade é feita pelo NOME COMPLETO normalizado
 * (sem acentos, sem diferença de caixa e com espaços ajustados) dentro da
 * mesma empresa. A matrícula só é usada quando o nome não está disponível.
 */
export function chaveUnicaFolhaPonto(folha: FolhaParaChave): string {
  const empresa = normalizarTextoProtocolo(folha.empresa);
  const matricula = normalizarTextoProtocolo(folha.matricula);
  const nome = normalizarTextoProtocolo(folha.colaborador ?? folha.nome);

  if (nome.length > 0) {
    return `NOME:${empresa}:${nome}`;
  }

  if (matriculaValida(matricula)) {
    return `MATRICULA:${empresa}:${matricula}`;
  }

  return `NOME:${empresa}:`;
}

export function deduplicarFolhasPonto<T extends FolhaParaChave>(
  folhas: T[],
): {
  unicas: T[];
  duplicadas: T[];
} {
  const vistas = new Set<string>();
  const unicas: T[] = [];
  const duplicadas: T[] = [];

  for (const folha of folhas) {
    const chave = chaveUnicaFolhaPonto(folha);
    if (vistas.has(chave)) {
      duplicadas.push(folha);
      continue;
    }
    vistas.add(chave);
    unicas.push(folha);
  }

  return { unicas, duplicadas };
}

export function contarFolhasUnicas<T extends FolhaParaChave>(
  folhas: T[] | null | undefined,
): number {
  if (!folhas?.length) return 0;
  return new Set(folhas.map(chaveUnicaFolhaPonto)).size;
}

export function registrarUltimaSincronizacaoProtocolo(timestamp = Date.now()): string {
  const iso = new Date(timestamp).toISOString();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_ULTIMA_SINCRONIZACAO_PROTOCOLO, iso);
    } catch {
      // Storage indisponível; a sincronização da aba atual continua funcionando.
    }
  }
  return iso;
}

export function obterUltimaSincronizacaoProtocolo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_ULTIMA_SINCRONIZACAO_PROTOCOLO);
  } catch {
    return null;
  }
}

export function registrarFalhaSincronizacaoProtocolo(
  origem: string,
  erro: unknown,
  contexto?: Record<string, string | number | boolean | null | undefined>,
) {
  const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida";
  console.warn("[protocolo-folhas-sync] Falha de sincronização", {
    origem,
    mensagem,
    contexto,
  });
}

export function invalidarConsultasProtocoloFolhas(queryClient: QueryClient) {
  registrarUltimaSincronizacaoProtocolo();
  for (const queryKey of QUERY_KEYS_PARA_INVALIDAR) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export async function sincronizarDashboardProtocoloFolhas(queryClient: QueryClient) {
  registrarUltimaSincronizacaoProtocolo();
  for (const queryKey of QUERY_KEYS_PARA_INVALIDAR) {
    await queryClient.invalidateQueries({ queryKey });
  }
  await queryClient.refetchQueries({
    queryKey: protocoloFolhasQueryKeys.dashboardResumo,
    type: "active",
  });
}

export function notificarAtualizacaoProtocoloFolhas(origem: OrigemSincronizacao = "manual") {
  if (typeof window === "undefined") return;

  const timestamp = Date.now();
  const detail = { origem, timestamp };
  registrarUltimaSincronizacaoProtocolo(timestamp);
  window.dispatchEvent(new CustomEvent(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, { detail }));

  try {
    const channel = new BroadcastChannel(PROTOCOLO_FOLHAS_BROADCAST_CHANNEL);
    channel.postMessage(detail);
    channel.close();
  } catch {
    try {
      window.localStorage.setItem(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, JSON.stringify(detail));
    } catch {
      // Sem storage disponível; o evento da janela atual já foi emitido.
    }
  }
}

export type StatusTempoRealProtocolo = "conectando" | "conectado" | "reconectando" | "offline";

export type SincronizacaoTempoReal = {
  status: StatusTempoRealProtocolo;
  ultimaAtualizacaoRemota: string | null;
};

export function useProtocoloFolhasRealtimeSync(queryClient: QueryClient): SincronizacaoTempoReal {
  const [status, setStatus] = useState<StatusTempoRealProtocolo>("conectando");
  const [ultimaAtualizacaoRemota, setUltimaAtualizacaoRemota] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let sincronizando = false;
    let ativo = true;

    const sincronizar = () => {
      if (!ativo) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        if (sincronizando || !ativo) return;
        sincronizando = true;
        try {
          invalidarConsultasProtocoloFolhas(queryClient);
          // Refetch apenas as consultas desta página, evitando recarregar o app inteiro.
          await Promise.all(
            QUERY_KEYS_LEVES.map((queryKey) =>
              queryClient.refetchQueries({ queryKey, type: "active" }),
            ),
          );
        } catch (erro) {
          registrarFalhaSincronizacaoProtocolo("realtime", erro);
        } finally {
          sincronizando = false;
        }
      }, 180);
    };

    const sincronizarRemoto = () => {
      if (!ativo) return;
      setUltimaAtualizacaoRemota(new Date().toISOString());
      sincronizar();
    };

    const onLocalEvent = () => sincronizar();
    const onStorage = (event: StorageEvent) => {
      if (event.key === EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO) sincronizar();
    };

    window.addEventListener(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, onLocalEvent);
    window.addEventListener("ponto:atualizado", onLocalEvent);
    window.addEventListener("funcionarios:atualizado", onLocalEvent);
    window.addEventListener("storage", onStorage);

    let broadcast: BroadcastChannel | null = null;
    try {
      broadcast = new BroadcastChannel(PROTOCOLO_FOLHAS_BROADCAST_CHANNEL);
      broadcast.onmessage = () => sincronizar();
    } catch {
      broadcast = null;
    }

    const TABELAS_TEMPO_REAL = [
      "protocolos",
      "protocolo_folhas",
      "funcionarios_ativos",
      "colaboradores_ponto",
      "protocolos_ponto",
      "protocolo_ponto_itens",
      "nexti_persons",
      "nexti_workplaces",
      "nexti_companies",
    ] as const;

    let realtimeChannel = supabase.channel("protocolo-folhas-tempo-real");
    for (const table of TABELAS_TEMPO_REAL) {
      realtimeChannel = realtimeChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        sincronizarRemoto,
      );
    }
    realtimeChannel.subscribe((estado, erro) => {
      if (!ativo) return;
      if (estado === "SUBSCRIBED") {
        setStatus("conectado");
        sincronizar();
        return;
      }
      if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
        setStatus("reconectando");
        registrarFalhaSincronizacaoProtocolo("supabase-realtime", erro, { estado });
        return;
      }
      if (estado === "CLOSED") setStatus("offline");
    });

    const onVisibilidade = () => {
      if (document.visibilityState === "visible") sincronizar();
    };
    const onOnline = () => {
      if (!ativo) return;
      setStatus("reconectando");
      sincronizar();
    };
    const onOffline = () => {
      if (ativo) setStatus("offline");
    };

    document.addEventListener("visibilitychange", onVisibilidade);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onLocalEvent);

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") sincronizar();
    }, 30_000);

    return () => {
      ativo = false;
      if (timeout) clearTimeout(timeout);
      window.clearInterval(intervalo);
      window.removeEventListener(EVENTO_PROTOCOLO_FOLHAS_ATUALIZADO, onLocalEvent);
      window.removeEventListener("ponto:atualizado", onLocalEvent);
      window.removeEventListener("funcionarios:atualizado", onLocalEvent);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilidade);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onLocalEvent);
      broadcast?.close();
      void supabase.removeChannel(realtimeChannel);
    };
  }, [queryClient]);

  return { status, ultimaAtualizacaoRemota };
}
