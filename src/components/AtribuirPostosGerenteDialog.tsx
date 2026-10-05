import { useMemo, useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { AREAS_GERENTES, nomeAmigavel } from "@/lib/areas-gerentes";
import { definirPostosDoGerente } from "@/lib/areas-gerentes.functions";

type PostoRef = { nome: string; cliente?: string | null; cidade?: string | null; uf?: string | null };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function AtribuirPostosGerenteDialog({ postos }: { postos: PostoRef[] }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(definirPostosDoGerente);
  const [aberto, setAberto] = useState(false);
  const [gerente, setGerente] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

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
        return { digitado: l, achado };
      });
  }, [texto, indice]);

  const naoEncontrados = linhas.filter((l) => !l.achado);

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
            nome: l.achado?.nome ?? l.digitado,
            localidade: l.achado
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
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListPlus className="size-4" /> Postos em massa para gerente
        </Button>
      </DialogTrigger>
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
  );
}
