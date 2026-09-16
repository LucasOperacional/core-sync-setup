import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarDays,
  Check,
  Clock,
  FileDown,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Terminal,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { FloatingNav } from "@/components/FloatingNav";
import {
  capturarIpLocal,
  GerarComprovanteAuditoriaCard,
  type RegistroAuditoria,
} from "@/components/GerarComprovanteAuditoriaCard";
import { RelatorioMovimentacoesCard } from "@/components/RelatorioMovimentacoesCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  autorizarMovimentacaoPosto,
  listarMovimentacoesPosto,
  type MovimentacaoPosto,
} from "@/lib/movimentacao-posto.functions";
import { baixarComprovanteMovimentacao } from "@/lib/movimentacao-comprovante";

export const Route = createFileRoute("/_authenticated/coordenacao-movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações de posto | Coordenação" },
      {
        name: "description",
        content:
          "Autorize ou recuse as movimentações de posto enviadas pela supervisão e emita o comprovante com QR Code.",
      },
      { property: "og:title", content: "Movimentações de posto | Coordenação" },
      { property: "og:description", content: "Aceite ou recuse movimentações e envie à NEXTI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoordenacaoMovimentacoesPage,
});

function fmt(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : v.length === 10
      ? d.toLocaleDateString("pt-BR")
      : d.toLocaleString("pt-BR");
}

const STATUS = {
  pendente: { label: "Pendente", classe: "bg-muted text-muted-foreground", Icone: Clock },
  aprovada: { label: "Aprovada · NEXTI", classe: "bg-success/15 text-success", Icone: Check },
  recusada: { label: "Recusada", classe: "bg-destructive/15 text-destructive", Icone: XCircle },
} as const;

function CoordenacaoMovimentacoesPage() {
  const listar = useServerFn(listarMovimentacoesPosto);
  const autorizar = useServerFn(autorizarMovimentacaoPosto);
  const [itens, setItens] = useState<MovimentacaoPosto[]>([]);
  const [podeAutorizar, setPodeAutorizar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [processando, setProcessando] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [auditoria, setAuditoria] = useState<RegistroAuditoria | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listar({});
      if (!r.ok) toast.error(r.erro ?? "Não foi possível carregar as movimentações.");
      setItens(r.movimentacoes);
      setPodeAutorizar(r.podeAutorizar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(
    () => itens.filter((m) => filtroStatus === "todas" || m.status === filtroStatus),
    [itens, filtroStatus],
  );
  const pendentes = itens.filter((m) => m.status === "pendente").length;

  async function decidir(mov: MovimentacaoPosto, decisao: "aceitar" | "recusar") {
    setProcessando(mov.id);
    setLogs((atual) => ({ ...atual, [mov.id]: ["Enviando solicitação..."] }));
    try {
      const r = await autorizar({
        data: { id: mov.id, decisao, motivoRecusa: decisao === "recusar" ? motivoRecusa : "" },
      });
      setLogs((atual) => ({ ...atual, [mov.id]: r.log ?? [] }));
      if (!r.ok) {
        setLogs((atual) => ({ ...atual, [mov.id]: [...(r.log ?? []), `Erro: ${r.erro}`] }));
        toast.error(r.erro);
        return;
      }
      setItens((atual) => atual.map((m) => (m.id === mov.id ? r.movimentacao : m)));
      setRecusando(null);
      setMotivoRecusa("");
      const dataHora = new Date().toLocaleString("pt-BR");
      const descricao = `${mov.colaborador}: ${mov.posto_atual} → ${mov.novo_posto} (${decisao === "aceitar" ? "autorizada" : "recusada"})`;
      void capturarIpLocal()
        .then(({ ip, local }) => setAuditoria({ dataHora, ip, local, descricao }))
        .catch(() =>
          setAuditoria({ dataHora, ip: "Não identificado", local: "Indisponível", descricao }),
        );
      toast.success(
        decisao === "aceitar"
          ? "Movimentação autorizada e enviada à NEXTI."
          : "Movimentação recusada.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao processar.";
      setLogs((atual) => ({ ...atual, [mov.id]: [...(atual[mov.id] ?? []), `Erro: ${msg}`] }));
      toast.error(msg);
    } finally {
      setProcessando(null);
    }
  }

  async function comprovante(mov: MovimentacaoPosto) {
    try {
      await baixarComprovanteMovimentacao(mov);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o comprovante.");
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
            <ArrowLeft className="size-3.5" /> Coordenação
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <ArrowRightLeft className="size-8 text-primary" /> Movimentações de posto
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pendentes} movimentação(ões) aguardando autorização. Somente coordenadores e
            administradores podem enviar à NEXTI.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
        {!podeAutorizar && !carregando ? (
          <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <ShieldAlert className="size-4" /> Seu perfil pode consultar as movimentações, mas
            apenas coordenadores e administradores podem aceitar ou recusar.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="recusada">Recusadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => void carregar()}
            disabled={carregando}
          >
            {carregando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
        </div>

        {carregando && itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma movimentação neste filtro.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((mov) => {
              const st = STATUS[mov.status];
              const ocupado = processando === mov.id;
              return (
                <Card key={mov.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <UserRound className="size-4 text-primary" /> {mov.colaborador}
                      </CardTitle>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st.classe}`}
                      >
                        <st.Icone className="size-3" /> {st.label}
                      </span>
                    </div>
                    <CardDescription className="font-mono text-xs">
                      {mov.protocolo}
                      {mov.cargo ? ` · ${mov.cargo}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2 text-sm">
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="text-muted-foreground">De:</span> {mov.posto_atual}
                        <br />
                        <span className="text-muted-foreground">Para:</span> {mov.novo_posto}
                      </span>
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-muted-foreground" />{" "}
                      {fmt(mov.data_movimentacao)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Motivo:</span> {mov.motivo}
                    </p>
                    {mov.validacao_detalhe ? (
                      <p className="rounded-md border border-success/30 bg-success/10 p-2 text-xs text-success">
                        {mov.validacao_detalhe}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Enviado por {mov.criado_por_nome ?? "—"} em {fmt(mov.created_at)}
                    </p>
                    {mov.status !== "pendente" ? (
                      <p className="text-xs text-muted-foreground">
                        {mov.status === "aprovada" ? "Autorizado" : "Recusado"} por{" "}
                        {mov.aprovado_por_nome ?? "—"} em {fmt(mov.aprovado_em)}
                        {mov.nexti_transfer_id ? ` · NEXTI nº ${mov.nexti_transfer_id}` : ""}
                      </p>
                    ) : null}
                    {mov.motivo_recusa ? (
                      <p className="text-xs text-destructive">
                        Motivo da recusa: {mov.motivo_recusa}
                      </p>
                    ) : null}
                    {mov.assinatura_colaborador ? (
                      <img
                        src={mov.assinatura_colaborador}
                        alt={`Assinatura de ${mov.colaborador}`}
                        className="h-16 rounded-md border border-border bg-white object-contain px-2"
                      />
                    ) : null}
                    {recusando === mov.id ? (
                      <Textarea
                        value={motivoRecusa}
                        onChange={(e) => setMotivoRecusa(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Motivo da recusa (opcional)"
                      />
                    ) : null}
                    {(logs[mov.id]?.length ?? 0) > 0 ? (
                      <div className="rounded-md border border-border bg-muted/40 p-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                          <Terminal className="size-3.5" /> Log do processo
                          {ocupado ? <Loader2 className="size-3 animate-spin" /> : null}
                        </p>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto font-mono text-[11px] leading-snug text-muted-foreground">
                          {logs[mov.id]?.map((linha, i) => (
                            <li
                              key={`${mov.id}-log-${i}`}
                              className={
                                linha.startsWith("Erro") ||
                                linha.includes("Falha") ||
                                linha.includes("recusada:")
                                  ? "text-destructive"
                                  : undefined
                              }
                            >
                              {linha}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void comprovante(mov)}
                    >
                      <FileDown /> Comprovante
                    </Button>
                    {podeAutorizar && mov.status === "pendente" ? (
                      recusando === mov.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={ocupado}
                            onClick={() => void decidir(mov, "recusar")}
                          >
                            {ocupado ? <Loader2 className="animate-spin" /> : <X />} Confirmar
                            recusa
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={ocupado}
                            onClick={() => {
                              setRecusando(null);
                              setMotivoRecusa("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={ocupado}
                            onClick={() => void decidir(mov, "aceitar")}
                          >
                            {ocupado ? <Loader2 className="animate-spin" /> : <Check />} Aceitar e
                            enviar à NEXTI
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={ocupado}
                            onClick={() => {
                              setRecusando(mov.id);
                              setMotivoRecusa("");
                            }}
                          >
                            <X /> Recusar
                          </Button>
                        </>
                      )
                    ) : null}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <GerarComprovanteAuditoriaCard registro={auditoria} />
        </div>

        <RelatorioMovimentacoesCard />
      </div>
      <FloatingNav />
    </main>
  );
}
