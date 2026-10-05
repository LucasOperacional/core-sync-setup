import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AREAS_GERENTES, nomeAmigavel } from "@/lib/areas-gerentes";
import { definirPostosDoGerente, verificarNomesPostosNexti, type PostoNextiAchado } from "@/lib/areas-gerentes.functions";
import { BolinhaCor } from "@/components/SemaforoPosto";
import type { Semaforo } from "@/lib/visitas-semaforo";

type PostoRef = {
  nome: string;
  cliente?: string | null;
  cidade?: string | null;
  uf?: string | null;
  /** Quantidade de visitas e cor, quando o posto veio da tela de visitas por posto. */
  total?: number;
  cor?: Semaforo;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function AtribuirPostosGerenteDialog({ postos }: { postos: PostoRef[] }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(definirPostosDoGerente);
  const [aberto, setAberto] = useState(false);
  const [gerente, setGerente] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const verificarFn = useServerFn(verificarNomesPostosNexti);
  const [nexti, setNexti] = useState<Map<string, PostoNextiAchado>>(new Map());
  const [verificando, setVerificando] = useState(false);

  const indice = useMemo(() => {
    const m = new Map<string, PostoRef>();
    for (const p of postos) m.set(norm(p.nome), p);
    return m;
  }, [postos]);

  const linhas = useMemo(() => {
    const vistos = new Set<string>();
    return texto
      .split(/\r?\n|;/)
      .map((l) => l.trim())
      .filter((l) => {
        const k = norm(l);
        if (!k || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .map((l) => {
        const achado = indice.get(norm(l));
        return { digitado: l, achado, nx: nexti.get(l) };
      });
  }, [texto, indice, nexti]);

  // Verifica na NEXTI cada nome digitado (com pequena espera enquanto digita).
  useEffect(() => {
    const nomes = linhas.map((l) => l.digitado);
    if (!nomes.length) { setNexti(new Map()); return; }
    const t = setTimeout(async () => {
      setVerificando(true);
      try {
        const r = await verificarFn({ data: { nomes } });
        if (r.ok) setNexti(new Map(r.achados.map((a) => [a.digitado, a])));
      } finally {
        setVerificando(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const foraNexti = linhas.filter((l) => !l.nx);

  const naoEncontrados = linhas.filter((l) => !l.achado);

  // Resumo por cor dos postos reconhecidos: mesma regra da tela de visitas.
  const resumo = useMemo(() => {
    const c = { verde: 0, amarelo: 0, vermelho: 0, sem: 0 };
    for (const l of linhas) {
      if (!l.achado?.cor) c.sem++;
      else c[l.achado.cor]++;
    }
    return c;
  }, [linhas]);

  async function salvar() {
    if (!gerente) {
      toast.error("Escolha o gerente de área.");
      return;
    }
    if (!linhas.length) {
      toast.error("Cole pelo menos um nome de posto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await salvarFn({
        data: {
          gerenteNome: gerente,
          postos: linhas.map((l) => ({
            nome: l.nx?.nome ?? l.achado?.nome ?? l.digitado,
            localidade: l.nx ? l.nx.localidade : l.achado
              ? [[l.achado.cidade, l.achado.uf].filter(Boolean).join(" / ") || null, l.achado.cliente]
                  .filter(Boolean)
                  .join(" · ") || null
              : null,
          })),
        },
      });
      if (!r.ok) throw new Error(r.erro);
      await qc.invalidateQueries({ queryKey: ["postos-gerente"] });
      toast.success(`${r.total} postos definidos para ${nomeAmigavel(gerente)}`);
      setTexto("");
      setAberto(false);
    } catch (e) {
      toast.error("Não foi possível salvar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setAberto(true)}>
      <ListPlus className="size-4" /> Postos em massa para gerente
    </Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Definir postos do gerente de área</DialogTitle>
          <DialogDescription>
            Cole os nomes dos postos (um por linha). O gerente vai ver somente essa lista — a lista anterior dele é substituída.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <select
            value={gerente}
            onChange={(e) => setGerente(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Escolha o gerente de área...</option>
            {AREAS_GERENTES.map((g) => (
              <option key={g} value={g}>
                {nomeAmigavel(g)}
              </option>
            ))}
          </select>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"POSTO A\nPOSTO B\nPOSTO C"}
            rows={10}
          />
          <p className="text-xs text-muted-foreground">
            {linhas.length} postos na lista
            {naoEncontrados.length > 0 && ` · ${naoEncontrados.length} não encontrados no mapa (serão salvos como digitados)`}
          </p>
          {linhas.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {verificando ? (
                <><Loader2 className="size-3 animate-spin" /> Verificando nomes na NEXTI...</>
              ) : (
                <>NEXTI: {linhas.length - foraNexti.length} reconhecidos · {foraNexti.length} não encontrados</>
              )}
            </p>
          )}
          {!verificando && linhas.some((l) => l.nx) && (
            <div className="max-h-32 overflow-auto rounded border border-border p-2 text-xs">
              {linhas.filter((l) => l.nx).map((l) => (
                <div key={l.digitado} className="py-0.5">
                  <span className="font-medium">{l.nx!.nome}</span>
                  {l.nx!.localidade && <span className="text-muted-foreground"> · {l.nx!.localidade}</span>}
                  {l.nx!.ativo === false && <span className="text-destructive"> · encerrado</span>}
                </div>
              ))}
            </div>
          )}
          {linhas.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <BolinhaCor cor="verde" /> {resumo.verde}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BolinhaCor cor="amarelo" /> {resumo.amarelo}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BolinhaCor cor="vermelho" /> {resumo.vermelho}
              </span>
              {resumo.sem > 0 && <span className="inline-flex items-center gap-1.5">sem visita: {resumo.sem}</span>}
            </div>
          )}
          {naoEncontrados.length > 0 && (
            <div className="max-h-24 overflow-auto rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {naoEncontrados.map((l) => (
                <div key={l.digitado}>{l.digitado}</div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={salvando || !gerente || !linhas.length}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar lista
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
