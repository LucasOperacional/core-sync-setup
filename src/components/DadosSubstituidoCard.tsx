import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Search, UserCheck, X } from "lucide-react";
import { CalendarClock, FileText, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  pesquisarNomeColaboradorNexti,
  pesquisarPostosNexti,
  type NomeColaboradorNexti,
  type PostoNexti,
} from "@/lib/nexti-ativos.functions";

type DadosSubstituidoCardProps = {
  /** Colaborador selecionado (controlado pelo pai). */
  selecionado: NomeColaboradorNexti | null;
  /** Callback quando um colaborador é escolhido ou limpo. */
  onSelecionar: (colaborador: NomeColaboradorNexti | null) => void;
  /** Data e hora de início da substituição (ISO ou vazio). */
  dataHora: string;
  /** Callback ao alterar a data e hora de início. */
  onDataHoraChange: (valor: string) => void;
  /** Data e hora de fim da substituição (ISO ou vazio). */
  dataHoraFim: string;
  /** Callback ao alterar a data e hora de fim. */
  onDataHoraFimChange: (valor: string) => void;
  /** Posto de serviço selecionado (controlado pelo pai). */
  postoSelecionado: PostoNexti | null;
  /** Callback ao selecionar/limpar o posto de serviço. */
  onPostoSelecionadoChange: (posto: PostoNexti | null) => void;
  /** Motivo da substituição (texto livre). */
  motivo: string;
  /** Callback ao alterar o motivo. */
  onMotivoChange: (valor: string) => void;
  /** Supervisor responsável (texto livre). */
  supervisor: string;
  /** Callback ao alterar o supervisor responsável. */
  onSupervisorChange: (valor: string) => void;
};

/**
 * Card "DADOS DO SUBSTITUIDO" para o lançamento de CRT.
 * Permite pesquisar um colaborador diretamente na NEXTI e registrar
 * qual trabalhador está sendo substituído pelo CRT.
 */
export function DadosSubstituidoCard({
  selecionado,
  onSelecionar,
  dataHora,
  onDataHoraChange,
  dataHoraFim,
  onDataHoraFimChange,
  postoSelecionado,
  onPostoSelecionadoChange,
  motivo,
  onMotivoChange,
  supervisor,
  onSupervisorChange,
}: DadosSubstituidoCardProps) {
  const pesquisar = useServerFn(pesquisarNomeColaboradorNexti);
  const pesquisarPostos = useServerFn(pesquisarPostosNexti);

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<NomeColaboradorNexti[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const pedidoRef = useRef(0);

  // --- Posto de serviço ---
  const [termoPosto, setTermoPosto] = useState("");
  const [postos, setPostos] = useState<PostoNexti[]>([]);
  const [totalPostos, setTotalPostos] = useState(0);
  const [carregandoPostos, setCarregandoPostos] = useState(false);
  const [sincronizandoPostos, setSincronizandoPostos] = useState(false);
  const [erroPostos, setErroPostos] = useState<string | null>(null);
  const [sincronizadoEmPostos, setSincronizadoEmPostos] = useState<string | null>(null);
  const [postoAberto, setPostoAberto] = useState(false);
  const pedidoPostoRef = useRef(0);

  const executar = useCallback(
    async (texto: string, forcarSincronizar = false) => {
      const alvo = texto.trim();
      if (!forcarSincronizar && alvo.length < 2) {
        setResultados([]);
        setTotal(0);
        setErro(null);
        return;
      }
      const pedido = pedidoRef.current + 1;
      pedidoRef.current = pedido;
      if (forcarSincronizar) setSincronizando(true);
      setCarregando(true);
      try {
        const resultado = await pesquisar({
          data: { termo: alvo, forcarSincronizar },
        });
        if (pedidoRef.current !== pedido) return;
        setSincronizadoEm(resultado.sincronizadoEm);
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
        if (pedidoRef.current === pedido) {
          setCarregando(false);
          setSincronizando(false);
        }
      }
    },
    [pesquisar],
  );

  const executarPostos = useCallback(
    async (texto: string, forcarSincronizar = false) => {
      const alvo = texto.trim();
      const pedido = pedidoPostoRef.current + 1;
      pedidoPostoRef.current = pedido;
      if (forcarSincronizar) setSincronizandoPostos(true);
      setCarregandoPostos(true);
      try {
        const resultado = await pesquisarPostos({
          data: { termo: alvo, forcarSincronizar },
        });
        if (pedidoPostoRef.current !== pedido) return;
        setSincronizadoEmPostos(resultado.sincronizadoEm);
        if (!resultado.ok) {
          setErroPostos(resultado.erro ?? "Não foi possível consultar a NEXTI.");
          setPostos([]);
          setTotalPostos(0);
        } else {
          setErroPostos(null);
          setPostos(resultado.postos);
          setTotalPostos(resultado.total);
        }
      } catch (e) {
        if (pedidoPostoRef.current !== pedido) return;
        setErroPostos(e instanceof Error ? e.message : "Falha na consulta de postos.");
      } finally {
        if (pedidoPostoRef.current === pedido) {
          setCarregandoPostos(false);
          setSincronizandoPostos(false);
        }
      }
    },
    [pesquisarPostos],
  );

  // Pré-carrega a lista de postos ao montar.
  useEffect(() => {
    void executarPostos("", true);
  }, [executarPostos]);

  // Busca de postos com debounce.
  useEffect(() => {
    const t = setTimeout(() => void executarPostos(termoPosto), 450);
    return () => clearTimeout(t);
  }, [termoPosto, executarPostos]);

  // Pré-carrega a lista de colaboradores ao montar.
  useEffect(() => {
    void executar("", true);
  }, [executar]);

  // Busca com debounce enquanto digita.
  useEffect(() => {
    const t = setTimeout(() => void executar(termo), 450);
    return () => clearTimeout(t);
  }, [termo, executar]);

  function escolher(colaborador: NomeColaboradorNexti) {
    onSelecionar(colaborador);
    setAberto(false);
    setTermo("");
    setResultados([]);
    setTotal(0);
  }

  function limpar() {
    onSelecionar(null);
    setTermo("");
    setResultados([]);
    setTotal(0);
  }

  function escolherPosto(posto: PostoNexti) {
    onPostoSelecionadoChange(posto);
    setPostoAberto(false);
    setTermoPosto("");
    setPostos([]);
    setTotalPostos(0);
  }

  function limparPosto() {
    onPostoSelecionadoChange(null);
    setTermoPosto("");
    setPostos([]);
    setTotalPostos(0);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCheck className="size-5" />
          </span>
          <div className="flex-1">
            <CardTitle className="text-base">DADOS DO SUBSTITUIDO</CardTitle>
            <CardDescription className="text-xs">
              Selecione o colaborador que está sendo substituído pelo CRT, consultando direto a
              NEXTI.
            </CardDescription>
          </div>
          {selecionado ? (
            <button
              type="button"
              onClick={limpar}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" /> Limpar
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {selecionado ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Colaborador
                </span>
                <span className="block text-base font-medium text-foreground">
                  {selecionado.colaborador}
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="data-hora-substituido"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <CalendarClock className="size-3.5" /> Data / hora que ele iniciou
                </Label>
                <input
                  id="data-hora-substituido"
                  type="datetime-local"
                  value={dataHora}
                  onChange={(e) => onDataHoraChange(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="data-hora-fim-substituido"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <CalendarClock className="size-3.5" /> Até que horas ele vai fazer
                </Label>
                <input
                  id="data-hora-fim-substituido"
                  type="datetime-local"
                  value={dataHoraFim}
                  onChange={(e) => onDataHoraFimChange(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            {/* POSTO DE SERVIÇO — busca direto na NEXTI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="size-3.5" /> Posto de serviço
                </Label>
                {postoSelecionado ? (
                  <button
                    type="button"
                    onClick={limparPosto}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3" /> Limpar posto
                  </button>
                ) : null}
              </div>

              {postoSelecionado ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                  <p className="text-sm font-medium text-foreground">{postoSelecionado.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    ID NEXTI: {postoSelecionado.id}
                    {postoSelecionado.externalId
                      ? ` · Código externo: ${postoSelecionado.externalId}`
                      : ""}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="relative block w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={termoPosto}
                      onChange={(e) => {
                        setTermoPosto(e.target.value);
                        setPostoAberto(true);
                      }}
                      onFocus={() => setPostoAberto(true)}
                      placeholder="Pesquise o posto de serviço na NEXTI…"
                      className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {carregandoPostos ? (
                      <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : null}
                  </label>
                  <div className="mt-1 flex items-center justify-between">
                    {sincronizadoEmPostos ? (
                      <p className="text-[11px] text-muted-foreground">
                        Última sincronização:{" "}
                        {new Date(sincronizadoEmPostos).toLocaleString("pt-BR")}
                      </p>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => void executarPostos(termoPosto, true)}
                      disabled={sincronizandoPostos}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {sincronizandoPostos ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                      Sincronizar
                    </button>
                  </div>
                  {erroPostos ? (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                      {erroPostos}
                    </p>
                  ) : null}
                  {postoAberto && postos.length > 0 ? (
                    <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-black/30">
                      <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                        {totalPostos} posto(s) encontrado(s)
                        {totalPostos > postos.length
                          ? ` · mostrando os ${postos.length} primeiros`
                          : ""}
                      </p>
                      <ul className="divide-y divide-white/5">
                        {postos.map((p, i) => (
                          <li key={`${p.id}-${i}`}>
                            <button
                              type="button"
                              onClick={() => escolherPosto(p)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-primary/10"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {p.nome}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  ID: {p.id}
                                  {p.externalId ? ` · ${p.externalId}` : ""}
                                </span>
                              </span>
                              <MapPin className="size-4 shrink-0 text-primary/60" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {/* MOTIVO — texto livre */}
            <div className="space-y-1.5">
              <Label
                htmlFor="motivo-substituido"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <FileText className="size-3.5" /> Motivo
              </Label>
              <textarea
                id="motivo-substituido"
                value={motivo}
                onChange={(e) => onMotivoChange(e.target.value)}
                rows={3}
                placeholder="Digite o motivo da substituição…"
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {/* SUPERVISOR RESPONSÁVEL */}
            <div className="space-y-1.5">
              <Label
                htmlFor="supervisor-responsavel-substituido"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <UserCheck className="size-3.5" /> Supervisor responsável
              </Label>
              <input
                id="supervisor-responsavel-substituido"
                value={supervisor}
                onChange={(e) => onSupervisorChange(e.target.value)}
                placeholder="Nome do supervisor responsável"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="relative block w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={termo}
                  onChange={(e) => {
                    setTermo(e.target.value);
                    setAberto(true);
                  }}
                  onFocus={() => setAberto(true)}
                  placeholder="Digite o nome do colaborador substituído…"
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {carregando ? (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => void executar(termo, true)}
                disabled={sincronizando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {sincronizando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Sincronizar
              </button>
            </div>

            {sincronizadoEm ? (
              <p className="text-[11px] text-muted-foreground">
                Última sincronização com NEXTI em {new Date(sincronizadoEm).toLocaleString("pt-BR")}
              </p>
            ) : null}

            {erro ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {erro}
              </p>
            ) : null}

            {aberto && resultados.length > 0 ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-border bg-black/30">
                <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                  {total} colaborador(es) encontrado(s)
                  {total > resultados.length
                    ? ` · mostrando os ${resultados.length} primeiros`
                    : ""}
                </p>
                <ul className="divide-y divide-white/5">
                  {resultados.map((c, i) => (
                    <li key={`${c.colaborador}-${c.personId}-${i}`}>
                      <button
                        type="button"
                        onClick={() => escolher(c)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {c.colaborador}
                          </span>
                        </span>
                        <UserCheck className="size-4 shrink-0 text-primary/60" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
