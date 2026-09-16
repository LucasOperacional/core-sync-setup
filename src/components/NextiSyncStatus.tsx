import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, Loader2, RefreshCw, Satellite, TriangleAlert } from "lucide-react";
import { syncNexti, type NextiModulo, type NextiSyncResultado } from "@/lib/nexti-sync.functions";
import { assinarNextiRealtime } from "@/lib/nexti-dashboards";
import {
  assinarFonteDashboard,
  importacaoDeHoje,
  type DashboardFonteModulo,
} from "@/lib/fonte-dashboard";
import { nextiApiAtiva, useNextiApiAtiva } from "@/lib/nexti-api-status";

const INTERVALO_MS = 5 * 60 * 1000;
const CHAVE_ULTIMA = "nexti-ultima-sync-v1";

type Props = {
  modulos: NextiModulo[];
  titulo?: string;
  /**
   * Módulo do dashboard: quando houver importação de documentos no dia,
   * a importação tem preferência e a NEXTI só sincroniza sob comando manual.
   */
  fonte?: DashboardFonteModulo;
  /** Chamado sempre que houver dado novo (sync concluído ou evento em tempo real). */
  onAtualizar: () => void;
};

/** Tempo máximo de espera por uma sincronização antes de considerar falha. */
const TIMEOUT_MS = 90_000;
const TENTATIVAS = 3;

function lerUltima(): number {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMA) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function gravarUltima(valor: number) {
  try {
    localStorage.setItem(CHAVE_ULTIMA, String(valor));
  } catch {
    /* storage indisponível */
  }
}

function erroTransitorio(mensagem: string): boolean {
  return /timeout|network|failed to fetch|fetch failed|econn|socket|502|503|504|429|temporar/i.test(
    mensagem,
  );
}

export function NextiSyncStatus({
  modulos,
  titulo = "Sincronização NEXTI",
  fonte,
  onAtualizar,
}: Props) {
  const executarSync = useServerFn(syncNexti);
  const [sincronizando, setSincronizando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState<NextiSyncResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [importHoje, setImportHoje] = useState<{ registros: number } | null>(null);
  const emExecucao = useRef(false);
  const montado = useRef(true);
  const apiAtiva = useNextiApiAtiva();
  const atualizarRef = useRef(onAtualizar);
  atualizarRef.current = onAtualizar;
  // Mantém a identidade estável mesmo quando o pai passa um array inline,
  // evitando que o efeito de sincronização reinicie em cada render.
  const modulosKey = modulos.join(",");
  const modulosRef = useRef(modulos);
  modulosRef.current = modulos;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!fonte) return;
    const ler = () => setImportHoje(importacaoDeHoje(fonte));
    ler();
    return assinarFonteDashboard(ler);
  }, [fonte]);

  const sincronizar = useCallback(
    async (modo: "manual" | "automatico") => {
      if (emExecucao.current) return;
      // Regra: API desligada => nenhuma informação é importada da NEXTI.
      // Os dashboards passam a ser alimentados somente pelos arquivos importados.
      let ativa: boolean;
      try {
        ativa = await nextiApiAtiva(modo === "manual");
      } catch {
        ativa = false;
      }
      if (!ativa) {
        if (montado.current) setErro(null);
        atualizarRef.current();
        return;
      }
      if (modo === "automatico") {
        // Regra: importação de documentos do dia tem preferência sobre a API.
        if (fonte && importacaoDeHoje(fonte)) {
          atualizarRef.current();
          return;
        }
        if (Date.now() - lerUltima() < INTERVALO_MS) {
          atualizarRef.current();
          return;
        }
      }

      emExecucao.current = true;
      if (montado.current) {
        setSincronizando(true);
        setErro(null);
        setTentativa(0);
      }

      let ultimoErro = "";
      try {
        for (let n = 1; n <= TENTATIVAS; n++) {
          if (montado.current) setTentativa(n);
          try {
            const res = await Promise.race([
              executarSync({ data: { modulos: modulosRef.current, modo } }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("timeout: a NEXTI demorou demais para responder.")),
                  TIMEOUT_MS,
                ),
              ),
            ]);
            if (montado.current) {
              setResultado(res);
              setErro(res.ok ? null : (res.erro ?? "A NEXTI recusou parte da sincronização."));
            }
            gravarUltima(Date.now());
            ultimoErro = "";
            break;
          } catch (e) {
            ultimoErro = e instanceof Error ? e.message : "Falha ao sincronizar com a NEXTI.";
            // Só vale repetir em falhas passageiras (rede, timeout, limite de taxa).
            if (n === TENTATIVAS || !erroTransitorio(ultimoErro)) break;
            await new Promise((r) => setTimeout(r, 1200 * n));
          }
        }
        if (ultimoErro && montado.current) setErro(ultimoErro);
      } finally {
        emExecucao.current = false;
        if (montado.current) {
          setSincronizando(false);
          setTentativa(0);
        }
        atualizarRef.current();
      }
    },
    [executarSync, modulosKey, fonte],
  );

  useEffect(() => {
    void sincronizar("automatico");
    const timer = setInterval(() => void sincronizar("automatico"), INTERVALO_MS);
    // Retoma a sincronização quando a aba volta a ficar visível/online.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void sincronizar("automatico");
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    const cancelar = assinarNextiRealtime(() => atualizarRef.current());
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      cancelar();
    };
  }, [sincronizar]);

  const total = resultado?.totalRegistros ?? 0;
  const falhas = resultado?.modulos.filter((m) => !m.ok) ?? [];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {apiAtiva === false || importHoje ? (
            <FileCheck2 className="size-4" />
          ) : (
            <Satellite className="size-4" />
          )}
        </span>
        <div className="text-sm">
          <p className="font-medium text-foreground">{titulo}</p>
          <p className="text-xs text-muted-foreground">
            {apiAtiva === false
              ? "API NEXTI desligada: nenhum dado é importado da NEXTI. Os dashboards usam apenas os arquivos importados."
              : sincronizando
                ? tentativa > 1
                  ? `Reconectando com a NEXTI… (tentativa ${tentativa} de ${TENTATIVAS})`
                  : "Buscando novos registros na NEXTI…"
                : importHoje
                  ? `Importação de documentos de hoje tem preferência (${importHoje.registros} registro(s)). A NEXTI só alimenta se não houver importação no dia.`
                  : resultado
                    ? `${total} registro(s) atualizados · ${new Date(resultado.finalizadoEm).toLocaleTimeString("pt-BR")}`
                    : "Sem importação hoje: a NEXTI alimenta automaticamente a cada 5 minutos."}
          </p>

          {erro ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <TriangleAlert className="size-3" /> {erro}
            </p>
          ) : null}
          {falhas.length > 0 && !erro ? (
            <p className="mt-1 text-xs text-amber-500">
              Módulos indisponíveis: {falhas.map((f) => f.modulo).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void sincronizar("manual")}
        disabled={sincronizando || apiAtiva === false}
        aria-busy={sincronizando}
        title={
          apiAtiva === false
            ? "API NEXTI desligada — use a importação de arquivos"
            : sincronizando
              ? "Sincronização em andamento"
              : "Buscar agora os dados da NEXTI"
        }
        className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-60"
      >
        {sincronizando ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </div>
  );
}
