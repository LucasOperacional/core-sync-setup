import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Play, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  alterarAvisoAgendado,
  criarAvisoAgendado,
  listarAvisosAgendados,
  processarAvisosAgendados,
} from "@/lib/push-agenda.functions";
import { listarPessoasPush } from "@/lib/push.functions";
import { CATEGORIAS_PUSH, ROTULO_CATEGORIA, type CategoriaPush } from "@/lib/push-tipos";

const ROTULO_PUBLICO: Record<string, string> = {
  supervisores: "Todos os supervisores",
  selecionados: "Pessoas escolhidas",
  todos: "Todos com celular cadastrado",
};

const ROTULO_REPETICAO: Record<string, string> = {
  unica: "Uma vez",
  diaria: "Todos os dias",
  semanal: "Toda semana",
};

const COR_STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  agendado: "default",
  enviado: "secondary",
  cancelado: "outline",
  falhou: "destructive",
};

function paraInputLocal(data: Date) {
  const ajustada = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return ajustada.toISOString().slice(0, 16);
}

function formatar(valor: string | null) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Card de avisos programados — visível apenas para administradores. */
export function AvisosAgendadosCard() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarAvisosAgendados);
  const criar = useServerFn(criarAvisoAgendado);
  const alterar = useServerFn(alterarAvisoAgendado);
  const processar = useServerFn(processarAvisosAgendados);
  const pessoasFn = useServerFn(listarPessoasPush);

  const [categoria, setCategoria] = useState<CategoriaPush>("sistema");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [rota, setRota] = useState("/supervisor");
  const [publico, setPublico] = useState("supervisores");
  const [repeticao, setRepeticao] = useState("unica");
  const [quando, setQuando] = useState(() => paraInputLocal(new Date(Date.now() + 30 * 60000)));
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  const agenda = useQuery({ queryKey: ["push-agenda"], queryFn: () => listar({}) });
  const pessoas = useQuery({
    queryKey: ["pessoas-push"],
    queryFn: () => pessoasFn({}),
    enabled: publico === "selecionados",
  });

  const filtradas = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    const lista = pessoas.data ?? [];
    if (!termo) return lista.slice(0, 30);
    return lista
      .filter((p) => `${p.nome} ${p.email}`.toLowerCase().includes(termo))
      .slice(0, 30);
  }, [pessoas.data, filtro]);

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["push-agenda"] });

  const salvar = useMutation({
    mutationFn: async () => {
      const data = new Date(quando);
      if (Number.isNaN(data.getTime())) throw new Error("Informe a data e hora do aviso.");
      return criar({
        data: {
          category: categoria,
          event: "aviso_agendado",
          title: titulo,
          body: mensagem,
          targetUrl: rota,
          publico,
          recipientUserIds: selecionados,
          agendadoPara: data.toISOString(),
          repeticao,
        },
      });
    },
    onSuccess: () => {
      toast.success("Aviso programado.");
      setTitulo("");
      setMensagem("");
      setSelecionados([]);
      void recarregar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const acao = useMutation({
    mutationFn: (entrada: { id: string; acao: "cancelar" | "reativar" | "excluir" }) =>
      alterar({ data: entrada }),
    onSuccess: () => {
      toast.success("Agenda atualizada.");
      void recarregar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const enviarPendentes = useMutation({
    mutationFn: () => processar({}),
    onSuccess: (r) => {
      toast.success(
        r.processados === 0
          ? "Nenhum aviso vencido no momento."
          : `${r.enviados} aviso(s) enviado(s), ${r.falhas} com falha.`,
      );
      void recarregar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (agenda.isError) return null; // não é administrador

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Avisos programados
        </CardTitle>
        <CardDescription>
          Programe avisos para aparecerem no celular dos supervisores em data e hora definidas, uma
          vez ou repetindo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaPush)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_PUSH.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ROTULO_CATEGORIA[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quem recebe</Label>
            <Select value={publico} onValueChange={setPublico}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULO_PUBLICO).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-quando">Data e hora</Label>
            <Input
              id="agenda-quando"
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Repetição</Label>
            <Select value={repeticao} onValueChange={setRepeticao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULO_REPETICAO).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-titulo">Título (opcional)</Label>
            <Input
              id="agenda-titulo"
              value={titulo}
              maxLength={80}
              placeholder="Deixe vazio para o texto ser criado automaticamente"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-rota">Tela que abre ao tocar</Label>
            <Input id="agenda-rota" value={rota} onChange={(e) => setRota(e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="agenda-mensagem">Mensagem (opcional)</Label>
            <Textarea
              id="agenda-mensagem"
              value={mensagem}
              maxLength={300}
              rows={3}
              placeholder="Ex.: Lance as faltas do dia antes das 18h."
              onChange={(e) => setMensagem(e.target.value)}
            />
          </div>
        </div>

        {publico === "selecionados" && (
          <div className="space-y-2">
            <Label htmlFor="agenda-filtro">Escolher pessoas</Label>
            <Input
              id="agenda-filtro"
              value={filtro}
              placeholder="Buscar por nome"
              onChange={(e) => setFiltro(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {pessoas.isLoading && (
                <p className="text-muted-foreground text-sm">Carregando pessoas...</p>
              )}
              {filtradas.map((p) => {
                const marcado = selecionados.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelecionados((atual) =>
                        marcado ? atual.filter((id) => id !== p.id) : [...atual, p.id],
                      )
                    }
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
                      marcado ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <span>
                      {p.nome} <span className="text-muted-foreground">({p.papel})</span>
                    </span>
                    {p.temAparelho ? (
                      <Badge variant="secondary">celular ativo</Badge>
                    ) : (
                      <Badge variant="outline">sem celular</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="mr-2 h-4 w-4" />
            )}
            Programar aviso
          </Button>
          <Button
            variant="outline"
            onClick={() => enviarPendentes.mutate()}
            disabled={enviarPendentes.isPending}
          >
            {enviarPendentes.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Enviar vencidos agora
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Programados</p>
          {agenda.isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
          {agenda.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum aviso programado ainda.</p>
          )}
          <div className="space-y-2">
            {(agenda.data ?? []).map((item) => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {item.title || `Aviso automático · ${ROTULO_CATEGORIA[item.category as CategoriaPush] ?? item.category}`}
                    </p>
                    <p className="text-muted-foreground">
                      {ROTULO_PUBLICO[item.publico] ?? item.publico} ·{" "}
                      {ROTULO_REPETICAO[item.repeticao] ?? item.repeticao} · próximo:{" "}
                      {formatar(item.proximo_envio_em ?? item.agendado_para)}
                    </p>
                    {item.erro && <p className="text-destructive">{item.erro}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={COR_STATUS[item.status] ?? "outline"}>{item.status}</Badge>
                    {item.status === "agendado" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => acao.mutate({ id: item.id, acao: "cancelar" })}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => acao.mutate({ id: item.id, acao: "reativar" })}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => acao.mutate({ id: item.id, acao: "excluir" })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
