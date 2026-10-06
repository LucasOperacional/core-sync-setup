import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, MapPin, Minus, Plus, RotateCcw, Search, TrafficCone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  listarPostosMapa,
  ocultarNoMapa,
  filtrarEmpresasPermitidas,
  type PostoMapa,
} from "@/lib/nexti-postos-mapa.functions";
import { cn } from "@/lib/utils";
import { AtribuirPostosGerenteDialog } from "@/components/AtribuirPostosGerenteDialog";
import { PostosPorGerenteCards } from "@/components/PostosPorGerenteCards";

export const Route = createFileRoute("/_authenticated/supervisao-visitas-postos")({
  head: () => ({
    meta: [
      { title: "Visitas por posto | Supervisão em Campo" },
      { name: "description", content: "Todos os postos com a quantidade de visitas, editável, em verde, amarelo e vermelho." },
      { property: "og:title", content: "Visitas por posto | Supervisão em Campo" },
      { property: "og:description", content: "Edite a quantidade de visitas de cada posto com semáforo de cores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisitasPostosPage,
});

type Semaforo = "verde" | "amarelo" | "vermelho";
// Regra pedida: 2 visitas = verde, 3 visitas = amarelo, 5 visitas = vermelho.
// Fica: até 2 = verde, 3 ou 4 = amarelo, 5 ou mais = vermelho.
const semaforoDe = (v: number): Semaforo => (v >= 5 ? "vermelho" : v >= 3 ? "amarelo" : "verde");
const CORES: Record<Semaforo, { dot: string; row: string; rotulo: string }> = {
  verde: { dot: "bg-green-500", row: "border-l-green-500 bg-green-500/5", rotulo: "Verde (até 2)" },
  amarelo: { dot: "bg-yellow-500", row: "border-l-yellow-500 bg-yellow-500/5", rotulo: "Amarelo (3 a 4)" },
  vermelho: { dot: "bg-red-500", row: "border-l-red-500 bg-red-500/5", rotulo: "Vermelho (5+)" },
};

// Tabela criada fora dos tipos gerados
const tabela = () => (supabase as any).from("postos_visitas_ajuste");

function VisitasPostosPage() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroCor, setFiltroCor] = useState<Semaforo | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const listar = useServerFn(listarPostosMapa);
  const postosQ = useQuery({ queryKey: ["visitas-por-posto"], queryFn: () => listar(), staleTime: 10 * 60_000, enabled: aberto });
  const ajustesQ = useQuery({
    queryKey: ["postos-visitas-ajuste"],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await tabela().select("posto_id, quantidade");
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.posto_id] = r.quantidade;
      return m;
    },
  });

  const postos = useMemo(() => {
    const aj = ajustesQ.data ?? {};
    // Mesmo filtro do mapa: quando a NEXTI não informa a empresa na maioria
    // dos postos, mostra todos em vez de deixar a lista quase vazia.
    return filtrarEmpresasPermitidas((postosQ.data ?? []) as PostoMapa[])
      // Igual ao mapa: só entram postos com coordenadas e que não são ocultados.
      .filter((p) => p.latitude !== null && p.longitude !== null && !ocultarNoMapa(p))
      .map((p) => {
        const auto = p.visitasRealizadas || 0;
        const editado = aj[String(p.id)];
        const total = editado ?? auto;
        return { ...p, auto, editado: editado !== undefined, total, cor: semaforoDe(total) };
      })
      // Ordem fixa por nome: o posto não "pula" de lugar ao editar a quantidade.
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [postosQ.data, ajustesQ.data]);

  const contagem = useMemo(() => {
    const c = { verde: 0, amarelo: 0, vermelho: 0 };
    for (const p of postos) c[p.cor]++;
    return c;
  }, [postos]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return postos.filter((p) => {
      if (filtroCor && p.cor !== filtroCor) return false;
      if (!t) return true;
      return [p.nome, p.cliente, p.cidade].some((x) => (x ?? "").toLowerCase().includes(t));
    });
  }, [postos, busca, filtroCor]);

  async function salvar(id: string, valor: number | null) {
    setSalvando(id);
    const { error } =
      valor === null
        ? await tabela().delete().eq("posto_id", id)
        : await tabela().upsert({ posto_id: id, quantidade: Math.max(0, valor), updated_at: new Date().toISOString() });
    setSalvando(null);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    setRascunho((r) => {
      const n = { ...r };
      delete n[id];
      return n;
    });
    await qc.invalidateQueries({ queryKey: ["postos-visitas-ajuste"] });
    toast.success(valor === null ? "Voltou para a contagem automática" : "Quantidade salva");
  }

  const carregando = aberto && (postosQ.isLoading || ajustesQ.isLoading);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Link to="/supervisao-campo" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar para Supervisão em Campo
      </Link>
      <Card data-sem-movimento className="shadow-lg border-border/50">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="block w-full text-left"
        >
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrafficCone className="size-5 text-primary" /> Quantidade de visitas por posto
              {aberto ? (
                <ChevronUp className="ms-auto size-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="ms-auto size-5 text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Edite a quantidade de visitas de cada posto. A cor muda sozinha: verde até 2, amarelo de 3 a 4, vermelho 5 ou mais. Clique para {aberto ? "fechar" : "abrir"}.
            </CardDescription>
          </CardHeader>
        </button>
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (e.target.value.trim()) setAberto(true);
              }}
              placeholder="Pesquisar posto pelo nome, cliente ou cidade..."
              className="pl-9"
              aria-label="Pesquisar posto"
            />
          </div>
          {busca && (
            <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => setBusca("")}>
              Limpar
            </Button>
          )}
        </div>
        {aberto && (
        <CardContent className="space-y-4 pt-4">
          {carregando ? (
            <div className="flex flex-col items-center p-10 text-muted-foreground">
              <Loader2 className="mb-2 size-8 animate-spin" /> Carregando postos...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(CORES) as Semaforo[]).map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setFiltroCor((a) => (a === cor ? null : cor))}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                      filtroCor === cor ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("size-2.5 rounded-full", CORES[cor].dot)} />
                    {CORES[cor].rotulo}: {contagem[cor]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{visiveis.length} de {postos.length} postos exibidos.</p>
                <AtribuirPostosGerenteDialog postos={postos} />
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {visiveis.map((p) => {
                  const id = String(p.id);
                  const valorCampo = rascunho[id] ?? String(p.total);
                  const alterado = rascunho[id] !== undefined && Number(rascunho[id]) !== p.total;
                  return (
                    <div key={id} className={cn("flex flex-wrap items-center gap-3 border-l-4 px-4 py-2.5", CORES[p.cor].row)}>
                      <span className={cn("size-3 shrink-0 rounded-full", CORES[p.cor].dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" /> {p.nome}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.cliente, p.cidade, p.uf].filter(Boolean).join(" · ") || "—"}
                          {p.editado && ` · editado (automático: ${p.auto})`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="size-8" disabled={salvando === id || p.total <= 0} onClick={() => salvar(id, p.total - 1)} aria-label="Diminuir">
                          <Minus className="size-4" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          value={valorCampo}
                          onChange={(e) => setRascunho((r) => ({ ...r, [id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && alterado && salvar(id, Number(valorCampo) || 0)}
                          className="h-8 w-16 text-center"
                        />
                        <Button size="icon" variant="outline" className="size-8" disabled={salvando === id} onClick={() => salvar(id, p.total + 1)} aria-label="Aumentar">
                          <Plus className="size-4" />
                        </Button>
                        {alterado && (
                          <Button size="sm" className="h-8" disabled={salvando === id} onClick={() => salvar(id, Number(valorCampo) || 0)}>
                            Salvar
                          </Button>
                        )}
                        {p.editado && (
                          <Button size="icon" variant="ghost" className="size-8" title="Voltar à contagem automática" disabled={salvando === id} onClick={() => salvar(id, null)}>
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
        )}
      </Card>
      <PostosPorGerenteCards />
    </div>
  );
}
