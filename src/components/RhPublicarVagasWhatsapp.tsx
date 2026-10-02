import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VagaSolicitacao } from "@/lib/vagas-aprovacao.functions";
import {
  rhPublicarVagaGrupos,
  rhWhatsappListarGrupos,
  rhWhatsappSalvarGrupos,
  rhWhatsappSelecionarInstancia,
  rhWhatsappStatus,
  type RhGrupo,
  type RhInstancia,
} from "@/lib/rh-whatsapp.functions";

function textoVaga(v: VagaSolicitacao): string {
  const l = [
    `📢 *VAGA ABERTA — ${(v.cargo || "").toUpperCase()}*`,
    "",
    v.posto ? `📍 Posto: ${v.posto}` : "",
    v.localidade ? `🏙️ Local: ${v.localidade}` : "",
    v.horario ? `🕒 Horário: ${v.horario}` : "",
    v.salario ? `💰 Salário: ${v.salario}` : "",
    v.data_inicio ? `📅 Início: ${v.data_inicio}` : "",
    v.atividade ? `\n📝 Atividades: ${v.atividade}` : "",
    v.perfil ? `👤 Perfil: ${v.perfil}` : "",
    "",
    "Interessados, enviem o currículo ao RH.",
  ];
  return l.filter((x) => x !== "").join("\n");
}

export function RhPublicarVagasWhatsapp({ vagas }: { vagas: VagaSolicitacao[] }) {
  const status = useServerFn(rhWhatsappStatus);
  const selecionar = useServerFn(rhWhatsappSelecionarInstancia);
  const listarGrupos = useServerFn(rhWhatsappListarGrupos);
  const salvarGrupos = useServerFn(rhWhatsappSalvarGrupos);
  const publicar = useServerFn(rhPublicarVagaGrupos);

  const [instancias, setInstancias] = useState<RhInstancia[]>([]);
  const [instancia, setInstancia] = useState("");
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<RhGrupo[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [vagaId, setVagaId] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const abertas = useMemo(
    () => vagas.filter((v) => v.status !== "recusada" && v.status !== "fechada"),
    [vagas],
  );

  const carregarStatus = useCallback(async () => {
    const r = await status();
    setInstancias(r.instancias);
    setInstancia(r.instancia);
    setErroConexao(r.ok ? null : (r.erro ?? "Falha na conexão."));
    if (r.grupos.length) {
      setGrupos(r.grupos);
      setMarcados(new Set(r.grupos.map((g) => g.jid)));
    }
  }, [status]);

  useEffect(() => {
    void carregarStatus().catch(() => setErroConexao("Falha ao consultar a conexão."));
  }, [carregarStatus]);

  async function trocarInstancia(nome: string) {
    setInstancia(nome);
    await selecionar({ data: { nome } });
    toast.success(`Instância do RH: ${nome}`);
  }

  async function buscarGrupos() {
    setCarregandoGrupos(true);
    try {
      const r = await listarGrupos();
      if (!r.ok) throw new Error(r.erro);
      setGrupos(r.grupos);
      toast.success(`${r.grupos.length} grupo(s) encontrados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível listar os grupos.");
    } finally {
      setCarregandoGrupos(false);
    }
  }

  function alternar(jid: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(jid)) n.delete(jid);
      else n.add(jid);
      return n;
    });
  }

  async function guardarSelecao() {
    const sel = grupos.filter((g) => marcados.has(g.jid));
    await salvarGrupos({ data: { grupos: sel } });
    toast.success(`${sel.length} grupo(s) salvos como padrão do RH.`);
  }

  function escolherVaga(id: string) {
    setVagaId(id);
    const v = abertas.find((x) => x.id === id);
    setTexto(v ? textoVaga(v) : "");
  }

  async function enviar() {
    const jids = [...marcados];
    if (!texto.trim()) return toast.error("Escreva a mensagem da vaga.");
    if (jids.length === 0) return toast.error("Selecione ao menos um grupo.");
    if (!window.confirm(`Publicar esta vaga em ${jids.length} grupo(s)?`)) return;
    setEnviando(true);
    try {
      const r = await publicar({ data: { texto, jids } });
      const falhas = r.resultados.filter((x) => !x.ok);
      if (falhas.length === 0) toast.success(`Vaga publicada em ${r.enviados} grupo(s).`);
      else
        toast.warning(`Publicada em ${r.enviados} grupo(s); ${falhas.length} falharam.`, {
          description: falhas[0]?.erro,
        });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar.");
    } finally {
      setEnviando(false);
    }
  }

  const atual = instancias.find((i) => i.nome === instancia);

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold uppercase">
            <MessageCircle className="size-5 text-primary" />
            Publicar vagas nos grupos do WhatsApp
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Conexão do RH com o WhatsApp (Evolution). Escolha o número, os grupos e publique.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            atual?.conectada
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {atual?.conectada ? "Conectado" : "Desconectado"}
        </span>
      </div>

      {erroConexao && <p className="text-sm text-destructive">{erroConexao}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Número / instância do RH</span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={instancia}
            onChange={(e) => void trocarInstancia(e.target.value)}
          >
            <option value="">Selecione...</option>
            {instancias.map((i) => (
              <option key={i.nome} value={i.nome}>
                {i.nome} {i.conectada ? "• conectada" : "• desconectada"}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Vaga para publicar</span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={vagaId}
            onChange={(e) => escolherVaga(e.target.value)}
          >
            <option value="">Selecione uma vaga aberta...</option>
            {abertas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.cargo} — {v.posto || v.localidade || "sem posto"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            Grupos ({marcados.size} selecionado(s))
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void buscarGrupos()} disabled={carregandoGrupos || !instancia}>
              {carregandoGrupos ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Buscar grupos
            </Button>
            <Button variant="outline" size="sm" onClick={() => void guardarSelecao()} disabled={grupos.length === 0}>
              Salvar seleção
            </Button>
          </div>
        </div>
        {grupos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Clique em "Buscar grupos" para listar os grupos do número conectado.
          </p>
        ) : (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {grupos.map((g) => (
              <label key={g.jid} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={marcados.has(g.jid)} onChange={() => alternar(g.jid)} />
                <span className="truncate">{g.nome}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Textarea
        rows={9}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Selecione uma vaga ou escreva a mensagem..."
      />

      <Button onClick={() => void enviar()} disabled={enviando} className="gap-2">
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Publicar nos grupos
      </Button>
    </section>
  );
}
