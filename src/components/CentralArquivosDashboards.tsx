import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarX2,
  ClipboardCheck,
  Download,
  Eye,
  FolderSync,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  EVENTO_CENTRAL_ARQUIVOS,
  excluirArquivoImportado,
  formatarDataHora,
  formatarTamanho,
  listarArquivosImportados,
  listarHistorico,
  montarResumos,
  obterConfiguracoes,
  definirSincronizacaoAutomatica,
  sincronizarArquivo,
  sincronizarDashboard,
  urlAssinada,
  type ArquivoImportado,
  type DashboardDestino,
  type HistoricoSincronizacao,
  type StatusSincronizacao,
} from "@/lib/central-arquivos-db";

const DASHBOARDS: {
  chave: DashboardDestino;
  titulo: string;
  descricao: string;
  rotuloRegistros: string;
  icone: typeof BarChart3;
  cor: string;
  fundo: string;
}[] = [
  {
    chave: "CONTROL",
    titulo: "CONTROL",
    descricao: "Arquivos que alimentam o dashboard de supervisão.",
    rotuloRegistros: "Registros processados",
    icone: BarChart3,
    cor: "text-sky-400",
    fundo: "bg-sky-500/10",
  },
  {
    chave: "FALTAS",
    titulo: "FALTAS",
    descricao: "Arquivos que alimentam o dashboard de absenteísmo.",
    rotuloRegistros: "Faltas identificadas",
    icone: CalendarX2,
    cor: "text-orange-400",
    fundo: "bg-orange-500/10",
  },
  {
    chave: "ATESTADOS",
    titulo: "ATESTADOS",
    descricao: "Arquivos que alimentam o dashboard de atestados.",
    rotuloRegistros: "Atestados identificados",
    icone: ClipboardCheck,
    cor: "text-purple-400",
    fundo: "bg-purple-500/10",
  },
];

const ROTULO_STATUS: Record<StatusSincronizacao, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  atualizado: "Atualizado",
  erro: "Erro",
};

function badgeStatus(status: StatusSincronizacao): string {
  if (status === "atualizado") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === "processando") return "border-sky-500/30 bg-sky-500/10 text-sky-400";
  if (status === "erro") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

export function CentralArquivosDashboards() {
  const [arquivos, setArquivos] = useState<ArquivoImportado[]>([]);
  const [config, setConfig] = useState<Record<DashboardDestino, boolean>>({
    CONTROL: false,
    FALTAS: false,
    ATESTADOS: false,
  });
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState<DashboardDestino | null>(null);
  const [ocupadoArquivo, setOcupadoArquivo] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ArquivoImportado | null>(null);
  const [historico, setHistorico] = useState<HistoricoSincronizacao[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [apagandoLote, setApagandoLote] = useState(false);

  // filtros
  const [filtroDashboard, setFiltroDashboard] = useState<"TODOS" | DashboardDestino>("TODOS");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | StatusSincronizacao>("TODOS");
  const [filtroFormato, setFiltroFormato] = useState("TODOS");
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");

  const recarregar = useCallback(async () => {
    const [lista, cfg] = await Promise.all([listarArquivosImportados(), obterConfiguracoes()]);
    setArquivos(lista);
    setConfig(cfg);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void recarregar();
    const handler = () => void recarregar();
    window.addEventListener(EVENTO_CENTRAL_ARQUIVOS, handler);
    window.addEventListener("faltas-sync", handler);
    window.addEventListener("atestados-sync", handler);
    return () => {
      window.removeEventListener(EVENTO_CENTRAL_ARQUIVOS, handler);
      window.removeEventListener("faltas-sync", handler);
      window.removeEventListener("atestados-sync", handler);
    };
  }, [recarregar]);

  const resumos = useMemo(() => montarResumos(arquivos, config), [arquivos, config]);

  const filtrados = useMemo(() => {
    const nome = filtroNome.trim().toLowerCase();
    return arquivos.filter((a) => {
      if (filtroDashboard !== "TODOS" && a.dashboard !== filtroDashboard) return false;
      if (filtroStatus !== "TODOS" && a.status_sincronizacao !== filtroStatus) return false;
      if (filtroFormato !== "TODOS" && a.formato !== filtroFormato) return false;
      if (nome && !a.nome_original.toLowerCase().includes(nome)) return false;
      if (filtroDe && a.importado_em < new Date(`${filtroDe}T00:00:00`).toISOString()) return false;
      if (filtroAte && a.importado_em > new Date(`${filtroAte}T23:59:59`).toISOString())
        return false;
      return true;
    });
  }, [arquivos, filtroDashboard, filtroStatus, filtroFormato, filtroNome, filtroDe, filtroAte]);

  async function handleSincronizar(dashboard: DashboardDestino) {
    if (sincronizando) return;
    setSincronizando(dashboard);
    try {
      const r = await sincronizarDashboard(dashboard);
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } finally {
      setSincronizando(null);
      await recarregar();
    }
  }

  async function handleAutomatica(dashboard: DashboardDestino, ativo: boolean) {
    setConfig((c) => ({ ...c, [dashboard]: ativo }));
    const ok = await definirSincronizacaoAutomatica(dashboard, ativo);
    if (!ok) {
      setConfig((c) => ({ ...c, [dashboard]: !ativo }));
      toast.error("Não foi possível alterar a sincronização automática.");
      return;
    }
    toast.success(
      ativo
        ? `Sincronização automática ativada para ${dashboard}.`
        : `Sincronização automática desativada para ${dashboard}.`,
    );
  }

  async function abrirDetalhe(arquivo: ArquivoImportado) {
    setDetalhe(arquivo);
    setHistorico(await listarHistorico(arquivo.id));
  }

  async function handleSincronizarArquivo(arquivo: ArquivoImportado) {
    if (ocupadoArquivo) return;
    setOcupadoArquivo(arquivo.id);
    try {
      const r = await sincronizarArquivo(arquivo);
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } finally {
      setOcupadoArquivo(null);
      await recarregar();
    }
  }

  async function handleBaixar(arquivo: ArquivoImportado) {
    const url = await urlAssinada(arquivo);
    if (!url) {
      toast.error("Não foi possível gerar o link do arquivo.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.nome_original;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleExcluir(arquivo: ArquivoImportado) {
    if (!window.confirm(`Excluir definitivamente o arquivo "${arquivo.nome_original}"?`)) return;
    setOcupadoArquivo(arquivo.id);
    const ok = await excluirArquivoImportado(arquivo);
    setOcupadoArquivo(null);
    if (ok) {
      toast.success("Arquivo excluído.");
      if (detalhe?.id === arquivo.id) setDetalhe(null);
    } else {
      toast.error("Não foi possível excluir o arquivo.");
    }
    await recarregar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <FolderSync className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Central de Arquivos dos Dashboards</h2>
            <p className="text-sm text-muted-foreground">
              Registro, organização e sincronização dos arquivos que alimentam CONTROL, FALTAS e
              ATESTADOS.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void recarregar()}
          className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="size-4" />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {DASHBOARDS.map((d) => {
          const resumo = resumos[d.chave];
          const emAndamento = sincronizando === d.chave;
          return (
            <Card key={d.chave}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-10 items-center justify-center rounded-xl ${d.fundo} ${d.cor}`}
                  >
                    <d.icone className="size-5" />
                  </span>
                  <div className="flex-1">
                    <CardTitle className="text-base">{d.titulo}</CardTitle>
                    <CardDescription className="text-xs">{d.descricao}</CardDescription>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeStatus(resumo.status)}`}
                  >
                    {ROTULO_STATUS[resumo.status]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Arquivos importados</p>
                    <p className="text-2xl font-bold">{resumo.totalArquivos}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{d.rotuloRegistros}</p>
                    <p className="text-2xl font-bold">{resumo.totalRegistros}</p>
                  </div>
                </div>

                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Último arquivo</dt>
                    <dd
                      className="max-w-[60%] truncate font-medium"
                      title={resumo.ultimoArquivo ?? ""}
                    >
                      {resumo.ultimoArquivo ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Última importação</dt>
                    <dd className="font-medium">{formatarDataHora(resumo.ultimaImportacao)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Última sincronização</dt>
                    <dd className="font-medium">{formatarDataHora(resumo.ultimaSincronizacao)}</dd>
                  </div>
                </dl>

                {emAndamento && <Progress value={66} className="h-1.5" />}

                <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-xs font-medium">Sincronização automática</p>
                    <p className="text-[11px] text-muted-foreground">
                      Novos arquivos são sincronizados na importação.
                    </p>
                  </div>
                  <Switch
                    checked={resumo.sincronizacaoAutomatica}
                    onCheckedChange={(v) => void handleAutomatica(d.chave, v)}
                    aria-label={`Ativar sincronização automática do ${d.titulo}`}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!sincronizando}
                    onClick={() => void handleSincronizar(d.chave)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {emAndamento ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" />
                        Sincronizar agora
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroDashboard(d.chave);
                      document
                        .getElementById("historico-arquivos")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <Eye className="size-4" />
                    Ver arquivos
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card id="historico-arquivos">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de Arquivos Importados</CardTitle>
          <CardDescription className="text-xs">
            Todos os arquivos registrados na Central, com registros processados e situação da
            sincronização.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <select
              value={filtroDashboard}
              onChange={(e) => setFiltroDashboard(e.target.value as typeof filtroDashboard)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Filtrar por dashboard"
            >
              <option value="TODOS">Todos os dashboards</option>
              <option value="CONTROL">CONTROL</option>
              <option value="FALTAS">FALTAS</option>
              <option value="ATESTADOS">ATESTADOS</option>
            </select>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Filtrar por status"
            >
              <option value="TODOS">Todos os status</option>
              <option value="atualizado">Atualizado</option>
              <option value="aguardando">Aguardando</option>
              <option value="processando">Processando</option>
              <option value="erro">Erro</option>
            </select>
            <select
              value={filtroFormato}
              onChange={(e) => setFiltroFormato(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Filtrar por tipo de arquivo"
            >
              <option value="TODOS">Todos os tipos</option>
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="xls">XLS</option>
              <option value="outro">Outro</option>
            </select>
            <input
              type="date"
              value={filtroDe}
              onChange={(e) => setFiltroDe(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Período inicial"
            />
            <input
              type="date"
              value={filtroAte}
              onChange={(e) => setFiltroAte(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Período final"
            />
            <input
              type="search"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              placeholder="Nome do arquivo"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Filtrar por nome do arquivo"
            />
          </div>

          {carregando ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando arquivos...</p>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum arquivo importado encontrado com os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Arquivo</th>
                    <th className="px-3 py-2 font-medium">Dashboard</th>
                    <th className="px-3 py-2 font-medium">Importação</th>
                    <th className="px-3 py-2 font-medium">Registros</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Última sincronização</th>
                    <th className="px-3 py-2 font-medium">Responsável</th>
                    <th className="px-3 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((a) => (
                    <tr key={a.id} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        <p className="max-w-[220px] truncate font-medium" title={a.nome_original}>
                          {a.nome_original}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.formato.toUpperCase()} · {formatarTamanho(a.tamanho)}
                        </p>
                      </td>
                      <td className="px-3 py-2">{a.dashboard}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatarDataHora(a.importado_em)}
                      </td>
                      <td className="px-3 py-2">{a.registros}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeStatus(a.status_sincronizacao)}`}
                        >
                          {ROTULO_STATUS[a.status_sincronizacao]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatarDataHora(a.ultima_sincronizacao)}
                      </td>
                      <td className="px-3 py-2">{a.usuario_nome || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Visualizar detalhes"
                            onClick={() => void abrirDetalhe(a)}
                            className="rounded-md p-2 transition-colors hover:bg-accent"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Sincronizar novamente"
                            disabled={ocupadoArquivo === a.id}
                            onClick={() => void handleSincronizarArquivo(a)}
                            className="rounded-md p-2 transition-colors hover:bg-accent disabled:opacity-40"
                          >
                            {ocupadoArquivo === a.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                          </button>
                          {a.mensagem_erro && (
                            <button
                              type="button"
                              title="Ver erros"
                              onClick={() => toast.error(a.mensagem_erro ?? "")}
                              className="rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <TriangleAlert className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Baixar arquivo"
                            onClick={() => void handleBaixar(a)}
                            className="rounded-md p-2 transition-colors hover:bg-accent"
                          >
                            <Download className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Excluir"
                            disabled={ocupadoArquivo === a.id}
                            onClick={() => void handleExcluir(a)}
                            className="rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {detalhe && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Detalhes do arquivo</CardTitle>
                <CardDescription className="text-xs">{detalhe.nome_original}</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => setDetalhe(null)}
                className="rounded-md p-2 transition-colors hover:bg-accent"
                aria-label="Fechar detalhes"
              >
                <X className="size-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <p>
                <span className="text-muted-foreground">Dashboard: </span>
                {detalhe.dashboard}
              </p>
              <p>
                <span className="text-muted-foreground">Formato: </span>
                {detalhe.formato.toUpperCase()}
              </p>
              <p>
                <span className="text-muted-foreground">Tamanho: </span>
                {formatarTamanho(detalhe.tamanho)}
              </p>
              <p>
                <span className="text-muted-foreground">Registros: </span>
                {detalhe.registros}
              </p>
              <p>
                <span className="text-muted-foreground">Processamento: </span>
                {detalhe.status_processamento}
              </p>
              <p>
                <span className="text-muted-foreground">Sincronização: </span>
                {ROTULO_STATUS[detalhe.status_sincronizacao]}
              </p>
              <p>
                <span className="text-muted-foreground">Importado em: </span>
                {formatarDataHora(detalhe.importado_em)}
              </p>
              <p>
                <span className="text-muted-foreground">Última sincronização: </span>
                {formatarDataHora(detalhe.ultima_sincronizacao)}
              </p>
              <p>
                <span className="text-muted-foreground">Responsável: </span>
                {detalhe.usuario_nome || "—"}
              </p>
              <p className="sm:col-span-2 lg:col-span-3 break-all">
                <span className="text-muted-foreground">Hash: </span>
                {detalhe.hash_arquivo}
              </p>
              {detalhe.mensagem_erro && (
                <p className="text-destructive sm:col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground">Erro: </span>
                  {detalhe.mensagem_erro}
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Tentativas de sincronização</h3>
              {historico.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum registro de sincronização.</p>
              ) : (
                <ul className="space-y-1.5">
                  {historico.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{h.mensagem}</span>
                      <span className="text-muted-foreground">
                        {h.resultado} · {h.registros} registro(s) · {formatarDataHora(h.created_at)}{" "}
                        · {h.usuario_nome}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
