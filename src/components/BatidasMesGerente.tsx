import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { verificarBatidasMesGerente } from "@/lib/batidas-mes-gerente.functions";

export function BatidasMesGerente({ postos, dia }: { postos: string[]; dia: string }) {
  const mes = dia.slice(0, 7);
  const [soPendentes, setSoPendentes] = useState(true);
  const verificar = useServerFn(verificarBatidasMesGerente);
  const lista = useMemo(() => [...postos].sort(), [postos]);
  const q = useQuery({
    queryKey: ["mesa-batidas-mes", mes, lista],
    queryFn: () => verificar({ data: { mes, postos: lista } }),
    enabled: lista.length > 0,
    staleTime: 60_000,
    // Sincroniza sozinho com a NEXTI: quando a folha é arrumada lá, atualiza aqui.
    refetchInterval: 3 * 60_000,
    refetchOnWindowFocus: true,
  });
  const r = q.data;
  const dias = Array.from({ length: r?.ultimoDia ?? 0 }, (_, i) => i + 1);
  const totalSem = (r?.postos ?? []).reduce(
    (s, p) => s + p.colaboradores.filter((c) => c.semBatida.length > 0).length, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Verificação de batidas do mês ({mes.slice(5)}/{mes.slice(0, 4)})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Conferido direto na NEXTI, dia a dia. Atualiza sozinho a cada 3 minutos.
            {r?.atualizadoEm ? ` Última conferência: ${new Date(r.atualizadoEm).toLocaleTimeString("pt-BR")}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSoPendentes((v) => !v)}>
            {soPendentes ? "Mostrar todos" : "Só com dias sem batida"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Conferindo batidas na NEXTI...
          </p>
        ) : r && !r.ok ? (
          <p className="text-sm text-destructive">{r.erro ?? "Falha ao consultar a NEXTI."}</p>
        ) : !r?.postos.length ? (
          <p className="text-sm text-muted-foreground">Nenhum colaborador ativo encontrado nos postos deste gerente.</p>
        ) : (
          <>
            <p className="text-sm">
              <Badge variant={totalSem ? "destructive" : "secondary"}>{totalSem}</Badge> colaborador(es) com algum dia sem batida
              {r.diasComFalha ? ` · ${r.diasComFalha} dia(s) não puderam ser consultados` : ""}
            </p>
            {r.postos.map((p) => {
              const cols = soPendentes ? p.colaboradores.filter((c) => c.semBatida.length) : p.colaboradores;
              if (!cols.length) return null;
              return (
                <div key={p.posto} className="space-y-2">
                  <h4 className="text-sm font-semibold">{p.posto}</h4>
                  {cols.map((c) => (
                    <div key={c.nome} className="rounded-md border p-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-muted-foreground">
                          {c.dias.length} com batida · {c.semBatida.length} sem
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dias.map((d) => {
                          const ok = c.dias.includes(d);
                          return (
                            <span
                              key={d}
                              title={ok ? `Dia ${d}: com batida` : `Dia ${d}: sem batida`}
                              className={`flex size-6 items-center justify-center rounded text-[10px] font-medium ${
                                ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {d}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
