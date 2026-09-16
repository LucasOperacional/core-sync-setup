import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Bell, Loader2, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { avisosSupervisor, type AvisosSupervisorResultado } from "@/lib/assistente-supervisor.functions";
import { avisarNoCelular, pedirPermissaoAviso } from "@/lib/aviso-chegada";
import { nomeAmigavel } from "@/lib/areas-gerentes";
import { supabase } from "@/integrations/supabase/client";

/** Pega a posição do celular sem travar a tela (silencioso se recusarem). */
function pegarPosicao(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

const CORES: Record<string, string> = {
  alta: "border-destructive/40 bg-destructive/5",
  media: "border-amber-500/40 bg-amber-500/5",
  baixa: "border-border bg-muted/30",
};

export function AssistenteSupervisorCard() {
  const buscar = useServerFn(avisosSupervisor);
  const [dados, setDados] = useState<AvisosSupervisorResultado | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const jaAvisou = useRef<string>("");

  const consulta = useMutation({
    mutationFn: async () => {
      const posicao = await pegarPosicao();
      return buscar({
        data: {
          latitude: posicao?.latitude ?? null,
          longitude: posicao?.longitude ?? null,
        },
      });
    },
    onSuccess: (r) => setDados(r),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar os avisos."),
  });

  const executar = consulta.mutate;
  useEffect(() => {
    void pedirPermissaoAviso();
    executar();
  }, [executar]);

  // Descobre o usuário logado para escutar as notificações dele em tempo real.
  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (ativo) setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sessao) => {
      setUserId(sessao?.user.id ?? null);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Tempo real: quando chega um novo aviso para o supervisor, recarrega as
  // pendências e mostra o aviso na tela sem precisar recarregar a página.
  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel(`assistente-supervisor-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_history",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const novo = payload.new as { title?: string; body?: string };
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            toast(novo.title ?? "Novo aviso", { description: novo.body ?? "" });
          }
          executar();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId, executar]);

  const alta = useMemo(() => dados?.avisos.filter((a) => a.prioridade === "alta") ?? [], [dados]);

  // Aviso na tela (e no celular) para o que é urgente — uma vez por conteúdo.
  useEffect(() => {
    if (alta.length === 0) return;
    const primeiro = alta[0];
    if (!primeiro) return;
    const chave = `${primeiro.titulo}|${primeiro.mensagem}`;
    if (jaAvisou.current === chave) return;
    jaAvisou.current = chave;
    toast.warning(primeiro.titulo, { description: primeiro.mensagem, duration: 12000 });
    void avisarNoCelular(primeiro.titulo, primeiro.mensagem);
  }, [alta]);

  if (dados && !dados.ehSupervisor) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Assistente do supervisor
          </CardTitle>
          <CardDescription>
            {dados?.gerenteNome
              ? `Pendências de ${nomeAmigavel(dados.gerenteNome)}: faltas, movimentações e checklist de campo.`
              : "Analisando suas pendências de faltas, movimentações e checklist de campo."}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => consulta.mutate()}
          disabled={consulta.isPending}
        >
          {consulta.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {dados?.postoPerto && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            <MapPin className="size-4 text-emerald-600" />
            <span className="font-semibold text-foreground">{dados.postoPerto.nome}</span>
            <span className="text-muted-foreground">
              a {dados.postoPerto.distanciaMetros} m de você
              {dados.postoPerto.cidade ? ` • ${dados.postoPerto.cidade}` : ""}
            </span>
            <Badge variant={dados.postoPerto.checklistHoje ? "secondary" : "destructive"}>
              {dados.postoPerto.checklistHoje ? "Checklist de hoje feito" : "Checklist pendente"}
            </Badge>
          </div>
        )}

        {consulta.isPending && !dados && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Gerando os avisos...
          </p>
        )}

        {dados?.avisos.length === 0 && !consulta.isPending && (
          <p className="text-sm text-muted-foreground">
            Nenhuma pendência encontrada agora. Bom trabalho!
          </p>
        )}

        <div className="space-y-3">
          {(dados?.avisos ?? []).map((aviso, i) => (
            <div
              key={`${aviso.titulo}-${i}`}
              className={`rounded-lg border p-3 ${CORES[aviso.prioridade] ?? CORES["baixa"]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {aviso.prioridade === "alta" ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : (
                  <Bell className="size-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-foreground">{aviso.titulo}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{aviso.mensagem}</p>
              {aviso.rota && (
                <Button asChild size="sm" variant="secondary" className="mt-3">
                  <Link to={aviso.rota}>{aviso.acao}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>

        {dados && (
          <p className="text-xs text-muted-foreground">
            {dados.resumo.faltasRegistros} registro(s) de faltas • {dados.resumo.postosVinculados}{" "}
            posto(s) vinculado(s) • {dados.resumo.checklists30Dias} checklist(s) em 30 dias
            {dados.fonte === "gemini" ? " • avisos escritos pela IA" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
