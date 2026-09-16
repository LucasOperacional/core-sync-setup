import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileSpreadsheet,
  Filter,
  Loader2,
  MapPin,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FloatingNav } from "@/components/FloatingNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  atualizarStatusCrt,
  listarCrtLancamentos,
  type CrtLancamento,
} from "@/lib/crt-lancamentos.functions";
import { exportarPdfsCrtEmLote, gerarPdfCrt } from "@/lib/crt-pdf";

export const Route = createFileRoute("/_authenticated/coordenacao-crt")({
  head: () => ({
    meta: [
      { title: "CRT enviados | Coordenação" },
      {
        name: "description",
        content:
          "Lançamentos de Controle de Reserva Técnica enviados pela supervisão, com geração do formulário em PDF.",
      },
      { property: "og:title", content: "CRT enviados | Coordenação" },
      {
        property: "og:description",
        content: "Confira os CRTs enviados pela supervisão e gere o formulário em PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoordenacaoCrtPage,
});

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

function CoordenacaoCrtPage() {
  const listar = useServerFn(listarCrtLancamentos);
  const atualizar = useServerFn(atualizarStatusCrt);
  const [lancamentos, setLancamentos] = useState<CrtLancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroDataEnvio, setFiltroDataEnvio] = useState("");
  const [filtroEnviadoPor, setFiltroEnviadoPor] = useState("todos");
  const [exportando, setExportando] = useState(false);
  const [exportandoPdfs, setExportandoPdfs] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listar({});
      if (!r.ok) toast.error(r.erro ?? "Não foi possível carregar os CRTs.");
      setLancamentos(r.lancamentos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const enviadosPor = useMemo(() => {
    const nomes = new Set<string>();
    for (const l of lancamentos) {
      const nome = l.enviado_por_nome || l.supervisor;
      if (nome) nomes.add(nome);
    }
    return Array.from(nomes).sort();
  }, [lancamentos]);

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos.filter((l) => {
      if (filtroDataEnvio) {
        const dataCrt = l.created_at ? l.created_at.slice(0, 10) : "";
        if (dataCrt !== filtroDataEnvio) return false;
      }
      if (filtroEnviadoPor !== "todos") {
        const nome = l.enviado_por_nome || l.supervisor || "";
        if (nome !== filtroEnviadoPor) return false;
      }
      return true;
    });
  }, [lancamentos, filtroDataEnvio, filtroEnviadoPor]);

  function limparFiltros() {
    setFiltroDataEnvio("");
    setFiltroEnviadoPor("todos");
  }

  const filtrosAtivos = filtroDataEnvio !== "" || filtroEnviadoPor !== "todos";

  async function marcarLancado(crt: CrtLancamento) {
    const novo = crt.status === "lancado" ? "pendente" : "lancado";
    const r = await atualizar({ data: { id: crt.id, status: novo } });
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível atualizar.");
      return;
    }
    setLancamentos((atual) =>
      atual.map((item) =>
        item.id === crt.id
          ? {
              ...item,
              status: novo,
              lancado_por_nome: novo === "lancado" ? (r.lancadoPorNome ?? null) : null,
              lancado_em: novo === "lancado" ? (r.lancadoEm ?? null) : null,
            }
          : item,
      ),
    );
  }

  async function exportarTodos() {
    setExportandoPdfs(true);
    try {
      await exportarPdfsCrtEmLote(lancamentosFiltrados);
      toast.success(`PDF gerado com ${lancamentosFiltrados.length} CRT(s), 2 por página.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setExportandoPdfs(false);
    }
  }

  async function exportarExcel() {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const linhas = lancamentosFiltrados.map((c) => ({
        ID: c.id,
        Status: c.status === "lancado" ? "Lançado" : "Pendente",
        "Colaborador substituído": c.colaborador,
        "ID NEXTI (substituído)": c.person_id ?? "",
        "Posto de serviço": c.posto_nome,
        "ID do posto": c.posto_id ?? "",
        Motivo: c.motivo,
        "Início da substituição": fmt(c.inicio),
        "Fim da substituição": fmt(c.fim),
        "Supervisor responsável": c.supervisor,
        "Substituto / reserva": c.substituto,
        "ID NEXTI (substituto)": c.substituto_person_id ?? "",
        "Recebeu V.T.": c.recebeu_vt,
        "Recebeu refeição": c.recebeu_refeicao,
        "Valor a receber": c.valor_receber,
        "Data de recebimento": fmt(c.recebido_em),
        "Enviado por": c.enviado_por_nome || c.supervisor || "",
        "Data de envio": fmt(c.created_at),
        "Lançado por": c.lancado_por_nome ?? "",
        "Lançado em": fmt(c.lancado_em),
      }));
      const ws = XLSX.utils.json_to_sheet(linhas);
      ws["!cols"] = Object.keys(linhas[0] ?? {}).map((k) => ({
        wch: Math.min(40, Math.max(14, k.length + 4)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CRT");
      const hoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `relatorio-crt-${hoje}.xlsx`);
      toast.success(`Relatório gerado com ${linhas.length} registro(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="hero-surface border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Link
            to="/coordenacao"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar à Coordenação
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <ClipboardList className="size-8 text-primary" />
            CRT enviados para lançamento
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Registros de reserva técnica enviados pela supervisão. Gere o formulário em PDF para
            assinatura.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-primary" />
              <div>
                <CardTitle className="text-base">Filtros</CardTitle>
                <CardDescription className="text-xs">
                  Filtre por data de envio e quem enviou
                </CardDescription>
              </div>
            </div>
            {filtrosAtivos && (
              <Button variant="ghost" size="sm" onClick={limparFiltros}>
                <X className="size-4" /> Limpar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Data de envio</label>
                <Input
                  type="date"
                  value={filtroDataEnvio}
                  onChange={(e) => setFiltroDataEnvio(e.target.value)}
                  disabled={carregando}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Quem enviou</label>
                <Select value={filtroEnviadoPor} onValueChange={setFiltroEnviadoPor}>
                  <SelectTrigger disabled={carregando || enviadosPor.length === 0}>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {enviadosPor.map((nome) => (
                      <SelectItem key={nome} value={nome}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="lancamentos-recebidos" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <h2 id="lancamentos-recebidos" className="text-base font-semibold">
                Lançamentos recebidos
              </h2>
              <p className="text-xs text-muted-foreground">
                {lancamentosFiltrados.length} de {lancamentos.length} registro(s)
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 sm:flex sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportarTodos()}
                disabled={carregando || exportandoPdfs || lancamentosFiltrados.length === 0}
              >
                {exportandoPdfs ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
                Exportar todos (PDF)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportarExcel()}
                disabled={carregando || exportando || lancamentosFiltrados.length === 0}
              >
                {exportando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" />
                )}
                Relatório em Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void carregar()}
                disabled={carregando}
              >
                {carregando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Atualizar
              </Button>
            </div>
          </div>

          {carregando ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : lancamentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum CRT enviado pela supervisão até agora.
            </p>
          ) : lancamentosFiltrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum registro corresponde aos filtros selecionados.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {lancamentosFiltrados.map((crt) => (
                <Card key={crt.id} className="flex min-h-full flex-col border-border bg-card">
                  <CardHeader className="border-b border-border pb-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <ClipboardList className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <CardTitle className="break-words text-sm uppercase">
                            {crt.colaborador}
                          </CardTitle>
                          <CardDescription className="mt-1 break-words text-xs">
                            CRT enviado em {fmt(crt.created_at)}
                          </CardDescription>
                        </div>
                      </div>
                      <span
                        className={
                          crt.status === "lancado"
                            ? "shrink-0 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary"
                            : "shrink-0 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground"
                        }
                      >
                        {crt.status === "lancado" ? "Lançado" : "Pendente"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pt-4">
                    <dl className="grid gap-3 text-xs">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <dt className="font-semibold text-foreground">Posto</dt>
                          <dd className="break-words text-muted-foreground">
                            {crt.posto_nome || "—"}
                          </dd>
                        </div>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <dt className="font-semibold text-foreground">Período da substituição</dt>
                          <dd className="break-words text-muted-foreground">
                            {fmt(crt.inicio)} até {fmt(crt.fim)}
                          </dd>
                        </div>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                        <ClipboardList className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <dt className="font-semibold text-foreground">Motivo</dt>
                          <dd className="break-words text-muted-foreground">{crt.motivo || "—"}</dd>
                        </div>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                        <UserRound className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <dt className="font-semibold text-foreground">Enviado por</dt>
                          <dd className="break-words text-muted-foreground">
                            {crt.enviado_por_nome || crt.supervisor || "—"}
                          </dd>
                        </div>
                      </div>
                      {crt.status === "lancado" && crt.lancado_por_nome && (
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <dt className="font-semibold text-foreground">Lançado por</dt>
                            <dd className="break-words text-muted-foreground">
                              {crt.lancado_por_nome} em {fmt(crt.lancado_em)}
                            </dd>
                          </div>
                        </div>
                      )}
                    </dl>
                  </CardContent>
                  <CardFooter className="grid grid-cols-2 gap-2 border-t border-border p-4">
                    <Button size="sm" variant="secondary" onClick={() => gerarPdfCrt(crt)}>
                      <FileDown className="size-4" /> Gerar PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void marcarLancado(crt)}>
                      <CheckCircle2 className="size-4" />
                      {crt.status === "lancado" ? "Reabrir" : "Lançar"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <FloatingNav />
    </main>
  );
}
