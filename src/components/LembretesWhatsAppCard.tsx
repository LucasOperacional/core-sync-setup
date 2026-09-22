import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2, Play, Send, Trash2, XCircle } from "lucide-react";
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
  alterarLembrete,
  criarLembrete,
  enviarLembreteAgora,
  excluirTemplateLembrete,
  listarLembretes,
  listarTemplatesLembrete,
  processarLembretes,
  salvarTemplateLembrete,
} from "@/lib/lembretes-whatsapp.functions";

const ROTULO_REPETICAO: Record<string, string> = {
  unica: "Uma vez",
  diaria: "Todos os dias",
  semanal: "Toda semana",
  mensal: "Todo mês",
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

/** Lembretes por WhatsApp: modelos de mensagem e disparos agendados. */
export function LembretesWhatsAppCard() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarLembretes);
  const criar = useServerFn(criarLembrete);
  const alterar = useServerFn(alterarLembrete);
  const processar = useServerFn(processarLembretes);
  const enviarAgora = useServerFn(enviarLembreteAgora);
  const listarTemplates = useServerFn(listarTemplatesLembrete);
  const salvarTemplate = useServerFn(salvarTemplateLembrete);
  const excluirTemplate = useServerFn(excluirTemplateLembrete);

  const [titulo, setTitulo] = useState("");
  const [numeros, setNumeros] = useState("");
  const [texto, setTexto] = useState("");
  const [repeticao, setRepeticao] = useState("unica");
  const [quando, setQuando] = useState(() => paraInputLocal(new Date(Date.now() + 30 * 60000)));
  const [nomeTemplate, setNomeTemplate] = useState("");

  const lembretes = useQuery({
    queryKey: ["wa-lembretes"],
    queryFn: () => listar({}),
    refetchInterval: 60_000,
  });
  const templates = useQuery({ queryKey: ["wa-lembretes-templates"], queryFn: () => listarTemplates({}) });

  const atualizar = () => void queryClient.invalidateQueries({ queryKey: ["wa-lembretes"] });

  const criarMut = useMutation({
    mutationFn: () => criar({ data: { titulo, numeros, texto, quando, repeticao } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.erro ?? "Não foi possível agendar.");
      toast.success("Lembrete agendado.");
      setTitulo("");
      setTexto("");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarMut = useMutation({
    mutationFn: () => enviarAgora({ data: { numeros, texto } }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Mensagem enviada para ${r.enviados} número(s).`)
        : toast.error(r.erro ?? "Falha no envio."),
    onError: (e: Error) => toast.error(e.message),
  });

  const processarMut = useMutation({
    mutationFn: () => processar({}),
    onSuccess: (r) => {
      toast.success(`${r.enviados} envio(s) concluído(s), ${r.falhas} falha(s).`);
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarMut = useMutation({
    mutationFn: (v: { id: string; acao: "cancelar" | "reativar" | "excluir" }) =>
      alterar({ data: v }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.erro ?? "Não foi possível alterar.");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templateMut = useMutation({
    mutationFn: () => salvarTemplate({ data: { nome: nomeTemplate, texto } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.erro ?? "Não foi possível salvar o modelo.");
      toast.success("Modelo salvo.");
      setNomeTemplate("");
      void queryClient.invalidateQueries({ queryKey: ["wa-lembretes-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirTemplateMut = useMutation({
    mutationFn: (id: string) => excluirTemplate({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wa-lembretes-templates"] }),
  });

  const lista = lembretes.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing className="size-5 text-primary" />
            <CardTitle className="text-base">Lembretes por WhatsApp</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => processarMut.mutate()}
            disabled={processarMut.isPending}
          >
            {processarMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Disparar vencidos
          </Button>
        </div>
        <CardDescription>
          Cadastre os números, escreva a mensagem (ou use um modelo) e escolha o dia e a hora do
          disparo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Título (opcional)</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Cobrança de folha de ponto"
            />
          </div>
          <div className="space-y-1">
            <Label>Data e hora do disparo</Label>
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Números do WhatsApp</Label>
            <Textarea
              rows={3}
              value={numeros}
              onChange={(e) => setNumeros(e.target.value)}
              placeholder="62 99999-9999, 62 98888-8888"
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula ou uma linha por número. O 55 é adicionado automaticamente.
            </p>
          </div>
          <div className="space-y-1">
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
        </div>

        <div className="space-y-1">
          <Label>Mensagem</Label>
          <Textarea
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva aqui o lembrete que será enviado."
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={() => criarMut.mutate()} disabled={criarMut.isPending}>
            {criarMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Agendar lembrete
          </Button>
          <Button
            variant="outline"
            onClick={() => enviarMut.mutate()}
            disabled={enviarMut.isPending}
          >
            {enviarMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar agora
          </Button>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Salvar como modelo</Label>
              <Input
                className="w-56"
                value={nomeTemplate}
                onChange={(e) => setNomeTemplate(e.target.value)}
                placeholder="Nome do modelo"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => templateMut.mutate()}
              disabled={templateMut.isPending || !nomeTemplate.trim() || !texto.trim()}
            >
              Salvar modelo
            </Button>
          </div>
        </div>

        {(templates.data ?? []).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Modelos salvos
            </p>
            <div className="flex flex-wrap gap-2">
              {(templates.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                >
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      setTexto(t.texto);
                      toast.success(`Modelo "${t.nome}" carregado.`);
                    }}
                  >
                    {t.nome}
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir modelo"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => excluirTemplateMut.mutate(t.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lembretes agendados
          </p>
          {lembretes.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lembrete agendado.</p>
          ) : (
            <div className="space-y-2">
              {lista.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{l.titulo || "Lembrete"}</span>
                      <Badge variant={COR_STATUS[l.status] ?? "outline"}>{l.status}</Badge>
                      <Badge variant="outline">
                        {ROTULO_REPETICAO[l.repeticao] ?? l.repeticao}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{l.texto}</p>
                    <p className="text-xs text-muted-foreground">
                      {(l.numeros ?? []).length} número(s) · próximo envio:{" "}
                      {formatar(l.proximo_envio_em ?? l.agendado_para)}
                      {l.erro ? ` · erro: ${l.erro}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {l.status === "agendado" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => alterarMut.mutate({ id: l.id, acao: "cancelar" })}
                      >
                        <XCircle className="size-4" />
                        Cancelar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => alterarMut.mutate({ id: l.id, acao: "reativar" })}
                      >
                        Reativar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => alterarMut.mutate({ id: l.id, acao: "excluir" })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
