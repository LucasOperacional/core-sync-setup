import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles } from "lucide-react";
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

import { enviarNotificacaoPush, listarPessoasPush, previaTextoPush } from "@/lib/push.functions";
import { CATEGORIAS_PUSH, ROTULO_CATEGORIA, type CategoriaPush } from "@/lib/push-tipos";

/** Painel de envio de avisos — só aparece para administradores (validado no servidor). */
export function PainelPushAdmin() {
  const pessoas = useServerFn(listarPessoasPush);
  const previa = useServerFn(previaTextoPush);
  const enviar = useServerFn(enviarNotificacaoPush);

  const [categoria, setCategoria] = useState<CategoriaPush>("sistema");
  const [evento, setEvento] = useState("aviso_manual");
  const [contexto, setContexto] = useState("");
  const [rota, setRota] = useState("/notificacoes");
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  const lista = useQuery({
    queryKey: ["pessoas-push"],
    queryFn: () => pessoas({}),
    retry: false,
  });

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    const todas = lista.data ?? [];
    if (!termo) return todas;
    return todas.filter(
      (p) => p.nome.toLowerCase().includes(termo) || p.email.toLowerCase().includes(termo),
    );
  }, [lista.data, filtro]);

  const gerarPrevia = useMutation({
    mutationFn: () =>
      previa({
        data: {
          category: categoria,
          event: evento.trim() || "aviso_manual",
          context: contexto.trim() ? { detalhe: contexto.trim() } : {},
        },
      }),
    onSuccess: (r) => {
      setTitulo(r.title);
      setCorpo(r.body);
      toast.success(r.fonte === "gemini" ? "Prévia gerada pela IA." : "Prévia padrão gerada.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a prévia."),
  });

  const disparar = useMutation({
    mutationFn: () =>
      enviar({
        data: {
          category: categoria,
          event: evento.trim() || "aviso_manual",
          recipientUserIds: selecionados,
          context: contexto.trim() ? { detalhe: contexto.trim() } : {},
          targetUrl: rota.trim() || null,
          titleOverride: titulo.trim() || null,
          bodyOverride: corpo.trim() || null,
        },
      }),
    onSuccess: (r) => {
      const entregues = r.resultados.filter((x) => x.status === "sent").length;
      const parciais = r.resultados.filter((x) => x.status === "partial").length;
      const falhas = r.resultados.filter((x) => x.status === "failed").length;
      const semAparelho = r.resultados.filter(
        (x) => x.motivo === "Nenhum dispositivo ativo",
      ).length;
      toast.success(
        `Entregues: ${entregues} • Parciais: ${parciais} • Falhas: ${falhas} • Sem celular: ${semAparelho}`,
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar."),
  });

  function alternar(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  if (lista.isError) return null; // não é administrador

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">Enviar aviso (administração)</CardTitle>
        <CardDescription>
          Escolha a categoria, as pessoas e gere o texto com a IA antes de enviar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="push-evento">Evento</Label>
            <Input id="push-evento" value={evento} onChange={(e) => setEvento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-rota">Página de destino</Label>
            <Input id="push-rota" value={rota} onChange={(e) => setRota(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="push-contexto">Contexto para a IA</Label>
          <Textarea
            id="push-contexto"
            rows={2}
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Ex.: protocolo do colaborador João aprovado automaticamente"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => gerarPrevia.mutate()}
            disabled={gerarPrevia.isPending}
          >
            {gerarPrevia.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Gerar prévia com IA
          </Button>
          <span className="text-xs text-muted-foreground">
            Você pode editar o título e o texto antes de enviar.
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="push-titulo">Título (até 50)</Label>
            <Input
              id="push-titulo"
              maxLength={50}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-corpo">Texto (até 150)</Label>
            <Input
              id="push-corpo"
              maxLength={150}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Pessoas ({selecionados.length} selecionadas)</Label>
            <div className="flex gap-2">
              <Input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                className="h-9 w-56"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelecionados(visiveis.map((p) => p.id))}
              >
                Selecionar todos
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelecionados([])}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {lista.isPending && (
              <p className="p-2 text-sm text-muted-foreground">Carregando pessoas...</p>
            )}
            {visiveis.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => alternar(p.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selecionados.includes(p.id) ? "bg-primary/10 text-foreground" : "hover:bg-accent"
                }`}
              >
                <span className="truncate">
                  {p.nome} <span className="text-muted-foreground">• {p.email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{p.papel}</Badge>
                  <Badge variant={p.temAparelho ? "secondary" : "destructive"}>
                    {p.temAparelho ? "celular ativo" : "sem celular"}
                  </Badge>
                </span>
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          onClick={() => disparar.mutate()}
          disabled={disparar.isPending || selecionados.length === 0}
        >
          {disparar.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Enviar aviso
        </Button>
      </CardContent>
    </Card>
  );
}
