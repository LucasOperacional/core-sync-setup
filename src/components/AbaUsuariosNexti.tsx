import { Fragment, useMemo, useState } from "react";
import { lerPlanilhaUsuarios, REGRAS_COLUNAS } from "@/lib/nexti-usuarios-planilha";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  ScrollText,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  cadastrarPessoaNexti,
  validarPessoasNexti,
  type PessoaCadastro,
  type ValidacaoPessoa,
} from "@/lib/nexti-usuarios.functions";

type LinhaUsuario = PessoaCadastro & {
  id: string;
  status: "pendente" | "enviando" | "ok" | "erro";
  mensagem?: string;
};

const CAMPOS: { chave: keyof PessoaCadastro; rotulo: string }[] = REGRAS_COLUNAS.map((r) => ({
  chave: r.chave,
  rotulo: r.rotulo,
})).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type LinhaLog = { id: string; hora: string; texto: string; tipo: "info" | "ok" | "erro" };

export function AbaUsuariosNexti() {
  const [linhas, setLinhas] = useState<LinhaUsuario[]>([]);
  const [arquivoNome, setArquivoNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  // Arquivos de folha não trazem a coluna de empresa; aqui ela é informada uma vez.
  const [empresaPadrao, setEmpresaPadrao] = useState("");
  const [logs, setLogs] = useState<LinhaLog[]>([]);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [validacoes, setValidacoes] = useState<ValidacaoPessoa[]>([]);
  const [validando, setValidando] = useState(false);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const cadastrar = useServerFn(cadastrarPessoaNexti);
  const validar = useServerFn(validarPessoasNexti);

  const registrar = (texto: string, tipo: LinhaLog["tipo"] = "info") => {
    setLogs((atual) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        hora: new Date().toLocaleTimeString("pt-BR"),
        texto,
        tipo,
      },
      ...atual,
    ]);
  };

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return linhas;
    return linhas.filter((l) =>
      [l.nome, l.cpf, l.matricula, l.cargo, l.posto, l.empresa]
        .map(normalizar)
        .some((v) => v.includes(termo)),
    );
  }, [linhas, busca]);

  const totais = useMemo(
    () => ({
      total: linhas.length,
      ok: linhas.filter((l) => l.status === "ok").length,
      erro: linhas.filter((l) => l.status === "erro").length,
    }),
    [linhas],
  );

  const validacaoDe = (indice: number) => validacoes.find((v) => v.indice === indice);

  const resumoValidacao = useMemo(
    () => ({
      comErro: validacoes.filter((v) => v.erros.length > 0).length,
      comAviso: validacoes.filter((v) => v.erros.length === 0 && v.avisos.length > 0).length,
      ok: validacoes.filter((v) => v.erros.length === 0 && v.avisos.length === 0).length,
    }),
    [validacoes],
  );

  const validarLista = async (lista: LinhaUsuario[]) => {
    if (lista.length === 0) return;
    setValidando(true);
    setValidacoes([]);
    registrar(`Validando ${lista.length} colaboradores contra a NEXTI...`);
    try {
      const pessoas = lista.map(({ id: _i, status: _s, mensagem: _m, ...pessoa }) => pessoa);
      const res = await validar({ data: { pessoas } });
      if (!res.ok) {
        registrar(`Falha na validação: ${res.erro ?? "erro desconhecido"}`, "erro");
        toast.error(res.erro ?? "Não consegui validar com a NEXTI.");
        return;
      }
      setValidacoes(res.itens);
      const erros = res.itens.filter((v) => v.erros.length > 0).length;
      registrar(
        `Validação concluída: ${res.itens.length - erros} prontos, ${erros} com problema.`,
        erros ? "erro" : "ok",
      );
      if (erros) toast.warning(`${erros} colaborador(es) precisam de correção antes do envio.`);
      else toast.success("Todos os colaboradores estão prontos para envio.");
      setPreviewAberto(true);
    } catch (error) {
      const msg = (error as Error)?.message ?? "Falha na validação.";
      registrar(msg, "erro");
      toast.error(msg);
    } finally {
      setValidando(false);
    }
  };

  const processarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setArquivoNome(file.name);
    try {
      const { pessoas, colunasReconhecidas, colunasIgnoradas } = await lerPlanilhaUsuarios(file);
      const novas: LinhaUsuario[] = pessoas.map((pessoa, i) => ({
        ...pessoa,
        id: `${i}-${pessoa.nome}`,
        status: "pendente" as const,
      }));
      setLinhas(novas);
      setValidacoes([]);
      registrar(`Planilha "${file.name}" lida: ${novas.length} colaboradores.`);
      registrar(
        `Colunas convertidas para a NEXTI: ${colunasReconhecidas
          .map((c) => `${c.rotulo} (${c.coluna})`)
          .join(", ")}.`,
        "ok",
      );
      if (colunasIgnoradas.length > 0) {
        registrar(`Colunas não usadas no envio: ${colunasIgnoradas.join(", ")}.`);
      }
      toast.success(
        `${novas.length} colaboradores lidos — ${colunasReconhecidas.length} colunas convertidas.`,
      );
      await validarLista(novas);
    } catch (error) {
      const msg =
        (error as Error)?.message ?? "Não consegui ler a planilha. Use .xlsx, .xls ou .csv.";
      registrar(`Planilha "${file.name}": ${msg}`, "erro");
      toast.error(msg);
    }
  };

  const enviarTodos = async () => {
    const bloqueadas = linhas.filter(
      (l, i) => l.status !== "ok" && (validacaoDe(i)?.erros.length ?? 0) > 0,
    );
    const pendentes = linhas.filter(
      (l, i) => l.status !== "ok" && (validacaoDe(i)?.erros.length ?? 0) === 0,
    );
    if (bloqueadas.length) {
      registrar(`${bloqueadas.length} colaborador(es) ignorados por erro de validação.`, "erro");
      toast.warning(`${bloqueadas.length} colaborador(es) com erro não serão enviados.`);
    }
    if (!pendentes.length) {
      toast.info("Nenhum colaborador válido pendente para cadastrar.");
      return;
    }
    setEnviando(true);
    let sucesso = 0;
    registrar(`Início do envio de ${pendentes.length} colaboradores para a NEXTI.`);
    for (const linha of pendentes) {
      setLinhas((atual) =>
        atual.map((l) => (l.id === linha.id ? { ...l, status: "enviando", mensagem: "" } : l)),
      );
      registrar(`Enviando "${linha.nome}" para a NEXTI...`);
      const { id: _id, status: _s, mensagem: _m, ...pessoa } = linha;
      try {
        const res = await cadastrar({ data: { pessoa } });
        if (res.ok) sucesso += 1;
        registrar(`${linha.nome}: ${res.mensagem}`, res.ok ? "ok" : "erro");
        setLinhas((atual) =>
          atual.map((l) =>
            l.id === linha.id
              ? { ...l, status: res.ok ? "ok" : "erro", mensagem: res.mensagem }
              : l,
          ),
        );
      } catch (error) {
        const msg = (error as Error)?.message ?? "Falha no envio.";
        registrar(`${linha.nome}: ${msg}`, "erro");
        setLinhas((atual) =>
          atual.map((l) => (l.id === linha.id ? { ...l, status: "erro", mensagem: msg } : l)),
        );
      }
    }
    setEnviando(false);
    registrar(
      `Envio finalizado: ${sucesso} de ${pendentes.length} cadastrados na NEXTI.`,
      sucesso === pendentes.length ? "ok" : "erro",
    );
    toast.success(`${sucesso} de ${pendentes.length} colaboradores cadastrados na NEXTI.`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-primary" />
            Usuários — cadastro na NEXTI
          </CardTitle>
          <CardDescription>
            Importe a planilha com os dados de cadastro e envie os colaboradores direto para a
            NEXTI.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {totais.total > 0 && <Badge variant="secondary">{totais.total} na lista</Badge>}
          {totais.ok > 0 && <Badge className="bg-emerald-600">{totais.ok} cadastrados</Badge>}
          {totais.erro > 0 && <Badge variant="destructive">{totais.erro} com erro</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="arquivo-usuarios">Planilha de cadastro (.xlsx, .xls, .csv)</Label>
            <Input
              id="arquivo-usuarios"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={processarArquivo}
            />
          </div>
          <Dialog open={previewAberto} onOpenChange={setPreviewAberto}>
            <DialogTrigger asChild>
              <Button variant="outline" className="self-end gap-2" disabled={linhas.length === 0}>
                <Eye className="h-4 w-4" />
                Pré-visualizar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>Pré-visualização e validação do envio para a NEXTI</DialogTitle>
                <DialogDescription>
                  Conferência completa antes do envio: linhas com erro são bloqueadas e precisam ser
                  corrigidas na planilha. Avisos indicam ajustes automáticos que serão aplicados.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {validando && (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Validando na NEXTI...
                  </Badge>
                )}
                <Badge className="bg-emerald-600">{resumoValidacao.ok} prontos</Badge>
                <Badge className="bg-amber-500">{resumoValidacao.comAviso} com aviso</Badge>
                <Badge variant="destructive">{resumoValidacao.comErro} com erro</Badge>
                <Badge variant="secondary">{linhas.length} na planilha</Badge>
              </div>

              <ScrollArea className="h-[58vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="w-40">Situação</TableHead>
                      {CAMPOS.map((c) => (
                        <TableHead key={c.chave}>{c.rotulo}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((linha, i) => {
                      const v = validacaoDe(i);
                      const temErro = (v?.erros.length ?? 0) > 0;
                      const temAviso = (v?.avisos.length ?? 0) > 0;
                      return (
                        <Fragment key={linha.id}>
                          <TableRow
                            className={temErro ? "bg-destructive/5" : undefined}
                          >
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {!v ? (
                                <span className="text-muted-foreground">Aguardando</span>
                              ) : temErro ? (
                                <span className="flex items-center gap-1 font-medium text-destructive">
                                  <XCircle className="h-3.5 w-3.5" /> Corrigir
                                </span>
                              ) : temAviso ? (
                                <span className="flex items-center gap-1 font-medium text-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Aviso
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 font-medium text-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Pronto
                                </span>
                              )}
                              {v && (
                                <button
                                  type="button"
                                  className="mt-1 block text-[11px] underline text-muted-foreground"
                                  onClick={() => setDetalhe(detalhe === i ? null : i)}
                                >
                                  {detalhe === i ? "ocultar dados" : "ver dados do envio"}
                                </button>
                              )}
                            </TableCell>
                            {CAMPOS.map((c) => {
                              const resolvido =
                                c.chave === "empresa" || c.chave === "cargo" || c.chave === "posto" || c.chave === "escala"
                                  ? v?.resolvido[c.chave]
                                  : undefined;
                              return (
                                <TableCell key={c.chave} className="whitespace-nowrap text-xs">
                                  {linha[c.chave] || <span className="text-muted-foreground">—</span>}
                                  {resolvido && normalizar(resolvido) !== normalizar(linha[c.chave]) && (
                                    <span className="block text-[11px] text-emerald-600">
                                      → {resolvido}
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                          {v && (temErro || temAviso || detalhe === i) && (
                            <TableRow>
                              <TableCell colSpan={CAMPOS.length + 2} className="space-y-1 py-2">
                                {v.erros.map((erro) => (
                                  <p key={erro} className="text-xs text-destructive">
                                    • {erro}
                                  </p>
                                ))}
                                {v.avisos.map((aviso) => (
                                  <p key={aviso} className="text-xs text-amber-600">
                                    • {aviso}
                                  </p>
                                ))}
                                {detalhe === i && (
                                  <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                                    {JSON.stringify(v.payload, null, 2)}
                                  </pre>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  {resumoValidacao.comErro > 0
                    ? `${resumoValidacao.comErro} linha(s) com erro não serão enviadas — corrija a planilha e importe de novo.`
                    : `${linhas.length} colaborador(es) prontos para cadastro.`}
                </p>
                <Button
                  className="gap-2"
                  disabled={
                    enviando ||
                    validando ||
                    linhas.length === 0 ||
                    resumoValidacao.ok + resumoValidacao.comAviso === 0
                  }
                  onClick={() => {
                    setPreviewAberto(false);
                    void enviarTodos();
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Enviar {resumoValidacao.ok + resumoValidacao.comAviso} válidos para a NEXTI
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            className="self-end gap-2"
            onClick={enviarTodos}
            disabled={enviando || linhas.length === 0}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Cadastrar na NEXTI
          </Button>
          <Button
            variant="outline"
            className="self-end gap-2"
            onClick={() => {
              setLinhas([]);
              setArquivoNome("");
            }}
            disabled={enviando || linhas.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            Limpar
          </Button>
          <Button
            variant="ghost"
            className="self-end gap-2"
            onClick={() => void validarLista(linhas)}
            disabled={validando || enviando || linhas.length === 0}
          >
            {validando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Revalidar
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Colunas reconhecidas automaticamente: {CAMPOS.map((c) => c.rotulo).join(", ")}. Empresa,
          cargo, posto e escala são casados pelo nome cadastrado na NEXTI.
          {arquivoNome ? ` Arquivo: ${arquivoNome}.` : ""}
        </p>

        {linhas.length > 0 && (
          <>
            <Separator />
            <Input
              placeholder="Buscar por nome, CPF, matrícula, cargo ou posto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <ScrollArea className="h-[420px] rounded-md border">
              <div className="divide-y">
                {filtradas.map((linha) => (
                  <div key={linha.id} className="flex items-start gap-3 p-3 text-sm">
                    <span className="mt-0.5">
                      {linha.status === "ok" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : linha.status === "erro" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : linha.status === "enviando" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{linha.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          linha.matricula && `Matrícula ${linha.matricula}`,
                          linha.cpf && `CPF ${linha.cpf}`,
                          linha.cargo,
                          linha.posto,
                          linha.empresa,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {linha.mensagem && (
                        <p
                          className={
                            linha.status === "erro"
                              ? "mt-1 text-xs text-destructive"
                              : "mt-1 text-xs text-emerald-600"
                          }
                        >
                          {linha.mensagem}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {filtradas.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nenhum colaborador encontrado com esse termo.
                  </p>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              Log de envio para a NEXTI
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
            >
              Limpar log
            </Button>
          </div>
          <ScrollArea className="h-[220px] rounded-md border bg-muted/30">
            <div className="space-y-1 p-3 font-mono text-xs">
              {logs.length === 0 && (
                <p className="text-muted-foreground">
                  Nenhum envio registrado ainda. O andamento aparece aqui.
                </p>
              )}
              {logs.map((l) => (
                <p
                  key={l.id}
                  className={
                    l.tipo === "erro"
                      ? "text-destructive"
                      : l.tipo === "ok"
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                  }
                >
                  [{l.hora}] {l.texto}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

export default AbaUsuariosNexti;
