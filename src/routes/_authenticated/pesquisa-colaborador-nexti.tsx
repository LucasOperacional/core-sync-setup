import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, RefreshCw, Search, UserSearch } from "lucide-react";

import { pesquisarColaboradoresNexti, type ColaboradorNexti } from "@/lib/nexti-ativos.functions";
import { FloatingNav } from "@/components/FloatingNav";

export const Route = createFileRoute("/_authenticated/pesquisa-colaborador-nexti")({
  head: () => ({
    meta: [
      { title: "Pesquisar Colaborador · NEXTI" },
      { name: "description", content: "Busca detalhada de colaboradores integrada com a NEXTI." },
    ],
  }),
  component: PesquisaColaboradorNextiPage,
});

const SINC_AUTO_MS = 5 * 60 * 1000;

function PesquisaColaboradorNextiPage() {
  const router = useRouter();
  const pesquisar = useServerFn(pesquisarColaboradoresNexti);

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ColaboradorNexti[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(false);
  const pedidoRef = useRef(0);

  const executar = useCallback(
    async (texto: string, forcarSincronizar = false) => {
      const alvo = texto.trim();
      if (!forcarSincronizar && alvo.length < 2) {
        setResultados([]);
        setTotal(0);
        setBuscou(false);
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
        setBuscou(alvo.length >= 2);
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

  // Sincroniza com a NEXTI automaticamente ao abrir a tela e a cada 5 min.
  useEffect(() => {
    void executar("", true);
    const intervalo = setInterval(() => void executar("", true), SINC_AUTO_MS);
    return () => clearInterval(intervalo);
  }, [executar]);

  // Busca automática enquanto digita (com debounce)
  useEffect(() => {
    const t = setTimeout(() => void executar(termo), 450);
    return () => clearTimeout(t);
  }, [termo, executar]);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12 pb-32">
      <div className="w-full max-w-5xl flex justify-end">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      </div>

      <header className="mb-8 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <UserSearch className="size-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">Pesquisar Colaborador</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Consulte colaboradores, cargos, postos e empresas diretamente integrados com a NEXTI.
        </p>
      </header>

      <section className="w-full max-w-5xl rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-7 space-y-5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-500 delay-100">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Parâmetros de Busca</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sincronização automática com a NEXTI a cada 5 min.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void executar(termo, true)}
            disabled={sincronizando}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {sincronizando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sincronizar
          </button>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite o nome do colaborador…"
            className="w-full rounded-xl border border-input bg-background py-3.5 pl-11 pr-11 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {carregando ? (
            <Loader2 className="absolute right-3.5 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </label>

        {sincronizadoEm ? (
          <p className="text-[11px] text-muted-foreground">
            Última sincronização com NEXTI em {new Date(sincronizadoEm).toLocaleString("pt-BR")}
          </p>
        ) : null}

        {erro ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            {erro}
          </p>
        ) : null}

        {resultados.length > 0 ? (
          <div className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              {total} colaborador(es) encontrado(s)
              {total > resultados.length ? ` · mostrando os ${resultados.length} primeiros` : ""}
            </p>
            <div className="max-h-[500px] overflow-auto rounded-xl border border-border bg-black/40 shadow-inner">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-black/70 backdrop-blur-md">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    <th className="px-4 py-3.5 font-semibold">Colaborador</th>
                    <th className="px-4 py-3.5 font-semibold">Cargo</th>
                    <th className="px-4 py-3.5 font-semibold">Posto</th>
                    <th className="px-4 py-3.5 font-semibold">Empresa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {resultados.map((c, i) => (
                    <tr
                      key={`${c.colaborador}-${c.matricula}-${i}`}
                      className="align-top transition-colors hover:bg-white/5"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{c.colaborador}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.cargo || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.posto || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.empresa || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : buscou && !carregando && !erro ? (
          <p className="rounded-xl border border-border bg-secondary/30 p-8 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado com "
            <span className="font-semibold text-foreground">{termo}</span>" na NEXTI.
          </p>
        ) : null}
      </section>

      <FloatingNav />
    </main>
  );
}
