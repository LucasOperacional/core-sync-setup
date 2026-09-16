import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Loader2,
  PlugZap,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  enviarHeartbeatAgora,
  statusMonitor,
  testarConexaoMonitor,
  type StatusMonitor,
} from "@/lib/monitor.functions";

type EstadoTeste = "parado" | "testando" | "conectado" | "falha" | "incompleto";

function data(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

export function MonitorCentralCard() {
  const buscarStatus = useServerFn(statusMonitor);
  const testar = useServerFn(testarConexaoMonitor);
  const bater = useServerFn(enviarHeartbeatAgora);

  const [info, setInfo] = useState<StatusMonitor | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [teste, setTeste] = useState<EstadoTeste>("parado");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setInfo(await buscarStatus({}));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o monitoramento.");
    } finally {
      setCarregando(false);
    }
  }, [buscarStatus]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleTestar() {
    setTeste("testando");
    try {
      const r = await testar({});
      setTeste(
        r.resultado === "conectado"
          ? "conectado"
          : r.resultado === "incompleto"
            ? "incompleto"
            : "falha",
      );
      if (r.resultado === "conectado") toast.success(r.mensagem);
      else toast.error(r.mensagem);
      await carregar();
    } catch (err) {
      setTeste("falha");
      toast.error(err instanceof Error ? err.message : "Falha na conexão.");
    }
  }

  async function handleHeartbeat() {
    setEnviando(true);
    try {
      const r = await bater({});
      if (r.ok) toast.success(`Heartbeat enviado (${r.latencyMs} ms).`);
      else toast.error(r.erro ?? "Não foi possível enviar o heartbeat.");
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o heartbeat.");
    } finally {
      setEnviando(false);
    }
  }

  const conectado = info?.configurado === true && info.ultimoHeartbeatOk === true;
  const rotuloTeste =
    teste === "testando"
      ? "Testando..."
      : teste === "conectado"
        ? "Conectado"
        : teste === "falha"
          ? "Falha na conexão"
          : teste === "incompleto"
            ? "Configuração incompleta"
            : "Testar conexão";

  const linhas: Array<{ label: string; valor: string }> = [
    { label: "ID do projeto", valor: info?.projectId || "—" },
    { label: "Ambiente", valor: info?.ambiente || "—" },
    { label: "Último heartbeat", valor: data(info?.ultimoHeartbeat ?? null) },
    { label: "Status atual", valor: info?.status ?? "—" },
    { label: "Tempo de resposta", valor: info?.latencyMs != null ? `${info.latencyMs} ms` : "—" },
    { label: "Versão publicada", valor: info?.versao || "—" },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <PlugZap className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-card-foreground">
              Lovable Monitor (painel central)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Integração do projeto com o monitoramento central: saúde, heartbeat e erros técnicos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {carregando ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : conectado ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="size-4" /> Monitor conectado
            </span>
          ) : info?.configurado === false ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
              <ShieldAlert className="size-4" /> Configuração incompleta
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
              <XCircle className="size-4" /> Monitor desconectado
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {linhas.map((l) => (
          <div key={l.label} className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{l.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground" title={l.valor}>
              {l.valor}
            </p>
          </div>
        ))}
      </div>

      {info && info.faltando.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-foreground">
          Faltam configurar no backend: <strong>{info.faltando.join(", ")}</strong>.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Último erro
        </p>
        <p className="mt-1 break-words text-sm text-foreground">
          {info?.ultimoErro ?? "Nenhum erro registrado."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {info?.ultimoErroEm ? data(info.ultimoErroEm) : ""}
          {info && info.falhasConsecutivas > 0
            ? ` · ${info.falhasConsecutivas} falha(s) consecutiva(s) de heartbeat`
            : ""}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={teste === "testando"}
          onClick={() => void handleTestar()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {teste === "testando" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {rotuloTeste}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => void handleHeartbeat()}
          className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviar heartbeat agora
        </button>
        <button
          type="button"
          onClick={() => void carregar()}
          className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="size-4" /> Atualizar
        </button>
      </div>
    </section>
  );
}
