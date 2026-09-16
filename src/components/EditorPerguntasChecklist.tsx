import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  FUNCOES_ROTEIRO,
  PERGUNTAS,
  type FuncaoRoteiro,
  type PerguntaRoteiro,
} from "@/lib/roteiro-campo-perguntas";
import {
  restaurarPerguntasChecklist,
  salvarPerguntasChecklist,
} from "@/lib/checklist-perguntas.functions";

type Props = {
  perguntas: PerguntaRoteiro[];
  funcaoPadrao?: FuncaoRoteiro;
  onSalvo: (perguntas: PerguntaRoteiro[]) => void;
  onCancelar: () => void;
};

export function EditorPerguntasChecklist({ perguntas, funcaoPadrao, onSalvo, onCancelar }: Props) {
  const [rascunho, setRascunho] = useState<PerguntaRoteiro[]>(perguntas);
  const [salvando, setSalvando] = useState(false);
  const salvar = useServerFn(salvarPerguntasChecklist);
  const restaurar = useServerFn(restaurarPerguntasChecklist);

  function atualizar(index: number, campos: Partial<PerguntaRoteiro>) {
    setRascunho((atual) => atual.map((p, i) => (i === index ? { ...p, ...campos } : p)));
  }

  function mover(index: number, delta: number) {
    setRascunho((atual) => {
      const destino = index + delta;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      const [item] = copia.splice(index, 1);
      copia.splice(destino, 0, item!);
      return copia;
    });
  }

  async function gravar() {
    const limpo = rascunho
      .map((p) => ({ ...p, texto: p.texto.trim(), bloco: p.bloco.trim() || "Geral" }))
      .filter((p) => p.texto.length > 0);
    if (limpo.length === 0) {
      toast.error("Escreva ao menos uma pergunta antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      await salvar({ data: { perguntas: limpo } });
      toast.success("Checklist atualizado.");
      onSalvo(limpo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o checklist.");
    } finally {
      setSalvando(false);
    }
  }

  async function voltarAoPadrao() {
    setSalvando(true);
    try {
      await restaurar({});
      setRascunho(PERGUNTAS);
      toast.success("Checklist padrão restaurado.");
      onSalvo(PERGUNTAS);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível restaurar o checklist.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={gravar} disabled={salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar perguntas
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={salvando}>
          <X className="size-4" />
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={voltarAoPadrao}
          disabled={salvando}
        >
          <RotateCcw className="size-4" />
          Padrão
        </Button>
      </div>

      {rascunho.map((p, i) => (
        <div key={p.id} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-xs font-bold text-muted-foreground">{i + 1}</span>
            <Textarea
              value={p.texto}
              onChange={(e) => atualizar(i, { texto: e.target.value })}
              placeholder="Escreva a pergunta"
              rows={2}
              className="flex-1"
            />
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => mover(i, 1)}
                disabled={i === rascunho.length - 1}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setRascunho((atual) => atual.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <select
                value={p.funcao}
                onChange={(e) => atualizar(i, { funcao: e.target.value as FuncaoRoteiro })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {FUNCOES_ROTEIRO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tópico</Label>
              <Input value={p.bloco} onChange={(e) => atualizar(i, { bloco: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={!!p.critica} onCheckedChange={(v) => atualizar(i, { critica: v })} />
              <Label className="text-xs">Item crítico</Label>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          setRascunho((atual) => [
            ...atual,
            {
              id: `nova-${Date.now()}-${atual.length + 1}`,
              funcao: funcaoPadrao ?? FUNCOES_ROTEIRO[0]!,
              bloco: "Geral",
              texto: "",
              critica: false,
            },
          ])
        }
      >
        <Plus className="size-4" />
        Nova pergunta
      </Button>
    </div>
  );
}
