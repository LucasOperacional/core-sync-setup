import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FUNCOES_ROTEIRO,
  PERGUNTAS,
  type FuncaoRoteiro,
  type PerguntaRoteiro,
} from "@/lib/roteiro-campo-perguntas";
import {
  obterPerguntasChecklist,
  podeEditarChecklist,
  restaurarPerguntasChecklist,
  salvarPerguntasChecklist,
} from "@/lib/checklist-perguntas.functions";
import { cn } from "@/lib/utils";

type FiltroFuncao = "TODAS" | FuncaoRoteiro;

function agruparPorBloco(perguntas: PerguntaRoteiro[]) {
  const grupos: { funcao: string; bloco: string; itens: PerguntaRoteiro[] }[] = [];
  for (const p of perguntas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.funcao === p.funcao && ultimo.bloco === p.bloco) {
      ultimo.itens.push(p);
    } else {
      grupos.push({ funcao: p.funcao, bloco: p.bloco, itens: [p] });
    }
  }
  return grupos;
}

export function ChecklistAutomaticoCard() {
  const [filtro, setFiltro] = useState<FiltroFuncao | null>(null);
  const [perguntasBase, setPerguntasBase] = useState<PerguntaRoteiro[]>(PERGUNTAS);
  const [rascunho, setRascunho] = useState<PerguntaRoteiro[]>(PERGUNTAS);
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useServerFn(obterPerguntasChecklist);
  const salvar = useServerFn(salvarPerguntasChecklist);
  const restaurar = useServerFn(restaurarPerguntasChecklist);
  const verificarEdicao = useServerFn(podeEditarChecklist);
  const [podeEditar, setPodeEditar] = useState(false);

  useEffect(() => {
    let ativo = true;
    verificarEdicao({})
      .then((r) => ativo && setPodeEditar(r?.pode === true))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [verificarEdicao]);

  useEffect(() => {
    let ativo = true;
    carregar({})
      .then((r) => {
        if (!ativo || !r?.perguntas) return;
        setPerguntasBase(r.perguntas);
        setRascunho(r.perguntas);
      })
      .catch(() => {})
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [carregar]);

  const perguntas = useMemo(() => {
    if (!filtro) return [];
    if (filtro === "TODAS") return perguntasBase;
    return perguntasBase.filter((p) => p.funcao === filtro);
  }, [filtro, perguntasBase]);

  const grupos = useMemo(() => agruparPorBloco(perguntas), [perguntas]);

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

  function remover(index: number) {
    setRascunho((atual) => atual.filter((_, i) => i !== index));
  }

  function adicionar() {
    const funcao: FuncaoRoteiro = filtro && filtro !== "TODAS" ? filtro : FUNCOES_ROTEIRO[0]!;
    setRascunho((atual) => [
      ...atual,
      {
        id: `nova-${Date.now()}-${atual.length + 1}`,
        funcao,
        bloco: "Geral",
        texto: "",
        critica: false,
      },
    ]);
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
      setPerguntasBase(limpo);
      setRascunho(limpo);
      setEditando(false);
      toast.success("Checklist atualizado.");
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
      setPerguntasBase(PERGUNTAS);
      setRascunho(PERGUNTAS);
      toast.success("Checklist padrão restaurado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível restaurar o checklist.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-5 text-primary" />
          Checklist automático
        </CardTitle>
        <CardDescription>
          Monte o checklist de supervisão de campo, veja as perguntas separadas por função e tópico
          e edite-as por completo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={filtro === "TODAS" ? "default" : "outline"}
            onClick={() => setFiltro("TODAS")}
          >
            <ClipboardCheck className="size-4" />
            Todas as funções
          </Button>
          {FUNCOES_ROTEIRO.map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filtro === f ? "default" : "outline"}
              onClick={() => setFiltro(f)}
            >
              {f}
            </Button>
          ))}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {!podeEditar ? null : !editando ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={carregando}
                onClick={() => {
                  setRascunho(perguntasBase);
                  setEditando(true);
                }}
              >
                <Pencil className="size-4" />
                Editar perguntas
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" onClick={gravar} disabled={salvando}>
                  {salvando ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Salvar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRascunho(perguntasBase);
                    setEditando(false);
                  }}
                  disabled={salvando}
                >
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
              </>
            )}
          </div>
        </div>

        {carregando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando perguntas...
          </p>
        )}

        {editando && podeEditar && !carregando && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Edite o texto, a função, o tópico e a criticidade de cada pergunta. Você também pode
              reordenar, excluir ou incluir novas perguntas.
            </p>
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
                    <Button type="button" size="icon" variant="ghost" onClick={() => remover(i)}>
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
                    <Input
                      value={p.bloco}
                      onChange={(e) => atualizar(i, { bloco: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={!!p.critica}
                      onCheckedChange={(v) => atualizar(i, { critica: v })}
                    />
                    <Label className="text-xs">Item crítico</Label>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={adicionar}>
              <Plus className="size-4" />
              Nova pergunta
            </Button>
          </div>
        )}

        {!editando && !carregando && !filtro && (
          <p className="text-sm text-muted-foreground">
            Escolha uma função acima para montar o checklist automaticamente.
          </p>
        )}

        {!editando && !carregando && filtro && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Checklist montado:{" "}
                <span className="font-semibold text-foreground">
                  {filtro === "TODAS" ? "Todas as funções" : filtro}
                </span>{" "}
                — {perguntas.length} perguntas.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" />
                Imprimir
              </Button>
            </div>

            {filtro === "TODAS"
              ? FUNCOES_ROTEIRO.map((funcao) => (
                  <section key={funcao} className="space-y-3">
                    <h3 className="border-l-4 border-primary pl-3 text-base font-bold uppercase tracking-wide">
                      {funcao}
                    </h3>
                    {agruparPorBloco(perguntasBase.filter((p) => p.funcao === funcao)).map((g) => (
                      <BlocoChecklist
                        key={`${g.funcao}-${g.bloco}`}
                        bloco={g.bloco}
                        itens={g.itens}
                      />
                    ))}
                  </section>
                ))
              : grupos.map((g) => (
                  <BlocoChecklist key={`${g.funcao}-${g.bloco}`} bloco={g.bloco} itens={g.itens} />
                ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoChecklist({ bloco, itens }: { bloco: string; itens: PerguntaRoteiro[] }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-muted/50 px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {bloco}
        </span>
      </div>
      <ol className="divide-y divide-border">
        {itens.map((p, i) => (
          <li key={p.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                p.critica ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
              )}
            >
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-sm leading-relaxed">{p.texto}</p>
            </div>
            {p.critica && (
              <Badge variant="destructive" className="shrink-0">
                Crítico
              </Badge>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
