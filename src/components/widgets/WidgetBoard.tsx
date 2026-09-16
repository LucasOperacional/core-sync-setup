import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, GripVertical, LayoutGrid, Maximize2, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import {
  carregarLayout,
  classeTamanho,
  limparLayout,
  mesclarLayout,
  proximoTamanho,
  salvarLayout,
  type DashboardKey,
  type WidgetEstado,
  type WidgetTamanho,
} from "@/lib/dashboard-widgets";

export type WidgetDef = {
  /** Identificador estável do bloco (usado para salvar a preferência). */
  key: string;
  /** Nome mostrado ao usuário no modo de personalização. */
  titulo: string;
  /** Tamanho inicial do bloco. */
  tamanho?: WidgetTamanho;
  conteudo: ReactNode;
};

type Props = {
  dashboard: DashboardKey;
  widgets: WidgetDef[];
};

const ROTULO_TAMANHO: Record<WidgetTamanho, string> = {
  pequeno: "P",
  medio: "M",
  grande: "G",
};

export function WidgetBoard({ dashboard, widgets }: Props) {
  const padrao = useMemo(
    () => widgets.map((w) => ({ key: w.key, tamanho: w.tamanho ?? "medio" })),
    [widgets],
  );
  const padraoRef = useRef(padrao);
  padraoRef.current = padrao;

  const [estados, setEstados] = useState<WidgetEstado[]>(() => mesclarLayout(padrao, []));
  const [editando, setEditando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const carregou = useRef(false);

  useEffect(() => {
    let ativo = true;
    void carregarLayout(dashboard).then((salvo) => {
      if (!ativo) return;
      carregou.current = true;
      setEstados(mesclarLayout(padraoRef.current, salvo));
    });
    return () => {
      ativo = false;
    };
  }, [dashboard]);

  // Quando novos blocos aparecem (dados carregados), mescla mantendo a preferência.
  useEffect(() => {
    setEstados((atual) => mesclarLayout(padrao, atual));
  }, [padrao]);

  const persistir = useCallback(
    (novos: WidgetEstado[]) => {
      setEstados(novos);
      void salvarLayout(dashboard, novos);
    },
    [dashboard],
  );

  const alternarVisivel = (key: string) =>
    persistir(estados.map((e) => (e.key === key ? { ...e, visivel: !e.visivel } : e)));

  const mudarTamanho = (key: string) =>
    persistir(
      estados.map((e) => (e.key === key ? { ...e, tamanho: proximoTamanho(e.tamanho) } : e)),
    );

  const mover = (origem: string, destino: string) => {
    if (origem === destino) return;
    const lista = estados.slice();
    const i = lista.findIndex((e) => e.key === origem);
    const j = lista.findIndex((e) => e.key === destino);
    if (i < 0 || j < 0) return;
    const [item] = lista.splice(i, 1);
    lista.splice(j, 0, item!);
    persistir(lista);
  };

  async function restaurar() {
    await limparLayout(dashboard);
    setEstados(mesclarLayout(padraoRef.current, []));
    toast.success("Painel restaurado para o formato original.");
  }

  const mapa = new Map(widgets.map((w) => [w.key, w]));
  const ocultos = estados.filter((e) => !e.visivel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (editando) toast.success("Personalização salva na sua conta.");
            setEditando((v) => !v);
          }}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            editando
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-secondary text-foreground hover:bg-muted"
          }`}
        >
          {editando ? <Check className="size-4" /> : <LayoutGrid className="size-4" />}
          {editando ? "Concluir personalização" : "Personalizar painel"}
        </button>

        {editando ? (
          <button
            type="button"
            onClick={() => void restaurar()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw className="size-4" /> Restaurar padrão
          </button>
        ) : null}
      </div>

      {editando ? (
        <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          Arraste os blocos pela alça para mudar a ordem, use <strong>P/M/G</strong> para mudar o
          tamanho e o olho para mostrar ou esconder. Tudo é salvo automaticamente na sua conta.
        </p>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        {estados.map((estado) => {
          const def = mapa.get(estado.key);
          if (!def) return null;
          if (!estado.visivel && !editando) return null;

          return (
            <div
              key={estado.key}
              className={`${classeTamanho(estado.tamanho)} min-w-0 ${
                arrastando === estado.key ? "opacity-50" : ""
              }`}
              onDragOver={(e) => {
                if (editando && arrastando) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!editando || !arrastando) return;
                e.preventDefault();
                mover(arrastando, estado.key);
                setArrastando(null);
              }}
            >
              {editando ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-2 py-1.5">
                  <span
                    draggable
                    onDragStart={() => setArrastando(estado.key)}
                    onDragEnd={() => setArrastando(null)}
                    className="cursor-grab text-muted-foreground active:cursor-grabbing"
                    aria-label={`Arrastar ${def.titulo}`}
                  >
                    <GripVertical className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {def.titulo}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarTamanho(estado.key)}
                    title="Mudar o tamanho do bloco"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-bold"
                  >
                    <Maximize2 className="size-3" />
                    {ROTULO_TAMANHO[estado.tamanho]}
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarVisivel(estado.key)}
                    title={estado.visivel ? "Esconder bloco" : "Mostrar bloco"}
                    className="rounded-md border border-border bg-background p-1"
                  >
                    {estado.visivel ? (
                      <Eye className="size-3.5" />
                    ) : (
                      <EyeOff className="size-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ) : null}

              <div className={estado.visivel ? "" : "pointer-events-none opacity-40"}>
                {def.conteudo}
              </div>
            </div>
          );
        })}
      </div>

      {!editando && ocultos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {ocultos.length} bloco(s) escondido(s). Use “Personalizar painel” para trazê-los de volta.
        </p>
      ) : null}
    </div>
  );
}
