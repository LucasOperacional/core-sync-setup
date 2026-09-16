import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  agruparPorEmpresa,
  aplicarFiltros,
  carregarFolhasProtocoladas,
  carregarPdfsOriginais,
  filtrosIniciais,
  montarPdfDaEmpresa,
  pendenciasDeIdentificacao,
  TODAS,
  TODOS,
  type Filtros,
  type GrupoEmpresa,
  type ResultadoEmpresa,
  type StatusProtocolo,
} from "@/lib/separar-pdf-empresa";

export type FolhaPonto = {
  ordem: number;
  colaborador: string;
  empresa: string;
  cargo: string;
  pagina: number;
  posto: string;
};

type Props = {
  folhas: FolhaPonto[];
  setFolhas: React.Dispatch<React.SetStateAction<FolhaPonto[]>>;
  arquivoPdf: File | null;
  setArquivoPdf: React.Dispatch<React.SetStateAction<File | null>>;
};

const STATUS: StatusProtocolo[] = ["Protocolado", "Pendente", "Cancelado", "Em audiência"];

export function AbaSepararPdf(_props: Props) {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState("");
  const [progresso, setProgresso] = useState("");
  const [gerando, setGerando] = useState(false);
  const [gerados, setGerados] = useState<ResultadoEmpresa[]>([]);
  const urlsRef = useRef<string[]>([]);

  const consulta = useQuery({
    queryKey: ["separar-folhas-protocoladas"],
    queryFn: () => carregarFolhasProtocoladas(setProgresso),
    refetchOnWindowFocus: true,
  });

  const todas = useMemo(() => consulta.data?.folhas ?? [], [consulta.data]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const empresas = useMemo(
    () =>
      Array.from(new Set(todas.filter((f) => f.empresaIdentificada).map((f) => f.empresa))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [todas],
  );
  const competencias = useMemo(
    () => Array.from(new Set(todas.map((f) => f.competencia))).sort(),
    [todas],
  );
  const postos = useMemo(
    () => Array.from(new Set(todas.map((f) => f.posto || "Sem posto"))).sort(),
    [todas],
  );

  const filtradas = useMemo(() => aplicarFiltros(todas, filtros), [todas, filtros]);
  const grupos = useMemo(() => agruparPorEmpresa(filtradas), [filtradas]);
  const pendencias = useMemo(() => pendenciasDeIdentificacao(filtradas), [filtradas]);

  const totalColaboradores = grupos.reduce((s, g) => s + g.colaboradores, 0);
  const totalFolhas = grupos.reduce((s, g) => s + g.folhas.length, 0);
  const totalPaginas = grupos.reduce((s, g) => s + g.paginas, 0);

  function atualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  async function gerar(alvos: GrupoEmpresa[]) {
    setGerando(true);
    setErro("");
    setResumo("");
    try {
      const caminhos = new Set<string>();
      for (const g of alvos) {
        for (const f of g.folhas) if (f.caminho && f.pagina) caminhos.add(f.caminho);
      }
      if (!caminhos.size) {
        setErro(
          "Nenhum PDF original disponível nos protocolos salvos para os filtros escolhidos. Salve o protocolo com o PDF das folhas para poder separá-lo por empresa.",
        );
        return [];
      }
      const cache = await carregarPdfsOriginais(caminhos, setProgresso);

      const resultados: ResultadoEmpresa[] = [];
      for (const g of alvos) {
        setProgresso(`Separando as folhas de ${g.empresa}...`);
        const r = await montarPdfDaEmpresa(g, cache);
        if (r) resultados.push(r);
      }
      if (!resultados.length) {
        setErro("Não foi possível montar nenhum PDF: as páginas originais não foram localizadas.");
        return [];
      }

      setGerados((atuais) => {
        const mapa = new Map(atuais.map((r) => [r.empresa, r]));
        for (const r of resultados) mapa.set(r.empresa, r);
        return Array.from(mapa.values()).sort((a, b) =>
          a.empresa.localeCompare(b.empresa, "pt-BR"),
        );
      });

      const colaboradores = resultados.reduce((s, r) => s + r.colaboradores, 0);
      const paginas = resultados.reduce((s, r) => s + r.paginas, 0);
      setResumo(
        `Separação concluída com sucesso: ${resultados.length} empresa(s), ${colaboradores} colaborador(es) e ${paginas} folha(s) de ponto protocoladas.`,
      );
      return resultados;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao separar as folhas por empresa.");
      return [];
    } finally {
      setGerando(false);
      setProgresso("");
    }
  }

  function blobDe(r: ResultadoEmpresa) {
    return new Blob([r.bytes as unknown as BlobPart], { type: "application/pdf" });
  }

  function urlDe(r: ResultadoEmpresa) {
    const url = URL.createObjectURL(blobDe(r));
    urlsRef.current.push(url);
    return url;
  }

  function baixar(r: ResultadoEmpresa) {
    const a = document.createElement("a");
    a.href = urlDe(r);
    a.download = r.nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function visualizar(r: ResultadoEmpresa) {
    window.open(urlDe(r), "_blank", "noopener,noreferrer");
  }

  function imprimir(r: ResultadoEmpresa) {
    const url = urlDe(r);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    document.body.appendChild(iframe);
  }

  async function baixarZip(lista: ResultadoEmpresa[]) {
    if (!lista.length) return;
    setProgresso("Compactando os PDFs em ZIP...");
    try {
      const zip = new JSZip();
      for (const r of lista) zip.file(r.nomeArquivo, r.bytes as unknown as Uint8Array);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      urlsRef.current.push(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Folhas_de_Ponto_Protocoladas.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setProgresso("");
    }
  }

  async function confirmarSeparacao() {
    const resultados = await gerar(grupos);
    if (resultados.length === 1) baixar(resultados[0]!);
  }

  const carregando = consulta.isLoading || consulta.isFetching;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Separar PDF por empresa
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Usa somente as folhas de ponto efetivamente protocoladas nos protocolos salvos e
              agrupa cada documento na empresa correspondente, preservando ordem, orientação,
              qualidade e assinaturas das páginas originais.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["separar-folhas-protocoladas"] });
            }}
            disabled={carregando || gerando}
          >
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Empresa</Label>
            <Select value={filtros.empresa} onValueChange={(v) => atualizar("empresa", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Competência</Label>
            <Select value={filtros.competencia} onValueChange={(v) => atualizar("competencia", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as competências</SelectItem>
                {competencias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "sem-competencia" ? "Sem competência" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status do protocolo</Label>
            <Select
              value={filtros.status}
              onValueChange={(v) => atualizar("status", v as Filtros["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                <SelectItem value={TODOS}>Todos os status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Posto</Label>
            <Select value={filtros.posto} onValueChange={(v) => atualizar("posto", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos os postos</SelectItem>
                {postos.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Colaborador ou matrícula</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Pesquisar..."
                value={filtros.colaborador}
                onChange={(e) => atualizar("colaborador", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Protocolo de</Label>
              <Input
                type="date"
                value={filtros.dataInicio}
                onChange={(e) => atualizar("dataInicio", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Protocolo até</Label>
              <Input
                type="date"
                value={filtros.dataFim}
                onChange={(e) => atualizar("dataFim", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={confirmarSeparacao} disabled={gerando || carregando || !grupos.length}>
            {gerando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Confirmar separação e gerar PDFs
          </Button>
          {gerados.length > 1 && (
            <Button variant="outline" onClick={() => void baixarZip(gerados)} disabled={gerando}>
              <Archive className="mr-2 h-4 w-4" />
              Baixar todos em ZIP ({gerados.length})
            </Button>
          )}
          <Button variant="ghost" onClick={() => setFiltros(filtrosIniciais)} disabled={gerando}>
            Limpar filtros
          </Button>
        </div>

        {progresso && (
          <div className="mt-3 flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progresso}
          </div>
        )}
        {resumo && !progresso && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {resumo}
          </p>
        )}
        {(erro || consulta.error) && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro || (consulta.error as Error)?.message}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { titulo: "Empresas", valor: grupos.length },
          { titulo: "Colaboradores protocolados", valor: totalColaboradores },
          { titulo: "Folhas encontradas", valor: totalFolhas },
          { titulo: "Páginas disponíveis", valor: totalPaginas },
        ].map((c) => (
          <div key={c.titulo} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.titulo}</p>
            <p className="text-2xl font-bold text-foreground">{c.valor}</p>
          </div>
        ))}
      </div>

      {!carregando && !grupos.length && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhuma folha protocolada encontrada com os filtros atuais.
        </p>
      )}

      {grupos.map((grupo) => {
        const pdf = gerados.find((r) => r.empresa === grupo.empresa);
        return (
          <div
            key={grupo.empresa}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{grupo.empresa}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {grupo.colaboradores} colaborador(es)
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {grupo.folhas.length} folha(s) • {grupo.paginas} página(s)
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Competência: {grupo.competencias.join(", ")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={gerando || carregando}
                  onClick={() => void gerar([grupo])}
                >
                  {gerando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {pdf ? "Gerar novamente" : "Gerar PDF"}
                </Button>
                {pdf && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => visualizar(pdf)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Visualizar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => imprimir(pdf)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button size="sm" onClick={() => baixar(pdf)}>
                      <Download className="mr-2 h-4 w-4" />
                      Baixar PDF
                    </Button>
                  </>
                )}
              </div>
            </div>

            {grupo.alertas.length > 0 && (
              <ul className="space-y-1 border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                {grupo.alertas.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            )}

            {pdf && (
              <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                Arquivo gerado:{" "}
                <span className="font-medium text-foreground">{pdf.nomeArquivo}</span> •{" "}
                {pdf.paginas} página(s)
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-3 py-2 font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Colaborador</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Matrícula</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Cargo</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Posto</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Competência</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Protocolo</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Página</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.folhas.map((f, idx) => (
                    <tr key={f.chave} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{f.colaborador}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.matricula || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.cargo || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.posto || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.competencia}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.protocoloNumero}</td>
                      <td className="px-3 py-2 text-xs">
                        {f.caminho && f.pagina ? (
                          <span className="text-green-600">pág. {f.pagina}</span>
                        ) : (
                          <span className="text-amber-600">sem PDF</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {pendencias.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-300 bg-card dark:border-amber-800">
          <div className="flex items-center gap-2 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Pendências de identificação ({pendencias.length})
          </div>
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Estas folhas não foram incluídas automaticamente porque a empresa não foi identificada.
            Corrija a empresa no protocolo salvo e atualize esta tela para incluí-las.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Colaborador</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Matrícula</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Posto</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Competência</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Protocolo</th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((f) => (
                  <tr key={f.chave} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{f.colaborador}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.matricula || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.posto || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.competencia}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.protocoloNumero}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
