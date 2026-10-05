import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronUp, Loader2, MapPin, Pencil, RefreshCw, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { atualizarCardsGerentesComNexti, listarPostosDeTodosGerentes, renomearPostoDoGerente } from "@/lib/areas-gerentes.functions";
import { sincronizarPostosNexti } from "@/lib/nexti-postos-mapa.functions";
import { nomeAmigavel } from "@/lib/areas-gerentes";
import { cn } from "@/lib/utils";
import { resumirPorCor, useVisitasPorNomePosto } from "@/lib/visitas-postos-nome";
import { BolinhaCor, SemaforoPosto } from "@/components/SemaforoPosto";

/**
 * Um card por gerente de área com os postos atribuídos em massa a ele
 * (a mesma lista definida em "Postos em massa para gerente").
 *
 * Cada posto mostra a bolinha de cor e a quantidade de visitas que ele tem
 * que fazer — a mesma regra e o mesmo número da página de visitas por posto.
 */
export function PostosPorGerenteCards() {
  const listar = useServerFn(listarPostosDeTodosGerentes);
  const q = useQuery({
    queryKey: ["postos-gerente", "todos"],
    queryFn: () => listar(),
    staleTime: 5 * 60_000,
  });
  const qc = useQueryClient();
  const sincronizarFn = useServerFn(sincronizarPostosNexti);
  const atualizarFn = useServerFn(atualizarCardsGerentesComNexti);
  const [atualizando, setAtualizando] = useState(false);

  async function atualizarComNexti() {
    setAtualizando(true);
    try {
      const s = await sincronizarFn();
      if (!s.ok) toast.warning("NEXTI não respondeu agora; usando os últimos dados baixados.");
      const r = await atualizarFn();
      if (!r.ok) throw new Error(r.erro);
      await qc.invalidateQueries({ queryKey: ["postos-gerente"] });
      toast.success(
        `Cards atualizados com a NEXTI: ${r.atualizados} postos atualizados` +
          (r.naoEncontrados ? ` · ${r.naoEncontrados} não encontrados` : ""),
      );
    } catch (e) {
      toast.error("Falha ao atualizar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAtualizando(false);
    }
  }
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  // As quantidades só são baixadas quando algum card de gerente está aberto.
  const { buscar, carregando } = useVisitasPorNomePosto(Object.values(abertos).some(Boolean));

  const gerentes = q.data?.ok ? q.data.gerentes : [];

  return (
    <Card data-sem-movimento className="shadow-lg border-border/50">
      <CardHeader className="bg-muted/30 border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Users className="size-5 text-primary" /> Postos em massa por gerente
        </CardTitle>
        <CardDescription>
          Cada card mostra a lista de postos definida para aquele gerente de área, com a bolinha de cor
          e a quantidade de visitas de cada posto. Clique no card para abrir ou fechar.
        </CardDescription>
        <div>
          <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={atualizarComNexti} disabled={atualizando}>
            {atualizando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Verificar e atualizar com a NEXTI
          </Button>
        </div>
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
              const resumo = resumirPorCor(
                g.postos.map((p) => p.posto_nome),
                buscar,
              );
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
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BolinhaCor cor="verde" /> {resumo.verde}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BolinhaCor cor="amarelo" /> {resumo.amarelo}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BolinhaCor cor="vermelho" /> {resumo.vermelho}
                        </span>
                      </div>
                    </div>
                    {aberto ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
                  </button>
                  <div className={cn("border-t border-border", !aberto && "hidden")}>
                    {carregando ? (
                      <p className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Carregando quantidades de visita...
                      </p>
                    ) : (
                      <ul className="max-h-64 divide-y divide-border overflow-auto">
                        {g.postos.map((p) => (
                          <li key={p.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{p.posto_nome}</p>
                              {p.posto_localidade && (
                                <p className="truncate text-xs text-muted-foreground">{p.posto_localidade}</p>
                              )}
                            </div>
                            <SemaforoPosto qtd={buscar(p.posto_nome)?.qtd} />
                          </li>
                        ))}
                      </ul>
                    )}
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
