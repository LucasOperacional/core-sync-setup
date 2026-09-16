import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  Loader2,
  PackageCheck,
  RefreshCw,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  atualizarStatus,
  baixarAtualizacao,
  enviarAtualizacao,
  formatarTamanho,
  listarAtualizacoes,
  publicarAtualizacao,
  removerAtualizacao,
  type ProjetoAtualizacao,
  type StatusAtualizacao,
} from "@/lib/projeto-atualizacoes-db";

const rotuloStatus: Record<StatusAtualizacao, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  aplicado: "Aplicado",
  recusado: "Recusado",
};

const corStatus: Record<StatusAtualizacao, string> = {
  recebido: "bg-sky-500/15 text-sky-400",
  em_analise: "bg-amber-500/15 text-amber-400",
  aplicado: "bg-emerald-500/15 text-emerald-400",
  recusado: "bg-destructive/15 text-destructive",
};

export function AtualizacaoProjetoCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<ProjetoAtualizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setItens(await listarAtualizacoes());
    } catch (err) {
      console.error("[atualizacoes] falha ao listar:", err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const sincronizarAgora = useCallback(async () => {
    setSincronizando(true);
    setEtapa("");
    try {
      const lista = await listarAtualizacoes();
      const pendentes = lista.filter((i) => i.status === "recebido" || i.status === "em_analise");

      if (pendentes.length === 0) {
        setItens(lista);
        setUltimaSync(new Date());
        toast.success("Tudo sincronizado — nenhum pacote novo aguardando.");
        return;
      }

      let enviados = 0;
      const falhas: string[] = [];
      for (const item of pendentes) {
        await atualizarStatus(item.id, "em_analise");
        const r = await publicarAtualizacao(item, (e) => setEtapa(`${item.nome_arquivo}: ${e}`));
        enviados += r.enviados;
        falhas.push(...r.falhas);
      }

      setItens(await listarAtualizacoes());
      setUltimaSync(new Date());

      if (falhas.length > 0) {
        toast.warning(
          `${enviados} arquivo(s) enviados; ${falhas.length} não subiram. Tente sincronizar de novo.`,
        );
      } else {
        toast.success(
          `Atualização aplicada: ${enviados} arquivo(s) do projeto enviados por completo.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível sincronizar agora.");
    } finally {
      setSincronizando(false);
      setEtapa("");
    }
  }, []);

  const processar = useCallback(
    async (file: File) => {
      setEnviando(true);
      try {
        const item = await enviarAtualizacao(file, observacoes, setEtapa);
        toast.success(
          `Pacote recebido: ${item.total_arquivos} arquivo(s)${item.versao ? ` · versão ${item.versao}` : ""}.`,
        );
        setObservacoes("");
        await recarregar();
        await sincronizarAgora();
      } catch (err) {
        toast.error(
          `Não foi possível receber a atualização: ${err instanceof Error ? err.message : "erro desconhecido"}`,
        );
      } finally {
        setEnviando(false);
        setEtapa("");
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [observacoes, recarregar, sincronizarAgora],
  );

  async function mudarStatus(item: ProjetoAtualizacao, status: StatusAtualizacao) {
    try {
      await atualizarStatus(item.id, status);
      toast.success(`Status alterado para "${rotuloStatus[status]}".`);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar o status.");
    }
  }

  async function baixar(item: ProjetoAtualizacao) {
    const url = await baixarAtualizacao(item);
    if (!url) {
      toast.error("Não foi possível gerar o link do pacote.");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  async function excluir(item: ProjetoAtualizacao) {
    if (!window.confirm(`Apagar o pacote "${item.nome_arquivo}"?`)) return;
    try {
      await removerAtualizacao(item);
      toast.success("Pacote apagado.");
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao apagar o pacote.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PackageCheck className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-card-foreground">
            Atualização do projeto (.zip)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie o pacote .zip com a versão completa do projeto. O conteúdo é conferido, guardado
            com segurança e fica registrado no histórico com data, versão e responsável.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sincronizarAgora()}
          disabled={sincronizando || enviando}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? etapa || "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
      {ultimaSync ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Última sincronização: {ultimaSync.toLocaleString("pt-BR")}
        </p>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void processar(file);
        }}
        className={`mt-5 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          arrastando ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        }`}
      >
        <FileArchive className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Arraste o arquivo .zip aqui ou escolha no computador (até 200 MB).
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void processar(file);
          }}
        />
        <button
          type="button"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {etapa || "Enviando..."}
            </>
          ) : (
            <>
              <UploadCloud className="size-4" />
              Selecionar pacote .zip
            </>
          )}
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="font-medium text-card-foreground">O que mudou nesta versão</span>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          placeholder="Ex.: correções na página de folhas de ponto e novos contadores."
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-card-foreground">Histórico de atualizações</h3>
        {carregando ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando...
          </p>
        ) : itens.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma atualização enviada ainda.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {itens.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-background/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-card-foreground">
                      {item.nome_arquivo}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("pt-BR")} ·{" "}
                      {formatarTamanho(item.tamanho_bytes)} · {item.total_arquivos} arquivo(s)
                      {item.versao ? ` · versão ${item.versao}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${corStatus[item.status]}`}
                  >
                    <Clock className="size-3" />
                    {rotuloStatus[item.status]}
                  </span>
                </div>

                {item.observacoes ? (
                  <p className="mt-2 text-sm text-muted-foreground">{item.observacoes}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAberto(aberto === item.id ? null : item.id)}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    {aberto === item.id ? "Ocultar arquivos" : "Ver arquivos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void baixar(item)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <Download className="size-3.5" />
                    Baixar
                  </button>
                  <button
                    type="button"
                    onClick={() => void mudarStatus(item, "em_analise")}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    Em análise
                  </button>
                  <button
                    type="button"
                    onClick={() => void mudarStatus(item, "aplicado")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-accent"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Aplicado
                  </button>
                  <button
                    type="button"
                    onClick={() => void mudarStatus(item, "recusado")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <XCircle className="size-3.5" />
                    Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => void excluir(item)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    Apagar
                  </button>
                </div>

                {aberto === item.id ? (
                  <div className="mt-3 max-h-60 overflow-auto rounded-lg border border-border bg-muted/20 p-3">
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {item.arquivos.map((a) => (
                        <li key={a} className="truncate font-mono">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
