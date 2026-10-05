import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Loader2, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarPostosDeTodosGerentes } from "@/lib/areas-gerentes.functions";
import { nomeAmigavel } from "@/lib/areas-gerentes";
import { cn } from "@/lib/utils";

/**
 * Um card por gerente de área com os postos atribuídos em massa a ele
 * (a mesma lista definida em "Postos em massa para gerente").
 */
export function PostosPorGerenteCards() {
  const listar = useServerFn(listarPostosDeTodosGerentes);
  const q = useQuery({
    queryKey: ["postos-gerente", "todos"],
    queryFn: () => listar(),
    staleTime: 5 * 60_000,
  });
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const gerentes = q.data?.ok ? q.data.gerentes : [];

  return (
    <Card data-sem-movimento className="shadow-lg border-border/50">
      <CardHeader className="bg-muted/30 border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Users className="size-5 text-primary" /> Postos em massa por gerente
        </CardTitle>
        <CardDescription>
          Cada card mostra a lista de postos definida para aquele gerente de área. Clique no card para abrir ou fechar.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {q.isLoading ? (
          <div className="flex flex-col items-center p-8 text-muted-foreground">
            <Loader2 className="mb-2 size-8 animate-spin" /> Carregando listas dos gerentes...
          </div>
        ) : gerentes.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhum gerente tem postos em massa ainda. Use o botão "Postos em massa para gerente" acima.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {gerentes.map((g) => {
              const aberto = !!abertos[g.nome];
              return (
                <div key={g.nome} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setAbertos((a) => ({ ...a, [g.nome]: !aberto }))}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{nomeAmigavel(g.nome)}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.postos.length} {g.postos.length === 1 ? "posto" : "postos"}
                      </p>
                    </div>
                    {aberto ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
                  </button>
                  <div className={cn("border-t border-border", !aberto && "hidden")}>
                    <ul className="max-h-64 divide-y divide-border overflow-auto">
                      {g.postos.map((p) => (
                        <li key={p.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate">{p.posto_nome}</p>
                            {p.posto_localidade && (
                              <p className="truncate text-xs text-muted-foreground">{p.posto_localidade}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
