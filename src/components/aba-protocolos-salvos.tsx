import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessao, useIsAdmin } from "@/hooks/use-sessao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { abrirProtocoloPdf } from "@/lib/protocolo-pdf";
import { buscarTudoPaginado } from "@/lib/supabase-paginacao";

import {
  analisarHorasExtras,
  montarPdfHorasExtras,
  separarHorasExtrasEmNovosProtocolos,
  type ResultadoAnalise,
} from "@/lib/horas-extras-separar";
import { ServerFunctionAwareInlineError } from "@/components/server-function-refresh-notice";
import {
  invalidarConsultasProtocoloFolhas,
  notificarAtualizacaoProtocoloFolhas,
  protocoloFolhasQueryKeys,
} from "@/lib/protocolo-folhas-sync";

type FolhaResumo = {
  protocolo_id: string;
  ordem: number;
  colaborador: string;
  empresa: string;
  cargo: string;
};

type ProtocoloBase = {
  id: string;
  titulo: string;
  empresa: string | null;
  observacoes: string | null;
  data_entrega: string;
  created_at: string;
  profiles: { nome: string | null; email: string | null } | null;
};

type Linha = ProtocoloBase & {
  protocolo_folhas: { count: number }[];
  protocolo_folhas_lista: FolhaResumo[];
};

/** Data em pt-BR tolerante a valores nulos ou inválidos (evita "Invalid Date"). */
function dataBr(valor: string | null | undefined, comHora = false): string {
  if (!valor) return "—";
  const iso = valor.length <= 10 ? `${valor}T12:00:00` : valor;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return comHora ? d.toLocaleString("pt-BR") : d.toLocaleDateString("pt-BR");
}

function useRelogioBrasilia() {
  const [agora, setAgora] = useState(() =>
    new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  );
  useEffect(() => {
    const intervalo = setInterval(() => {
      setAgora(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    }, 1000);
    return () => clearInterval(intervalo);
  }, []);
  return agora;
}

export function AbaProtocolosSalvos() {
  const { user } = useSessao();
  const { data: ehAdmin } = useIsAdmin(user);
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaColaborador, setBuscaColaborador] = useState("");
  const [extras, setExtras] = useState<ResultadoAnalise | null>(null);
  const [analisandoExtras, setAnalisandoExtras] = useState(false);
  const [progressoExtras, setProgressoExtras] = useState("");
  const [gerandoExtras, setGerandoExtras] = useState<string | null>(null);
  const relogio = useRelogioBrasilia();

  const { data, isLoading, error } = useQuery({
    queryKey: protocoloFolhasQueryKeys.protocolos,
    queryFn: async () => {
      const bases = (await buscarTudoPaginado<ProtocoloBase>((inicio, fim) =>
        supabase
          .from("protocolos")
          .select(
            "id, titulo, empresa, observacoes, data_entrega, created_at, profiles(nome, email)",
          )
          .order("created_at", { ascending: false })
          .range(inicio, fim),
      )) as unknown as ProtocoloBase[];
      if (!bases.length) return [] as Linha[];

      // Paginado: sem isso o PostgREST corta em 1000 folhas e os protocolos
      // passam a exibir contagens menores do que a realidade.
      const folhas = await buscarTudoPaginado<FolhaResumo>((inicio, fim) =>
        supabase
          .from("protocolo_folhas")
          .select("protocolo_id, ordem, colaborador, empresa, cargo")
          .order("protocolo_id", { ascending: true })
          .order("ordem", { ascending: true })
          .range(inicio, fim),
      );

      const porProtocolo = new Map<string, FolhaResumo[]>();
      folhas.forEach((folha) => {
        const lista = porProtocolo.get(folha.protocolo_id) ?? [];
        lista.push(folha);
        porProtocolo.set(folha.protocolo_id, lista);
      });

      return bases.map((p) => {
        const lista = porProtocolo.get(p.id) ?? [];
        return {
          ...p,
          protocolo_folhas: [{ count: lista.length }],
          protocolo_folhas_lista: lista,
        } satisfies Linha;
      });
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || !data) return data ?? [];
    return data.filter((p) => {
      const responsavel = (p.profiles?.nome ?? p.profiles?.email ?? "").toLowerCase();
      const cabecalho =
        `${p.titulo} ${p.empresa ?? ""} ${p.observacoes ?? ""} ${responsavel}`.toLowerCase();
      if (cabecalho.includes(q)) return true;
      return p.protocolo_folhas_lista.some((f) =>
        `${f.colaborador} ${f.empresa} ${f.cargo}`.toLowerCase().includes(q),
      );
    });
  }, [data, busca]);

  /**
   * Regra: uma folha é considerada "já protocolada" quando o mesmo colaborador
   * (mesma empresa) aparece em outro protocolo mais antigo. O protocolo mais
   * antigo é tratado como o original; os demais são reprotocolações.
   */
  const duplicadas = useMemo(() => {
    const chave = (colaborador: string, empresa: string) =>
      `${colaborador.trim().toLowerCase()}|${empresa.trim().toLowerCase()}`;

    const primeiroPorChave = new Map<string, { protocoloId: string; titulo: string }>();
    // data vem do mais novo para o mais antigo; percorrer invertido dá o original.
    [...(data ?? [])].reverse().forEach((p) => {
      p.protocolo_folhas_lista.forEach((f) => {
        const k = chave(f.colaborador, f.empresa);
        if (!primeiroPorChave.has(k)) {
          primeiroPorChave.set(k, { protocoloId: p.id, titulo: p.titulo });
        }
      });
    });

    const porProtocolo = new Map<string, { colaborador: string; origem: string }[]>();
    (data ?? []).forEach((p) => {
      const repetidas: { colaborador: string; origem: string }[] = [];
      p.protocolo_folhas_lista.forEach((f) => {
        const original = primeiroPorChave.get(chave(f.colaborador, f.empresa));
        if (original && original.protocoloId !== p.id) {
          repetidas.push({ colaborador: f.colaborador, origem: original.titulo });
        }
      });
      porProtocolo.set(p.id, repetidas);
    });
    return porProtocolo;
  }, [data]);

  const [confirmacao, setConfirmacao] = useState<Linha | null>(null);

  function pedirConfirmacaoOuAbrir(p: Linha) {
    if ((duplicadas.get(p.id)?.length ?? 0) > 0) {
      setConfirmacao(p);
      return;
    }
    abrirPdf(p);
  }

  async function apagar(id: string, titulo: string) {
    const confirmado =
      typeof window === "undefined" ||
      window.confirm(
        `Apagar o protocolo "${titulo}"? Todas as folhas vinculadas a ele serão removidas. Esta ação não pode ser desfeita.`,
      );
    if (!confirmado) return;

    const { error: err } = await supabase.from("protocolos").delete().eq("id", id);
    if (err) {
      toast.error(err.message || "Não foi possível apagar o protocolo.");
      return;
    }
    toast.success("Protocolo apagado.");
    invalidarConsultasProtocoloFolhas(queryClient);
    notificarAtualizacaoProtocoloFolhas("exclusao");
  }

  function abrirPdf(p: Linha) {
    abrirProtocoloPdf({
      titulo: p.titulo,
      empresa: p.empresa,
      responsavel: p.profiles?.nome ?? p.profiles?.email ?? undefined,
      data: dataBr(p.data_entrega),
      folhas: p.protocolo_folhas_lista.map((f, i) => ({
        id: `${p.id}-${i}`,
        ordem: f.ordem || i + 1,
        pagina: 0,
        arquivo: "",
        colaborador: f.colaborador,
        empresa: f.empresa,
        posto: "",
        cargo: f.cargo,
        matricula: "",
        admissao: "",
        conferido: false,
      })),
    });
  }

  async function garantirAnaliseExtras(): Promise<ResultadoAnalise | null> {
    if (extras) return extras;
    setAnalisandoExtras(true);
    setProgressoExtras("Sincronizando com os protocolos salvos...");
    try {
      const dados = await analisarHorasExtras(setProgressoExtras);
      setExtras(dados);
      return dados;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível analisar as horas extras.");
      return null;
    } finally {
      setAnalisandoExtras(false);
      setProgressoExtras("");
    }
  }

  /** Retira as folhas com horas extras do protocolo e cria um novo protocolo com elas. */
  async function gerarProtocoloHorasExtras(p: Linha) {
    setGerandoExtras(p.id);
    try {
      const analise = await garantirAnaliseExtras();
      if (!analise) return;
      const folhasExtras = analise.folhas.filter((f) => f.protocoloId === p.id);
      if (!folhasExtras.length) {
        toast.info("Nenhuma folha com horas extras encontrada neste protocolo.");
        return;
      }

      setProgressoExtras("Criando o novo protocolo de horas extras...");
      const separacao = await separarHorasExtrasEmNovosProtocolos(folhasExtras, setProgressoExtras);
      setProgressoExtras("");
      setExtras(null);
      invalidarConsultasProtocoloFolhas(queryClient);
      notificarAtualizacaoProtocoloFolhas("protocolacao");

      abrirProtocoloPdf({
        titulo: separacao.novosProtocolos[0]?.titulo ?? `HORAS EXTRAS - ${p.titulo}`,
        empresa: p.empresa,
        responsavel: p.profiles?.nome ?? p.profiles?.email ?? undefined,
        data: dataBr(p.data_entrega),
        folhas: folhasExtras.map((f, i) => ({
          id: `${f.chave}-${i}`,
          ordem: i + 1,
          pagina: f.paginaPdf || f.pagina || 0,
          arquivo: f.arquivo ?? "",
          colaborador: f.colaborador,
          empresa: f.empresa,
          posto: f.posto,
          cargo: f.cargo,
          matricula: f.matricula,
          admissao: f.admissao,
          conferido: false,
        })),
      });

      const pdf = await montarPdfHorasExtras(folhasExtras, null);
      if (pdf) {
        const url = URL.createObjectURL(
          new Blob([pdf.bytes as unknown as BlobPart], { type: "application/pdf" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = pdf.nomeArquivo;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      toast.success(
        `${separacao.folhasMovidas} folha(s) com horas extras foram retiradas deste protocolo e movidas para um novo protocolo.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível separar as horas extras.");
    } finally {
      setProgressoExtras("");
      setGerandoExtras(null);
    }
  }

  const resultadosColaborador = useMemo(() => {
    const q = buscaColaborador.trim().toLowerCase();
    if (!q || !data) return [];
    return data.flatMap((p) =>
      p.protocolo_folhas_lista
        .filter((f) => f.colaborador.toLowerCase().includes(q))
        .map((f) => ({ ...f, protocolo: p })),
    );
  }, [data, buscaColaborador]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Protocolos salvos</h2>
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">Brasília: {relogio}</p>
      </div>

      {(analisandoExtras || progressoExtras) && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {progressoExtras || "Analisando as folhas com horas extras..."}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando protocolos...</p>}
      {error && <ServerFunctionAwareInlineError error={error} />}

      {!isLoading && data && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, empresa, colaborador ou responsável"
              className="w-full sm:w-96"
            />
            <p className="text-sm text-muted-foreground">
              {filtrados.length} de {data.length} protocolo{data.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              Buscar colaborador sem abrir os protocolos
            </p>
            <Input
              value={buscaColaborador}
              onChange={(e) => setBuscaColaborador(e.target.value)}
              placeholder="Digite o nome do colaborador"
              className="w-full sm:w-96"
            />
          </div>
        </div>
      )}

      {!isLoading && !data?.length && (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <h3 className="font-semibold text-foreground">Nenhum protocolo salvo</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Leia um PDF de folhas de ponto na aba “Protocolar” e clique em “Salvar protocolo”.
          </p>
        </div>
      )}

      {!!buscaColaborador.trim() && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Resultados para “{buscaColaborador.trim()}”
          </h3>
          {resultadosColaborador.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
          )}
          {resultadosColaborador.map((item, idx) => (
            <div
              key={`${item.protocolo_id}-${item.ordem}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div>
                <p className="font-medium text-foreground">{item.colaborador}</p>
                <p className="text-xs text-muted-foreground">
                  {item.empresa} · {item.cargo} · Protocolo {item.protocolo.titulo} · entrega{" "}
                  {dataBr(item.protocolo.data_entrega)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => abrirPdf(item.protocolo)}>
                Abrir em PDF
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {filtrados.map((p) => (
          <article
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{p.titulo}</h3>
                {(duplicadas.get(p.id)?.length ?? 0) > 0 && (
                  <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    {duplicadas.get(p.id)!.length} folha
                    {duplicadas.get(p.id)!.length === 1 ? "" : "s"} já protocolada
                    {duplicadas.get(p.id)!.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.protocolo_folhas?.[0]?.count ?? 0} folhas · entrega {dataBr(p.data_entrega)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Protocolado por {p.profiles?.nome ?? p.profiles?.email ?? "usuário"} em{" "}
                {dataBr(p.created_at, true)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => pedirConfirmacaoOuAbrir(p)}>
                Abrir em PDF
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-primary"
                disabled={analisandoExtras || gerandoExtras !== null}
                onClick={() => gerarProtocoloHorasExtras(p)}
              >
                {gerandoExtras === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
                Separar horas extras
              </Button>
              {ehAdmin && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => apagar(p.id, p.titulo)}
                >
                  Apagar
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>

      <AlertDialog open={confirmacao !== null} onOpenChange={(o) => !o && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Folhas já protocoladas</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {duplicadas.get(confirmacao?.id ?? "")?.length ?? 0} folha(s) deste protocolo já
                  foram protocoladas antes. Deseja protocolar novamente?
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                  {(duplicadas.get(confirmacao?.id ?? "") ?? []).slice(0, 50).map((d, i) => (
                    <li key={`${d.colaborador}-${i}`}>
                      {d.colaborador} · já em “{d.origem}”
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmacao) abrirPdf(confirmacao);
                setConfirmacao(null);
              }}
            >
              Protocolar novamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
