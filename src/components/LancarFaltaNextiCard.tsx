import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX2, Loader2, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  pesquisarNomeColaboradorNexti,
  type NomeColaboradorNexti,
} from "@/lib/nexti-ativos.functions";
import {
  lancarFaltaNexti,
  listarLogsFaltaNexti,
  listarSituacoesFaltaNexti,
  validarFaltaNexti,
  type LogFaltaNexti,
  type SituacaoFaltaNexti,
  type ValidacaoFalta,
} from "@/lib/faltas-nexti.functions";


const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * Card do painel do supervisor para lançar uma falta diretamente na NEXTI.
 * Pesquisa o colaborador na API, escolhe o tipo de ausência e envia o período.
 */
export function LancarFaltaNextiCard() {
  const pesquisar = useServerFn(pesquisarNomeColaboradorNexti);
  const listarSituacoes = useServerFn(listarSituacoesFaltaNexti);
  const lancar = useServerFn(lancarFaltaNexti);
  const validar = useServerFn(validarFaltaNexti);
  const listarLogs = useServerFn(listarLogsFaltaNexti);

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<NomeColaboradorNexti[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<NomeColaboradorNexti | null>(null);
  const pedidoRef = useRef(0);

  const [situacoes, setSituacoes] = useState<SituacaoFaltaNexti[]>([]);
  const [situacaoId, setSituacaoId] = useState("");
  const [erroSituacoes, setErroSituacoes] = useState<string | null>(null);

  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [validacoes, setValidacoes] = useState<ValidacaoFalta[]>([]);
  const [validando, setValidando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [podeForcar, setPodeForcar] = useState(false);
  const [forcar, setForcar] = useState(false);
  const [logs, setLogs] = useState<LogFaltaNexti[]>([]);
  const [mostrarLogs, setMostrarLogs] = useState(false);

  const carregarLogs = useCallback(async () => {
    try {
      const resultado = await listarLogs();
      if (resultado.ok) setLogs(resultado.logs);
    } catch {
      // acompanhamento é opcional
    }
  }, [listarLogs]);

  useEffect(() => {
    void carregarLogs();
  }, [carregarLogs]);

  // Valida o período assim que colaborador e datas estiverem definidos.
  useEffect(() => {
    if (!selecionado || !inicio) {
      setValidacoes([]);
      setBloqueado(false);
      setPodeForcar(false);
      return;
    }
    let ativo = true;
    setValidando(true);
    setForcar(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resultado = await validar({
            data: { personId: selecionado.personId, inicio, fim: fim || inicio },
          });
          if (!ativo) return;
          setValidacoes(resultado.validacoes);
          setBloqueado(resultado.bloqueado);
          setPodeForcar(resultado.podeForcar);
        } catch {
          if (ativo) setValidacoes([]);
        } finally {
          if (ativo) setValidando(false);
        }
      })();
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [selecionado, inicio, fim, validar]);


  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resultado = await listarSituacoes();
        if (!ativo) return;
        if (!resultado.ok) {
          setErroSituacoes(resultado.erro ?? "Não foi possível carregar os tipos de falta.");
          return;
        }
        setSituacoes(resultado.situacoes);
        setErroSituacoes(null);
        const falta = resultado.situacoes.find((s) =>
          s.nome
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .includes("FALTA"),
        );
        if (falta) setSituacaoId(String(falta.id));
      } catch (e) {
        if (ativo) {
          setErroSituacoes(e instanceof Error ? e.message : "Falha ao consultar a NEXTI.");
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [listarSituacoes]);

  const executarBusca = useCallback(
    async (texto: string) => {
      const alvo = texto.trim();
      if (alvo.length < 2) {
        setResultados([]);
        setErroBusca(null);
        return;
      }
      const pedido = pedidoRef.current + 1;
      pedidoRef.current = pedido;
      setBuscando(true);
      try {
        const resultado = await pesquisar({ data: { termo: alvo } });
        if (pedidoRef.current !== pedido) return;
        if (!resultado.ok) {
          setErroBusca(resultado.erro ?? "Não foi possível consultar a NEXTI.");
          setResultados([]);
        } else {
          setErroBusca(null);
          setResultados(resultado.colaboradores.slice(0, 20));
        }
      } catch (e) {
        if (pedidoRef.current === pedido) {
          setErroBusca(e instanceof Error ? e.message : "Falha na consulta.");
        }
      } finally {
        if (pedidoRef.current === pedido) setBuscando(false);
      }
    },
    [pesquisar],
  );

  useEffect(() => {
    if (selecionado) return;
    const id = setTimeout(() => void executarBusca(termo), 450);
    return () => clearTimeout(id);
  }, [termo, selecionado, executarBusca]);

  async function enviar() {
    if (!selecionado) {
      toast.error("Selecione o colaborador na NEXTI.");
      return;
    }
    if (!situacaoId) {
      toast.error("Escolha o tipo de falta.");
      return;
    }
    if (!inicio) {
      toast.error("Informe a data da falta.");
      return;
    }
    const dataFim = fim || inicio;
    if (inicio > dataFim) {
      toast.error("A data final deve ser posterior à inicial.");
      return;
    }
    const situacao = situacoes.find((s) => String(s.id) === situacaoId);
    if (bloqueado && !(podeForcar && forcar)) {
      toast.error(
        validacoes.find((v) => v.status === "bloqueio")?.detalhe ??
          "O lançamento está bloqueado pelas validações.",
      );
      return;
    }

    setEnviando(true);
    try {
      const resultado = await lancar({
        data: {
          personId: selecionado.personId,
          personExternalId: selecionado.personExternalId,
          colaborador: selecionado.colaborador,
          situacaoId: Number(situacaoId),
          situacaoExternalId: situacao?.externalId ?? "",
          situacaoNome: situacao?.nome ?? "",
          inicio,
          fim: dataFim,
          observacao,
          forcar,
        },
      });
      if (resultado.validacoes) setValidacoes(resultado.validacoes);
      if (!resultado.ok) {
        setBloqueado(resultado.bloqueado === true);
        setPodeForcar(resultado.podeForcar === true);
        toast.error(resultado.erro ?? "Não foi possível lançar a falta na NEXTI.");
        void carregarLogs();
        return;
      }
      toast.success(`Falta lançada na NEXTI para ${selecionado.colaborador}.`);
      setSelecionado(null);
      setTermo("");
      setResultados([]);
      setObservacao("");
      setInicio(hojeISO());
      setFim(hojeISO());
      setForcar(false);
      setValidacoes([]);
      void carregarLogs();

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar para a NEXTI.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base uppercase">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <CalendarX2 className="size-4" />
          </span>
          Lançar falta na NEXTI
        </CardTitle>
        <CardDescription>
          Registre a ausência do colaborador direto no cadastro da NEXTI, sem sair do painel.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="falta-colaborador">Colaborador</Label>
          {selecionado ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selecionado.colaborador}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[selecionado.cargo, selecionado.postoAtual].filter(Boolean).join(" · ") ||
                    "Sem cargo/posto informado"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelecionado(null)}
                aria-label="Trocar colaborador"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="falta-colaborador"
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Digite o nome do colaborador"
                  className="pl-9"
                  autoComplete="off"
                />
                {buscando ? (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              {erroBusca ? <p className="text-xs text-destructive">{erroBusca}</p> : null}
              {resultados.length > 0 ? (
                <ul className="max-h-52 overflow-y-auto rounded-md border border-border">
                  {resultados.map((c) => (
                    <li key={c.personId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelecionado(c);
                          setResultados([]);
                        }}
                        className="w-full px-3 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <span className="block truncate text-sm text-foreground">
                          {c.colaborador}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[c.cargo, c.postoAtual].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="falta-tipo">Tipo de falta</Label>
            <select
              id="falta-tipo"
              value={situacaoId}
              onChange={(e) => setSituacaoId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Selecione o tipo</option>
              {situacoes.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.nome}
                </option>
              ))}
            </select>
            {erroSituacoes ? <p className="text-xs text-destructive">{erroSituacoes}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="falta-inicio">Início</Label>
            <Input
              id="falta-inicio"
              type="date"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                if (!fim || fim < e.target.value) setFim(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="falta-fim">Fim</Label>
            <Input
              id="falta-fim"
              type="date"
              value={fim}
              min={inicio}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="falta-obs">Observação</Label>
            <Textarea
              id="falta-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>
        </div>

        {selecionado ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              Validação do lançamento
              {validando ? <Loader2 className="size-3 animate-spin" /> : null}
            </p>
            {validacoes.length === 0 && !validando ? (
              <p className="text-xs text-muted-foreground">
                Informe as datas para conferir atestados e escala.
              </p>
            ) : null}
            <ul className="space-y-1">
              {validacoes.map((v) => (
                <li
                  key={v.chave + v.status}
                  className={
                    v.status === "bloqueio"
                      ? "text-xs text-destructive"
                      : v.status === "alerta"
                        ? "text-xs text-amber-600 dark:text-amber-400"
                        : "text-xs text-muted-foreground"
                  }
                >
                  <span className="font-semibold">{v.titulo}:</span> {v.detalhe}
                </li>
              ))}
            </ul>
            {bloqueado && podeForcar ? (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={forcar}
                  onChange={(e) => setForcar(e.target.checked)}
                  className="mt-0.5"
                />
                Conferi a escala do colaborador e confirmo que o dia é de trabalho (não é folga).
              </label>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={enviar}
          disabled={enviando || validando || (bloqueado && !(podeForcar && forcar))}
          className="w-full sm:w-auto"
        >
          {enviando ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          Lançar falta na NEXTI
        </Button>

        <div className="space-y-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => {
              setMostrarLogs((v) => !v);
              if (!mostrarLogs) void carregarLogs();
            }}
            className="text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
          >
            {mostrarLogs ? "Ocultar" : "Ver"} histórico de envios ({logs.length})
          </button>
          {mostrarLogs ? (
            logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum lançamento registrado ainda.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {logs.map((log) => (
                  <li key={log.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          log.status === "enviado"
                            ? "font-semibold uppercase text-emerald-600 dark:text-emerald-400"
                            : log.status === "bloqueado"
                              ? "font-semibold uppercase text-amber-600 dark:text-amber-400"
                              : "font-semibold uppercase text-destructive"
                        }
                      >
                        {log.status}
                      </span>
                      <span className="font-medium text-foreground">
                        {log.colaborador || "Colaborador"}
                      </span>
                      <span className="text-muted-foreground">
                        {log.inicio}
                        {log.fim && log.fim !== log.inicio ? ` a ${log.fim}` : ""}
                        {log.situacao ? ` · ${log.situacao}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(log.criadoEm).toLocaleString("pt-BR")}
                      {log.usuario ? ` · ${log.usuario}` : ""}
                      {log.forcado ? " · confirmado manualmente" : ""}
                    </p>
                    {log.motivo ? <p className="mt-1 text-muted-foreground">{log.motivo}</p> : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

      </CardContent>
    </Card>
  );
}
