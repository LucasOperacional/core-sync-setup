import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, ShieldCheck, XCircle } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/validar")({
  validateSearch: (search) => z.object({ p: z.string().optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Validar documento assinado | Protocolo e QR Code" },
      {
        name: "description",
        content:
          "Confira a autenticidade de um documento assinado eletronicamente pelo número de protocolo ou pelo QR Code impresso no certificado.",
      },
      { property: "og:title", content: "Validar documento assinado" },
      {
        property: "og:description",
        content: "Verifique protocolo, hash SHA-256 e signatários de um documento assinado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ValidarPage,
});

interface Resultado {
  protocolo: string;
  titulo: string;
  status: string;
  hash: string | null;
  emitidoEm: string;
  concluidoEm: string | null;
  autentico: boolean;
  signatarios: Array<{ nome: string; status: string; assinadoEm: string | null }>;
  observacao: string;
}

const ROTULO: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  visualizado: "Visualizado",
  aguardando_assinatura: "Aguardando assinatura",
  assinado_parcialmente: "Assinado parcialmente",
  concluido: "Concluído",
  recusado: "Recusado",
  cancelado: "Cancelado",
  expirado: "Expirado",
  assinado: "Assinado",
};

function formatar(data: string | null): string {
  if (!data) return "—";
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? data : d.toLocaleString("pt-BR");
}

function ValidarPage() {
  const { p } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [protocolo, setProtocolo] = useState(p ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function consultar(valor: string) {
    const limpo = valor.trim().toUpperCase();
    if (!limpo) return;
    setOcupado(true);
    setErro("");
    setResultado(null);
    try {
      const resposta = await fetch(`/api/public/assinatura/validar?p=${encodeURIComponent(limpo)}`);
      const dados = (await resposta.json()) as Resultado & { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro || "Não foi possível validar.");
      setResultado(dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível validar.");
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    if (p) {
      setProtocolo(p);
      void consultar(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-500">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-bold">Validação de documento assinado</h1>
            <p className="text-xs text-muted-foreground">
              Confira a autenticidade pelo protocolo ou QR Code
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ search: { p: protocolo.trim().toUpperCase() }, replace: true });
            void consultar(protocolo);
          }}
        >
          <input
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value.toUpperCase())}
            placeholder="ASS-AAAAMMDD-XXXXXX"
            aria-label="Número do protocolo"
            className="w-full rounded-xl border border-input bg-card px-3 py-3 font-mono text-base"
          />
          <button
            type="submit"
            disabled={ocupado}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Validar
          </button>
        </form>

        {erro && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
            <XCircle className="mx-auto size-9 text-red-500" />
            <p className="mt-2 text-sm font-semibold">{erro}</p>
          </section>
        )}

        {resultado && (
          <section className="space-y-4">
            <div
              className={`rounded-2xl border p-5 text-center ${
                resultado.autentico
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              }`}
            >
              {resultado.autentico ? (
                <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
              ) : (
                <XCircle className="mx-auto size-12 text-amber-500" />
              )}
              <h2 className="mt-2 text-lg font-bold">
                {resultado.autentico
                  ? "Documento autêntico e concluído"
                  : `Documento encontrado — ${ROTULO[resultado.status] ?? resultado.status}`}
              </h2>
              <p className="text-sm text-muted-foreground">{resultado.titulo}</p>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Protocolo</dt>
                <dd className="font-mono font-semibold">{resultado.protocolo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd className="font-semibold">{ROTULO[resultado.status] ?? resultado.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Emitido em</dt>
                <dd>{formatar(resultado.emitidoEm)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Concluído em</dt>
                <dd>{formatar(resultado.concluidoEm)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">
                  Hash SHA-256 do arquivo PDF final (com certificado)
                </dt>
                <dd className="break-all font-mono text-xs">{resultado.hash ?? "—"}</dd>
              </div>
            </dl>

            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-bold">Signatários</h3>
              <ul className="divide-y divide-border text-sm">
                {resultado.signatarios.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span>{s.nome}</span>
                    <span className="text-right text-xs text-muted-foreground">
                      {ROTULO[s.status] ?? s.status}
                      {s.assinadoEm ? ` · ${formatar(s.assinadoEm)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">{resultado.observacao}</p>
          </section>
        )}
      </div>
    </main>
  );
}
