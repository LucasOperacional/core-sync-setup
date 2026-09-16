import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  criarTokenMonitoramento,
  excluirTokenMonitoramento,
  listarTokensMonitoramento,
  resumoMonitoramento,
  revogarTokenMonitoramento,
  type ResumoMonitoramento,
  type TokenMonitoramento,
} from "@/lib/monitoramento.functions";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

export function MonitoramentoIntegracaoCard() {
  const listar = useServerFn(listarTokensMonitoramento);
  const criar = useServerFn(criarTokenMonitoramento);
  const revogar = useServerFn(revogarTokenMonitoramento);
  const excluir = useServerFn(excluirTokenMonitoramento);
  const resumoFn = useServerFn(resumoMonitoramento);

  const [tokens, setTokens] = useState<TokenMonitoramento[]>([]);
  const [resumo, setResumo] = useState<ResumoMonitoramento | null>(null);
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("/api/public/monitor");

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/public/monitor`);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, res] = await Promise.all([listar({}), resumoFn({})]);
      setTokens(lista);
      setResumo(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o monitoramento.");
    } finally {
      setCarregando(false);
    }
  }, [listar, resumoFn]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleCriar() {
    if (nome.trim().length < 2) {
      toast.error("Informe um nome para o token (ex.: UptimeRobot).");
      return;
    }
    setCriando(true);
    try {
      const { token } = await criar({ data: { nome: nome.trim() } });
      setTokenNovo(token);
      setNome("");
      toast.success("Token criado. Copie agora — ele não será exibido novamente.");
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar o token.");
    } finally {
      setCriando(false);
    }
  }

  async function copiar(texto: string, msg: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(msg);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Activity className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-card-foreground">
              Monitoramento Online (API de integração)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere um token para que ferramentas externas (UptimeRobot, Grafana, Zabbix, n8n)
              consultem a saúde do sistema.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          {carregando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Atualizar
        </button>
      </div>

      {/* Métricas */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Chamadas (24h)", valor: resumo ? String(resumo.pings24h) : "—" },
          { label: "Erros (24h)", valor: resumo ? String(resumo.erros24h) : "—" },
          {
            label: "Tempo médio",
            valor: resumo?.duracaoMediaMs != null ? `${resumo.duracaoMediaMs} ms` : "—",
          },
          { label: "Último ping", valor: formatarData(resumo?.ultimoPing ?? null) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{m.valor}</p>
          </div>
        ))}
      </div>

      {/* Endpoint */}
      <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Endpoint de verificação
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-background px-3 py-2 text-sm">
            GET {endpoint}
          </code>
          <button
            type="button"
            onClick={() => void copiar(endpoint, "Endpoint copiado.")}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Copy className="size-4" />
            Copiar
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Envie o cabeçalho <code>Authorization: Bearer SEU_TOKEN</code>. Resposta 200 = sistema
          saudável; 503 = banco indisponível; 401 = token inválido.
        </p>
      </div>

      {/* Criar token */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da integração (ex.: UptimeRobot)"
          className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={criando}
          onClick={() => void handleCriar()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {criando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Gerar token
        </button>
      </div>

      {tokenNovo && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            Copie o token agora — ele não será exibido novamente.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-background px-3 py-2 text-sm">
              {tokenNovo}
            </code>
            <button
              type="button"
              onClick={() => void copiar(tokenNovo, "Token copiado.")}
              className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Copy className="size-4" />
              Copiar
            </button>
            <button
              type="button"
              onClick={() => setTokenNovo(null)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:underline"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      {/* Lista de tokens */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">Token</th>
              <th className="py-2 pr-3">Criado</th>
              <th className="py-2 pr-3">Último uso</th>
              <th className="py-2 pr-3">Chamadas</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground">
                  {carregando ? "Carregando..." : "Nenhum token de integração criado ainda."}
                </td>
              </tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="py-2 pr-3 font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" />
                    {t.nome}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.prefixo}…</td>
                <td className="py-2 pr-3 text-muted-foreground">{formatarData(t.createdAt)}</td>
                <td className="py-2 pr-3 text-muted-foreground">{formatarData(t.lastUsedAt)}</td>
                <td className="py-2 pr-3 text-muted-foreground">{t.totalRequisicoes}</td>
                <td className="py-2 pr-3">
                  {t.revogadoEm ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      Revogado
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                      Ativo
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    {!t.revogadoEm && (
                      <button
                        type="button"
                        title="Revogar"
                        onClick={async () => {
                          await revogar({ data: { id: t.id } });
                          toast.success("Token revogado.");
                          await carregar();
                        }}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent"
                      >
                        <Ban className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Excluir"
                      onClick={async () => {
                        if (!window.confirm(`Excluir o token "${t.nome}"?`)) return;
                        await excluir({ data: { id: t.id } });
                        toast.success("Token excluído.");
                        await carregar();
                      }}
                      className="rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Últimas chamadas */}
      {resumo && resumo.recentes.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Últimas chamadas
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {resumo.recentes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{formatarData(p.createdAt)}</span>
                <span className="font-mono text-xs">{p.endpoint}</span>
                <span
                  className={
                    p.status >= 400
                      ? "text-xs font-semibold text-destructive"
                      : "text-xs font-semibold text-emerald-600"
                  }
                >
                  {p.status} · {p.duracaoMs ?? "—"} ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
