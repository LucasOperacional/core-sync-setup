import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  DOMINIO_EMAIL,
  REGISTROS_ESPERADOS,
  restaurarDominioEmail,
  salvarDominioEmail,
  verificarDominioEmail,
  type ResultadoRegistro,
} from "@/lib/email-dominio.functions";

const inicial: ResultadoRegistro[] = REGISTROS_ESPERADOS.map((r) => ({
  ...r,
  encontrado: false,
  observado: [],
}));

export function DominioEmailCard() {
  const verificar = useServerFn(verificarDominioEmail);
  const salvar = useServerFn(salvarDominioEmail);
  const restaurar = useServerFn(restaurarDominioEmail);
  const [registros, setRegistros] = useState<ResultadoRegistro[]>(inicial);
  const [situacao, setSituacao] = useState<"pendente" | "publicado" | "desconhecida">(
    "desconhecida",
  );
  const [verificando, setVerificando] = useState(false);
  const [ultima, setUltima] = useState<string | null>(null);
  const [dominio, setDominio] = useState(DOMINIO_EMAIL);
  const [remetente, setRemetente] = useState(`noreply@${DOMINIO_EMAIL}`);
  const [personalizado, setPersonalizado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoDominio, setNovoDominio] = useState("");
  const [novoToken, setNovoToken] = useState("");
  const [salvando, setSalvando] = useState(false);

  const rodar = useCallback(
    async (manual = false) => {
      setVerificando(true);
      try {
        const r = await verificar({});
        setRegistros(r.registros);
        setSituacao(r.situacao);
        setDominio(r.dominio);
        setRemetente(r.remetente);
        setPersonalizado(r.personalizado);
        setUltima(new Date(r.verificadoEm).toLocaleString("pt-BR"));
        if (manual) {
          if (r.situacao === "publicado") {
            toast.success("Registros do domínio encontrados no DNS.");
          } else {
            toast.warning("Ainda faltam registros no seu provedor de DNS.");
          }
        }
      } catch {
        if (manual) toast.error("Não foi possível conferir o domínio agora.");
      } finally {
        setVerificando(false);
      }
    },
    [verificar],
  );

  useEffect(() => {
    void rodar(false);
  }, [rodar]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mail className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Configuração do domínio de e-mail</h2>
          <p className="text-xs text-muted-foreground">
            Domínio de envio <strong>{dominio}</strong> · remetente {remetente}
            {personalizado && " · definido manualmente"}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            situacao === "publicado"
              ? "bg-emerald-500/15 text-emerald-400"
              : situacao === "pendente"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {situacao === "publicado" ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
          {situacao === "publicado"
            ? "Registros publicados"
            : situacao === "pendente"
              ? "Aguardando DNS"
              : "Conferindo..."}
        </span>
        <button
          type="button"
          onClick={() => void rodar(true)}
          disabled={verificando}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          {verificando ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Conferir agora
        </button>
        <button
          type="button"
          onClick={() => {
            setNovoDominio(dominio);
            setNovoToken("");
            setEditando((v) => !v);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Pencil className="size-3.5" />
          {editando ? "Cancelar" : "Alterar domínio"}
        </button>
      </div>

      {editando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setSalvando(true);
              try {
                await salvar({ data: { dominio: novoDominio, token: novoToken } });
                toast.success("Domínio atualizado.");
                setEditando(false);
                await rodar(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
              } finally {
                setSalvando(false);
              }
            })();
          }}
          className="mt-4 grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-2"
        >
          <label className="text-xs font-medium">
            Domínio de envio
            <input
              value={novoDominio}
              onChange={(e) => setNovoDominio(e.target.value)}
              placeholder="notify.email.suaempresa.com.br"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <label className="text-xs font-medium">
            Código de verificação (opcional)
            <input
              value={novoToken}
              onChange={(e) => setNovoToken(e.target.value)}
              placeholder="lovable_email_verify=..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {salvando ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Salvar domínio
            </button>
            {personalizado && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => {
                  void (async () => {
                    setSalvando(true);
                    try {
                      await restaurar({});
                      toast.success("Domínio padrão restaurado.");
                      setEditando(false);
                      await rodar(false);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Não foi possível restaurar.",
                      );
                    } finally {
                      setSalvando(false);
                    }
                  })();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
              >
                <RotateCcw className="size-3.5" />
                Voltar ao padrão
              </button>
            )}
          </div>
        </form>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Adicione os registros abaixo no provedor de DNS de <strong>{dominio}</strong>. Depois de
        publicados, o envio automático de e-mails do sistema começa a funcionar.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Nome</th>
              <th className="py-2 pr-3 font-medium">Valor</th>
              <th className="py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={`${r.tipo}-${r.valor}`} className="border-t border-border/60 align-top">
                <td className="py-2 pr-3 font-mono">{r.tipo}</td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => void copiar(r.host)}
                    className="inline-flex items-center gap-1 break-all font-mono hover:text-primary"
                  >
                    {r.host} <Copy className="size-3 shrink-0" />
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => void copiar(r.valor)}
                    className="inline-flex items-center gap-1 break-all font-mono hover:text-primary"
                  >
                    {r.valor} <Copy className="size-3 shrink-0" />
                  </button>
                </td>
                <td className="py-2">
                  {r.encontrado ? (
                    <span className="text-emerald-400">Publicado</span>
                  ) : (
                    <span className="text-amber-400">Pendente</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ultima && (
        <p className="mt-3 text-[11px] text-muted-foreground">Última conferência: {ultima}</p>
      )}
    </section>
  );
}
