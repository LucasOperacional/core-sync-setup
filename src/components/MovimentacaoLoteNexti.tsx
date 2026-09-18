import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, CheckCircle2, Loader2, Search, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { lerPlanilhaUsuarios } from "@/lib/nexti-usuarios-planilha";
import {
  executarMovimentacaoPostoLote,
  resolverPessoasMovimentacaoLote,
  validarDestinoMovimentacaoLote,
  type PessoaMovimentacaoLote,
  type ValidacaoDestinoLote,
} from "@/lib/movimentacao-posto.functions";
import {
  pesquisarNomeColaboradorNexti,
  pesquisarPostosNexti,
  type NomeColaboradorNexti,
  type PostoNexti,
} from "@/lib/nexti-ativos.functions";

type Resultado = { colaborador: string; ok: boolean; mensagem: string };

export function MovimentacaoLoteNexti() {
  const pesquisarPessoas = useServerFn(pesquisarNomeColaboradorNexti);
  const pesquisarPostos = useServerFn(pesquisarPostosNexti);
  const resolverPessoas = useServerFn(resolverPessoasMovimentacaoLote);
  const executarLote = useServerFn(executarMovimentacaoPostoLote);
  const validarDestino = useServerFn(validarDestinoMovimentacaoLote);
  const [aberto, setAberto] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaMovimentacaoLote[]>([]);
  const [posto, setPosto] = useState<PostoNexti | null>(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const [buscaPosto, setBuscaPosto] = useState("");
  const [pessoasBusca, setPessoasBusca] = useState<NomeColaboradorNexti[]>([]);
  const [postosBusca, setPostosBusca] = useState<PostoNexti[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [validacoes, setValidacoes] = useState<ValidacaoDestinoLote[]>([]);
  const [validandoDestino, setValidandoDestino] = useState(false);

  const validas = useMemo(
    () => pessoas.filter((p) => p.encontrado && p.personId > 0 && p.postoAtualId !== posto?.id && validacoes.some((v) => v.personId === p.personId && v.ok)),
    [pessoas, posto?.id, validacoes],
  );

  useEffect(() => {
    if (!aberto || buscaPessoa.trim().length < 2) {
      setPessoasBusca([]);
      return;
    }
    const timer = window.setTimeout(() => void buscarPessoas(), 350);
    return () => window.clearTimeout(timer);
  }, [aberto, buscaPessoa, buscarPessoas]);

  useEffect(() => {
    const candidatas = pessoas.filter((p) => p.encontrado && p.personId > 0 && p.postoAtualId !== posto?.id);
    if (!posto || !data || candidatas.length === 0) {
      setValidacoes([]);
      return;
    }
    let ativo = true;
    setValidandoDestino(true);
    void validarDestino({
      data: {
        pessoas: candidatas.map((p) => ({ personId: p.personId, colaborador: p.colaborador })),
        novoPostoId: posto.id,
        novoPostoExternalId: posto.externalId,
        dataMovimentacao: data,
      },
    }).then((res) => {
      if (ativo) setValidacoes(res.resultados);
    }).catch((error) => {
      if (ativo) toast.error(error instanceof Error ? error.message : "Falha ao validar o posto na NEXTI.");
    }).finally(() => {
      if (ativo) setValidandoDestino(false);
    });
    return () => { ativo = false; };
  }, [data, pessoas, posto, validarDestino]);

  const buscarPessoas = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await pesquisarPessoas({ data: { termo: buscaPessoa } });
      if (!res.ok) throw new Error(res.erro ?? "Falha ao buscar colaboradores.");
      setPessoasBusca(res.colaboradores);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao buscar colaboradores.");
    } finally {
      setCarregando(false);
    }
  }, [buscaPessoa, pesquisarPessoas]);

  const buscarPostos = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await pesquisarPostos({ data: { termo: buscaPosto } });
      if (!res.ok) throw new Error(res.erro ?? "Falha ao buscar postos.");
      setPostosBusca(res.postos.slice(0, 100));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao buscar postos.");
    } finally {
      setCarregando(false);
    }
  }, [buscaPosto, pesquisarPostos]);

  const adicionarPessoa = (pessoa: NomeColaboradorNexti) => {
    setPessoas((atual) =>
      atual.some((item) => item.personId === pessoa.personId)
        ? atual
        : [
            ...atual,
            {
              personId: pessoa.personId,
              personExternalId: pessoa.personExternalId,
              colaborador: pessoa.colaborador,
              postoAtualId: pessoa.workplaceId,
              postoAtual: pessoa.postoAtual,
              encontrado: true,
            },
          ],
    );
    setBuscaPessoa("");
    setPessoasBusca([]);
  };

  const importar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;
    setCarregando(true);
    setResultados([]);
    try {
      const leitura = await lerPlanilhaUsuarios(arquivo);
      const res = await resolverPessoas({
        data: {
          pessoas: leitura.pessoas.map((p) => ({
            nome: p.nome,
            matricula: p.matricula ?? "",
            cpf: p.cpf ?? "",
          })),
        },
      });
      if (!res.ok) throw new Error(res.erro ?? "Falha ao validar a planilha na NEXTI.");
      setPessoas(res.pessoas);
      toast.success(`${res.pessoas.filter((p) => p.encontrado).length} colaborador(es) localizado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setCarregando(false);
    }
  };

  const enviar = async () => {
    if (!posto || !data || motivo.trim().length < 3 || validas.length === 0) {
      toast.error("Selecione o destino, informe data e motivo e adicione colaboradores válidos.");
      return;
    }
    setEnviando(true);
    setResultados([]);
    try {
      const res = await executarLote({
        data: {
          pessoas: validas.map((p) => ({
            personId: p.personId,
            personExternalId: p.personExternalId,
            colaborador: p.colaborador,
            postoAtualId: p.postoAtualId,
            postoAtual: p.postoAtual,
          })),
          novoPostoId: posto.id,
          novoPostoExternalId: posto.externalId,
          novoPosto: posto.nome,
          dataMovimentacao: data,
          motivo,
        },
      });
      setResultados(res.resultados);
      if (res.sucessos > 0) toast.success(`${res.sucessos} colaborador(es) movimentado(s) na NEXTI.`);
      if (res.falhas > 0) toast.warning(`${res.falhas} movimentação(ões) não foram concluídas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao executar a movimentação em lote.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <ArrowRightLeft className="h-4 w-4" /> Movimentar postos em lote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" /> Movimentação em lote pela NEXTI
          </DialogTitle>
          <DialogDescription>
            Selecione ou importe os colaboradores, confira o destino e envie todos de uma vez.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adicionar colaborador da NEXTI</Label>
              <div className="flex gap-2">
                <Input value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void buscarPessoas(); }} placeholder="Nome ou matrícula" />
                <Button type="button" size="icon" variant="outline" onClick={() => void buscarPessoas()} aria-label="Buscar colaborador" title="Buscar colaborador">
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {pessoasBusca.length > 0 && (
                <ScrollArea className="h-36 rounded-md border">
                  <div className="divide-y">
                    {pessoasBusca.map((p) => (
                      <Button key={p.personId} type="button" variant="ghost" className="h-auto w-full justify-start rounded-none px-3 py-2 text-left" onClick={() => adicionarPessoa(p)}>
                        <span><span className="block text-sm font-medium">{p.colaborador}</span><span className="block text-xs text-muted-foreground">{p.postoAtual || "Posto não informado"}</span></span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="planilha-movimentacao-lote">Ou importar planilha (.xlsx, .xls, .csv)</Label>
              <Input id="planilha-movimentacao-lote" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void importar(e)} disabled={carregando || enviando} />
              <p className="text-xs text-muted-foreground">A planilha precisa ter Nome e, de preferência, Matrícula ou CPF.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Posto de destino</Label>
              {posto ? (
                <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium">
                  <span>{posto.nome}{validandoDestino ? " · validando vaga e efetivo..." : ""}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPosto(null)}>Trocar</Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input value={buscaPosto} onChange={(e) => setBuscaPosto(e.target.value)} placeholder="Buscar posto" />
                    <Button type="button" size="icon" variant="outline" onClick={() => void buscarPostos()} aria-label="Buscar posto" title="Buscar posto">
                      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {postosBusca.length > 0 && (
                    <ScrollArea className="h-36 rounded-md border">
                      <div className="divide-y">
                        {postosBusca.map((p) => (
                          <Button key={p.id} type="button" variant="ghost" className="h-auto w-full justify-start rounded-none px-3 py-2 text-left" onClick={() => { setPosto(p); setPostosBusca([]); setBuscaPosto(""); }}>{p.nome}</Button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="space-y-2"><Label htmlFor="data-movimentacao-lote">Data</Label><Input id="data-movimentacao-lote" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="motivo-movimentacao-lote">Motivo</Label><Textarea id="motivo-movimentacao-lote" className="min-h-10" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da movimentação" /></div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Prévia do lote</Label>
            <div className="flex gap-2"><Badge variant="secondary">{pessoas.length} na lista</Badge><Badge>{validas.length} prontos</Badge></div>
          </div>
          <ScrollArea className="h-56 rounded-md border">
            <div className="divide-y">
              {pessoas.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum colaborador adicionado.</p>}
              {pessoas.map((p, index) => {
                const mesmoPosto = posto?.id === p.postoAtualId;
                const validacao = validacoes.find((item) => item.personId === p.personId);
                const pronto = p.encontrado && !mesmoPosto && validacao?.ok === true;
                return (
                  <div key={`${p.personId}-${p.colaborador}-${index}`} className="flex items-start gap-3 p-3 text-sm">
                    {pronto ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1"><p className="font-medium">{p.colaborador}</p><p className="text-xs text-muted-foreground">Atual: {p.postoAtual || "não informado"}</p>{(p.erro || mesmoPosto || validacao) && <p className={validacao?.ok ? "text-xs text-success" : "text-xs text-destructive"}>{p.erro || (mesmoPosto ? "Já está no posto de destino." : validacao?.mensagem)}</p>}{posto && !mesmoPosto && !validacao && <p className="text-xs text-muted-foreground">Validando cargo, vaga e efetivo na NEXTI...</p>}</div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPessoas((atual) => atual.filter((_, i) => i !== index))}>Remover</Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {resultados.length > 0 && (
          <Alert variant={resultados.some((r) => !r.ok) ? "warning" : "success"}>
            <AlertDescription className="max-h-32 space-y-1 overflow-auto">
              {resultados.map((r, i) => <p key={`${r.colaborador}-${i}`}>{r.ok ? "✓" : "×"} {r.colaborador}: {r.mensagem}</p>)}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { setPessoas([]); setResultados([]); }}>Limpar lista</Button>
          <Button type="button" className="gap-2" disabled={enviando || carregando || validandoDestino || validas.length === 0 || !posto || motivo.trim().length < 3} onClick={() => void enviar()}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar {validas.length} para a NEXTI
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}