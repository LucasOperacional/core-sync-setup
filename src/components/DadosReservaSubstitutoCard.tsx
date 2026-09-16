import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeDollarSign,
  CalendarClock,
  Loader2,
  Search,
  UserPlus,
  Utensils,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  pesquisarNomeColaboradorNexti,
  type NomeColaboradorNexti,
} from "@/lib/nexti-ativos.functions";

export type SimNao = "" | "sim" | "nao";

type DadosReservaSubstitutoCardProps = {
  /** Colaborador substituto selecionado. */
  substituto: NomeColaboradorNexti | null;
  onSubstitutoChange: (colaborador: NomeColaboradorNexti | null) => void;
  /** Recebeu vale-transporte. */
  recebeuVt: SimNao;
  onRecebeuVtChange: (valor: SimNao) => void;
  /** Recebeu refeição. */
  recebeuRefeicao: SimNao;
  onRecebeuRefeicaoChange: (valor: SimNao) => void;
  /** Valor a receber (texto livre, em reais). */
  valorReceber: string;
  onValorReceberChange: (valor: string) => void;
  /** Data do recebimento (yyyy-mm-dd). */
  recebidoEm: string;
  onRecebidoEmChange: (valor: string) => void;
};

/**
 * Card "DADOS DA RESERVA / SUBSTITUTO" do formulário de Controle de Reserva Técnica.
 * Pesquisa o substituto direto na NEXTI e registra vale-transporte, refeição,
 * valor a receber e data de recebimento.
 */
export function DadosReservaSubstitutoCard({
  substituto,
  onSubstitutoChange,
  recebeuVt,
  onRecebeuVtChange,
  recebeuRefeicao,
  onRecebeuRefeicaoChange,
  valorReceber,
  onValorReceberChange,
  recebidoEm,
  onRecebidoEmChange,
}: DadosReservaSubstitutoCardProps) {
  const pesquisar = useServerFn(pesquisarNomeColaboradorNexti);

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<NomeColaboradorNexti[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedidoRef = useRef(0);

  const executar = useCallback(
    async (texto: string, forcarSincronizar = false) => {
      const alvo = texto.trim();
      const pedido = pedidoRef.current + 1;
      pedidoRef.current = pedido;
      setCarregando(true);
      try {
        const resultado = await pesquisar({ data: { termo: alvo, forcarSincronizar } });
        if (pedidoRef.current !== pedido) return;
        if (!resultado.ok) {
          setErro(resultado.erro ?? "Não foi possível consultar a NEXTI.");
          setResultados([]);
          setTotal(0);
        } else {
          setErro(null);
          setResultados(resultado.colaboradores);
          setTotal(resultado.total);
        }
      } catch (e) {
        if (pedidoRef.current !== pedido) return;
        setErro(e instanceof Error ? e.message : "Falha na consulta.");
      } finally {
        if (pedidoRef.current === pedido) setCarregando(false);
      }
    },
    [pesquisar],
  );

  useEffect(() => {
    void executar("", true);
  }, [executar]);

  useEffect(() => {
    const t = setTimeout(() => void executar(termo), 450);
    return () => clearTimeout(t);
  }, [termo, executar]);

  const opcoes: { valor: SimNao; rotulo: string }[] = [
    { valor: "sim", rotulo: "Sim" },
    { valor: "nao", rotulo: "Não" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-5" />
          </span>
          <div className="flex-1">
            <CardTitle className="text-base">DADOS DA RESERVA / SUBSTITUTO</CardTitle>
            <CardDescription className="text-xs">
              Informe quem cobriu o posto e os valores pagos pela reserva técnica.
            </CardDescription>
          </div>
          {substituto ? (
            <button
              type="button"
              onClick={() => onSubstitutoChange(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" /> Limpar
            </button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {substituto ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Colaborador substituto
            </span>
            <span className="mt-1 block text-base font-medium text-foreground">
              {substituto.colaborador}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <Label
              htmlFor="busca-substituto"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Nome completo do colaborador (substituto)
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="busca-substituto"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Pesquisar substituto na NEXTI"
                className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {carregando ? (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {erro ? <p className="text-xs text-destructive">{erro}</p> : null}

            {resultados.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded-lg border border-border">
                {resultados.map((item) => (
                  <button
                    key={String(item.personId ?? item.colaborador)}
                    type="button"
                    onClick={() => {
                      onSubstitutoChange(item);
                      setTermo("");
                    }}
                    className="block w-full border-b border-border/60 px-3 py-2 text-left text-sm text-foreground last:border-b-0 hover:bg-secondary"
                  >
                    {item.colaborador}
                  </button>
                ))}
              </div>
            ) : null}

            {total > resultados.length ? (
              <p className="text-[11px] text-muted-foreground">
                Mostrando {resultados.length} de {total} colaboradores. Refine a busca.
              </p>
            ) : null}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BadgeDollarSign className="size-3.5" /> Recebeu V.T
            </span>
            <div className="flex gap-2">
              {opcoes.map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => onRecebeuVtChange(recebeuVt === op.valor ? "" : op.valor)}
                  className={
                    recebeuVt === op.valor
                      ? "rounded-lg border border-primary bg-primary/15 px-4 py-2 text-sm font-semibold text-primary"
                      : "rounded-lg border border-input bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
                  }
                >
                  {op.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Utensils className="size-3.5" /> Recebeu refeição
            </span>
            <div className="flex gap-2">
              {opcoes.map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() =>
                    onRecebeuRefeicaoChange(recebeuRefeicao === op.valor ? "" : op.valor)
                  }
                  className={
                    recebeuRefeicao === op.valor
                      ? "rounded-lg border border-primary bg-primary/15 px-4 py-2 text-sm font-semibold text-primary"
                      : "rounded-lg border border-input bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
                  }
                >
                  {op.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="valor-receber"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Valor a receber (R$)
            </Label>
            <input
              id="valor-receber"
              inputMode="decimal"
              value={valorReceber}
              onChange={(e) => onValorReceberChange(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="recebido-em"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <CalendarClock className="size-3.5" /> Recebido em
            </Label>
            <input
              id="recebido-em"
              type="date"
              value={recebidoEm}
              onChange={(e) => onRecebidoEmChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
