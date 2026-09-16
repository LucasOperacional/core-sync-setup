import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Clock, Loader2, Search, XCircle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/validar-movimentacao")({
  validateSearch: (search) => z.object({ p: z.string().optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Validar comprovante de movimentação de posto" },
      {
        name: "description",
        content:
          "Confira a autenticidade de um comprovante de movimentação de posto pelo protocolo ou QR Code.",
      },
      { property: "og:title", content: "Validar comprovante de movimentação" },
      {
        property: "og:description",
        content: "Verifique protocolo, status e autorização de uma movimentação de posto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ValidarMovimentacaoPage,
});

interface Resultado {
  protocolo: string;
  status: "pendente" | "aprovada" | "recusada";
  colaborador: string;
  cargo: string | null;
  postoAtual: string;
  novoPosto: string;
  dataMovimentacao: string;
  solicitadoEm: string;
  decididoEm: string | null;
  enviadoNexti: boolean;
  assinado: boolean;
  autentico: boolean;
}

function fmt(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : v.length === 10
      ? d.toLocaleDateString("pt-BR")
      : d.toLocaleString("pt-BR");
}

function ValidarMovimentacaoPage() {
  const { p } = Route.useSearch();
  const [protocolo, setProtocolo] = useState(p ?? "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function consultar(valor: string) {
    const limpo = valor.trim().toUpperCase();
    if (!limpo) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const resposta = await fetch(
        `/api/public/movimentacao/validar?p=${encodeURIComponent(limpo)}`,
      );
      const dados = (await resposta.json()) as Resultado & { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro || "Não foi possível validar.");
      setResultado(dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível validar.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (p) void consultar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const Icone =
    resultado?.status === "aprovada"
      ? CheckCircle2
      : resultado?.status === "recusada"
        ? XCircle
        : Clock;
  const cor =
    resultado?.status === "aprovada"
      ? "text-success"
      : resultado?.status === "recusada"
        ? "text-destructive"
        : "text-muted-foreground";
  const rotulo =
    resultado?.status === "aprovada"
      ? "Movimentação autorizada e enviada à NEXTI"
      : resultado?.status === "recusada"
        ? "Movimentação recusada pela coordenação"
        : "Aguardando autorização da coordenação";

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ArrowRightLeft className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Validar movimentação de posto</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Informe o protocolo impresso no comprovante ou leia o QR Code.
          </p>
        </header>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void consultar(protocolo);
          }}
        >
          <Input
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value)}
            placeholder="MOV-AAAAMMDD-XXXXXX"
            className="uppercase"
          />
          <Button type="submit" disabled={carregando}>
            {carregando ? <Loader2 className="animate-spin" /> : <Search />} Validar
          </Button>
        </form>
        {erro ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        {resultado ? (
          <section className="rounded-lg border border-border bg-card p-5 text-sm">
            <p className={`flex items-center gap-2 font-semibold ${cor}`}>
              <Icone className="size-5" /> {rotulo}
            </p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Protocolo</dt>
                <dd className="font-mono">{resultado.protocolo}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Colaborador</dt>
                <dd>{resultado.colaborador}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Cargo</dt>
                <dd>{resultado.cargo ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Data</dt>
                <dd>{fmt(resultado.dataMovimentacao)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Posto atual</dt>
                <dd>{resultado.postoAtual}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Novo posto</dt>
                <dd>{resultado.novoPosto}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Solicitado em</dt>
                <dd>{fmt(resultado.solicitadoEm)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Decisão em</dt>
                <dd>{fmt(resultado.decididoEm)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">
                  Assinatura do colaborador
                </dt>
                <dd>{resultado.assinado ? "Registrada" : "Não registrada"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Envio à NEXTI</dt>
                <dd>{resultado.enviadoNexti ? "Confirmado" : "Não enviado"}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>
    </main>
  );
}
