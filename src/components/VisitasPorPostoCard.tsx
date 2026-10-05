import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Search,
  TrafficCone,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  listarPostosMapa,
  ocultarNoMapa,
  empresaPermitidaNoMapa,
  type PostoMapa,
} from "@/lib/nexti-postos-mapa.functions";
import { cn } from "@/lib/utils";

type Semaforo = "verde" | "amarelo" | "vermelho";

function semaforoDe(visitas: number): Semaforo {
  if (visitas >= 2) return "verde";
  if (visitas === 1) return "amarelo";
  return "vermelho";
}

const CORES: Record<Semaforo, { dot: string; badge: string; rotulo: string }> = {
  verde: {
    dot: "bg-green-500",
    badge: "bg-green-500/10 text-green-700 dark:text-green-400",
    rotulo: "Em dia (2+ visitas)",
  },
  amarelo: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    rotulo: "Atenção (1 visita)",
  },
  vermelho: {
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    rotulo: "Sem visita",
  },
};

/** Lista todos os postos com a quantidade de visitas da Supervisão em Campo, em semáforo. */
export function VisitasPorPostoCard() {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroCor, setFiltroCor] = useState<Semaforo | null>(null);

  const listar = useServerFn(listarPostosMapa);
  const { data, isLoading } = useQuery({
    queryKey: ["visitas-por-posto"],
    queryFn: () => listar(),
    staleTime: 10 * 60_000,
    enabled: aberto,
  });

  const postos = useMemo(() => {
    const todos: PostoMapa[] = data ?? [];
    return todos
      .filter((p) => empresaPermitidaNoMapa(p) && !ocultarNoMapa(p))
      .map((p) => ({ ...p, cor: semaforoDe(p.visitasRealizadas || 0) }))
      .sort((a, b) => (a.visitasRealizadas || 0) - (b.visitasRealizadas || 0));
  }, [data]);

  const contagem = useMemo(() => {
    const c = { verde: 0, amarelo: 0, vermelho: 0 };
    for (const p of postos) c[p.cor]++;
    return c;
  }, [postos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return postos.filter((p) => {
      if (filtroCor && p.cor !== filtroCor) return false;
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        (p.cliente ?? "").toLowerCase().includes(termo) ||
        (p.cidade ?? "").toLowerCase().includes(termo)
      );
    });
  }, [postos, busca, filtroCor]);

  return (
    <Card className="shadow-lg border-border/50">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="block w-full text-left"
      >
        <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrafficCone className="size-5 text-primary" /> Quantidade de visitas por posto
            {aberto ? (
              <ChevronUp className="ms-auto size-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="ms-auto size-5 text-muted-foreground" />
            )}
          </CardTitle>
          <CardDescription>
            Todos os postos com o total de visitas da supervisão: verde em dia, amarelo com
            atenção e vermelho sem visita. Clique para {aberto ? "fechar" : "abrir"}.
          </CardDescription>
        </CardHeader>
      </button>

      {aberto && (
        <CardContent className="space-y-4 pt-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="size-8 animate-spin mb-2" />
              <p className="text-sm">Carregando postos...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(CORES) as Semaforo[]).map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setFiltroCor((atual) => (atual === cor ? null : cor))}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      filtroCor === cor
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("size-2.5 rounded-full", CORES[cor].dot)} />
                    {CORES[cor].rotulo}: {contagem[cor]}
                  </button>
                ))}
                <div className="relative ms-auto w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar posto, cliente ou cidade..."
                    className="pl-9"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {visiveis.length} de {postos.length} postos exibidos — ordenados do menos
                visitado ao mais visitado.
              </p>

              <div className="max-h-[480px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {visiveis.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum posto encontrado com esses filtros.
                  </p>
                ) : (
                  visiveis.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30"
                    >
                      <span
                        className={cn("size-3 shrink-0 rounded-full", CORES[p.cor].dot)}
                        title={CORES[p.cor].rotulo}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          {p.nome}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.cliente, p.cidade, p.uf].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 border-transparent font-semibold", CORES[p.cor].badge)}
                      >
                        {p.visitasRealizadas || 0}{" "}
                        {(p.visitasRealizadas || 0) === 1 ? "visita" : "visitas"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
