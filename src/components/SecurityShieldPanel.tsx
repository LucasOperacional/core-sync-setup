import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Gauge,
  RefreshCw,
  Ban,
  Timer,
  Layers,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  getShieldOverview,
  desbloquearIdentidade,
  type ShieldOverview,
} from "@/lib/security-shield.functions";
import { PROTECTED_CARDS, getShieldRuntimeState } from "@/lib/api-shield";

function outcomeBadge(outcome: string): string {
  switch (outcome) {
    case "success":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
    case "blocked":
      return "bg-red-500/10 text-red-500 border-red-500/30";
    case "retry":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
    case "timeout":
      return "bg-orange-500/10 text-orange-500 border-orange-500/30";
    default:
      return "bg-red-500/10 text-red-400 border-red-500/30";
  }
}

export function SecurityShieldPanel() {
  const fetchOverview = useServerFn(getShieldOverview);
  const unblock = useServerFn(desbloquearIdentidade);
  const [data, setData] = useState<ShieldOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [runtime, setRuntime] = useState(getShieldRuntimeState());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOverview();
      setData(result);
      setRuntime(getShieldRuntimeState());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o escudo.");
    } finally {
      setLoading(false);
    }
  }, [fetchOverview]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      setRuntime(getShieldRuntimeState());
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function handleUnblock(identity: string) {
    try {
      await unblock({ data: { identity } });
      toast.success("Bloqueio removido.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover bloqueio.");
    }
  }

  const totals = data?.totals;
  const successRate =
    totals && totals.events24h > 0 ? Math.round((totals.success24h / totals.events24h) * 100) : 100;
  const coveredKeys = new Set((data?.perCard ?? []).map((c) => c.cardKey));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <ShieldCheck className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{successRate}%</p>
              <p className="text-[10px] text-muted-foreground">Chamadas OK (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10">
              <ShieldX className="size-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totals?.blocked24h ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Bloqueios (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <ShieldAlert className="size-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totals?.errors24h ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Falhas de API (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Gauge className="size-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totals?.avgLatencyMs ?? 0}ms</p>
              <p className="text-[10px] text-muted-foreground">Latência média</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Proteção ativa em {PROTECTED_CARDS.length} áreas do projeto — limite de chamadas por
          usuário, disjuntor automático, retentativas seguras e registro de auditoria.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Cobertura por card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="size-4 text-primary" /> Cobertura dos cards
          </CardTitle>
          <CardDescription className="text-xs">
            Todos os cards abaixo passam pelo escudo antes de falar com qualquer API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROTECTED_CARDS.map((card) => {
              const stats = data?.perCard.find((c) => c.cardKey === card.key);
              const breaker = runtime.find((r) => r.resource === card.resource);
              const open = (breaker?.openSeconds ?? 0) > 0;
              return (
                <div
                  key={card.key}
                  className={`rounded-lg border p-3 ${open ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{card.label}</p>
                    {open ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-red-500/10 text-red-500 border-red-500/30"
                      >
                        Pausado {breaker?.openSeconds}s
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                      >
                        Protegido
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {stats
                      ? `${stats.total} chamadas · ${stats.errors} falhas · ${stats.blocked} bloqueios · ${stats.avgLatencyMs}ms`
                      : coveredKeys.size === 0
                        ? "Sem chamadas registradas nas últimas 24h"
                        : "Sem atividade nas últimas 24h"}
                  </p>
                  {stats && stats.total > 0 && (
                    <Progress
                      value={Math.round(
                        ((stats.total - stats.errors - stats.blocked) / stats.total) * 100,
                      )}
                      className="mt-2 h-1"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bloqueios ativos (anti-abuso / DDoS) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Ban className="size-4 text-red-500" /> Bloqueios ativos (anti-abuso / DDoS)
          </CardTitle>
          <CardDescription className="text-xs">
            Identidades que excederam o limite de chamadas são barradas automaticamente no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.isAdmin ? (
            <p className="text-xs text-muted-foreground">
              Somente administradores visualizam a lista de bloqueios.
            </p>
          ) : data.blocklist.length === 0 ? (
            <p className="text-xs text-emerald-500">
              Nenhum bloqueio ativo — nenhum padrão de abuso detectado.
            </p>
          ) : (
            data.blocklist.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3"
              >
                <ShieldX className="mt-0.5 size-4 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{b.identity}</p>
                  <p className="text-[10px] text-muted-foreground">{b.reason}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Até {new Date(b.blockedUntil).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void handleUnblock(b.identity)}
                >
                  <Unlock className="size-3" /> Liberar
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Janelas de limite */}
      {data?.isAdmin && data.rateWindows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="size-4 text-primary" /> Consumo de limites por recurso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[180px]">
              <div className="space-y-1.5 pr-3">
                {data.rateWindows.map((w) => (
                  <div
                    key={`${w.identity}-${w.resource}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-2"
                  >
                    <span className="truncate text-[11px] text-foreground">{w.resource}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {w.requestCount} chamadas ·{" "}
                      {new Date(w.windowStart).toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Eventos recentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Eventos recentes de API</CardTitle>
          <CardDescription className="text-xs">
            Últimas chamadas protegidas nas 24h.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.recentEvents.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-3">
                {data?.recentEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-2.5"
                  >
                    <Badge variant="outline" className={`text-[10px] ${outcomeBadge(e.outcome)}`}>
                      {e.outcome}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {e.cardKey} · {e.resource}
                        {e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""}
                        {typeof e.latencyMs === "number" ? ` · ${e.latencyMs}ms` : ""}
                      </p>
                      {e.message && (
                        <p className="text-[10px] text-muted-foreground">{e.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
