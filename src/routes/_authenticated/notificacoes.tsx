import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Loader2,
  Send,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PainelPushAdmin } from "@/components/PainelPushAdmin";
import { AvisosAgendadosCard } from "@/components/AvisosAgendadosCard";
import { RastreioPertoPostoCard } from "@/components/RastreioPertoPostoCard";
import { supabase } from "@/integrations/supabase/client";
import { diagnosticoPush } from "@/lib/push.functions";
import {
  CATEGORIAS_PUSH,
  ROTULO_CATEGORIA,
  type CategoriaPush,
  type NotificacaoHistorico,
} from "@/lib/push-tipos";
import {
  disablePushNotifications,
  ehIosSemInstalar,
  enablePushNotifications,
  getPushStatus,
  sendTestPush,
  type EstadoPush,
} from "@/lib/webPush";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações no celular — CIOP" },
      {
        name: "description",
        content:
          "Ative os avisos no celular, escolha as categorias e acompanhe o histórico de notificações do CIOP.",
      },
      { property: "og:title", content: "Notificações no celular — CIOP" },
      {
        property: "og:description",
        content:
          "Avisos operacionais no celular: protocolos, atestados, faltas, documentos e chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificacoesPage,
});

type Preferencias = {
  protocolos: boolean;
  atestados: boolean;
  faltas: boolean;
  nexti: boolean;
  chat: boolean;
  documentos: boolean;
  sistema: boolean;
  sound_enabled: boolean;
  quiet_hours_enabled: boolean;
};

const PREFS_PADRAO: Preferencias = {
  protocolos: true,
  atestados: true,
  faltas: true,
  nexti: true,
  chat: true,
  documentos: true,
  sistema: true,
  sound_enabled: true,
  quiet_hours_enabled: false,
};

const TEXTO_ESTADO: Record<EstadoPush, { rotulo: string; ajuda: string }> = {
  ativado: { rotulo: "Ativadas", ajuda: "Este aparelho recebe os avisos." },
  "nao-ativado": {
    rotulo: "Não ativadas",
    ajuda: "Toque em “Ativar notificações no celular” para começar a receber.",
  },
  bloqueado: {
    rotulo: "Bloqueadas",
    ajuda: "Libere as notificações nas configurações do navegador e tente de novo.",
  },
  incompativel: {
    rotulo: "Navegador incompatível",
    ajuda: "Abra o sistema em outro navegador (Chrome, Edge ou Safari atualizado).",
  },
  "https-necessario": {
    rotulo: "HTTPS necessário",
    ajuda: "Os avisos só funcionam com o endereço seguro (https).",
  },
  "sem-chave": {
    rotulo: "Configuração pendente",
    ajuda: "A chave pública de notificações ainda não foi cadastrada pelo administrador.",
  },
};

function NotificacoesPage() {
  const diagnostico = useServerFn(diagnosticoPush);
  const [estado, setEstado] = useState<EstadoPush>("nao-ativado");
  const [carregando, setCarregando] = useState<"ativar" | "desativar" | "teste" | null>(null);
  const [prefs, setPrefs] = useState<Preferencias>(PREFS_PADRAO);
  const [historico, setHistorico] = useState<NotificacaoHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | CategoriaPush>("todas");
  const [iosAviso, setIosAviso] = useState(false);

  const config = useQuery({
    queryKey: ["diagnostico-push"],
    queryFn: () => diagnostico({}),
    retry: false,
  });

  const atualizarEstado = useCallback(async () => {
    setEstado(await getPushStatus());
  }, []);

  useEffect(() => {
    setIosAviso(ehIosSemInstalar());
    void atualizarEstado();
  }, [atualizarEstado]);

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase
      .from("notification_history")
      .select(
        "id, category, event_type, title, body, target_url, status, sent_count, failed_count, error_message, read_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    setHistorico((data ?? []) as NotificacaoHistorico[]);
    setCarregandoHistorico(false);
  }, []);

  const carregarPrefs = useCallback(async () => {
    const { data: sessao } = await supabase.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) return;
    const { data } = await supabase
      .from("notification_preferences")
      .select(
        "protocolos, atestados, faltas, nexti, chat, documentos, sistema, sound_enabled, quiet_hours_enabled",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (data) setPrefs(data as Preferencias);
  }, []);

  useEffect(() => {
    void carregarHistorico();
    void carregarPrefs();
  }, [carregarHistorico, carregarPrefs]);

  // Tempo real: novos avisos entram na lista sem recarregar a página.
  useEffect(() => {
    const canal = supabase
      .channel("historico-notificacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_history" },
        () => void carregarHistorico(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregarHistorico]);

  async function salvarPrefs(novas: Preferencias) {
    setPrefs(novas);
    const { data: sessao } = await supabase.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...novas }, { onConflict: "user_id" });
    if (error) toast.error("Não foi possível salvar as preferências.");
  }

  async function ativar() {
    setCarregando("ativar");
    try {
      const r = await enablePushNotifications();
      if (r.ok) toast.success("Notificações ativadas neste aparelho.");
      else toast.error(r.erro ?? "Não foi possível ativar.");
      await atualizarEstado();
    } finally {
      setCarregando(null);
    }
  }

  async function desativar() {
    setCarregando("desativar");
    try {
      const r = await disablePushNotifications();
      if (r.ok) toast.success("Notificações desativadas neste aparelho.");
      else toast.error(r.erro ?? "Não foi possível desativar.");
      await atualizarEstado();
    } finally {
      setCarregando(null);
    }
  }

  async function testar() {
    setCarregando("teste");
    try {
      const r = await sendTestPush();
      if (r.ok) toast.success("Notificação de teste enviada.");
      else toast.error(r.erro ?? "Não foi possível enviar o teste.");
      await carregarHistorico();
    } finally {
      setCarregando(null);
    }
  }

  async function marcarTodasLidas() {
    const { error } = await supabase
      .from("notification_history")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) toast.error("Não foi possível marcar como lidas.");
    else await carregarHistorico();
  }

  const visiveis = useMemo(
    () => (filtro === "todas" ? historico : historico.filter((h) => h.category === filtro)),
    [historico, filtro],
  );

  const naoLidas = historico.filter((h) => !h.read_at).length;
  const info = TEXTO_ESTADO[estado];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Painel Inicial
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Bell className="size-6 text-primary" />
          Notificações
        </h1>
        <p className="text-sm text-muted-foreground">
          Receba no celular os avisos de protocolos, atestados, faltas, documentos, chat e sistema.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4 text-primary" />
              Este aparelho
            </CardTitle>
            <CardDescription>{info.ajuda}</CardDescription>
          </div>
          <Badge variant={estado === "ativado" ? "secondary" : "destructive"}>{info.rotulo}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {iosAviso && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              Para receber notificações, adicione este sistema à Tela de Início e depois ative as
              notificações.
            </p>
          )}

          {config.data && !config.data.pronto && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              Configuração necessária pendente: {config.data.faltando.join(", ")}. Um administrador
              precisa cadastrar esses valores para os avisos serem entregues.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void ativar()}
              disabled={carregando !== null || estado === "ativado"}
            >
              {carregando === "ativar" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Bell className="size-4" />
              )}
              Ativar notificações no celular
            </Button>
            <Button
              variant="outline"
              onClick={() => void desativar()}
              disabled={carregando !== null || estado !== "ativado"}
            >
              {carregando === "desativar" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BellOff className="size-4" />
              )}
              Desativar notificações
            </Button>
            <Button
              variant="secondary"
              onClick={() => void testar()}
              disabled={carregando !== null || estado !== "ativado"}
            >
              {carregando === "teste" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar notificação de teste
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferências</CardTitle>
          <CardDescription>
            Escolha o que você quer receber neste e nos seus aparelhos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {CATEGORIAS_PUSH.map((c) => (
            <div
              key={c}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <Label htmlFor={`pref-${c}`}>{ROTULO_CATEGORIA[c]}</Label>
              <Switch
                id={`pref-${c}`}
                checked={prefs[c]}
                onCheckedChange={(v) => void salvarPrefs({ ...prefs, [c]: v })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="pref-som">Som do aviso</Label>
            <Switch
              id="pref-som"
              checked={prefs.sound_enabled}
              onCheckedChange={(v) => void salvarPrefs({ ...prefs, sound_enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="pref-silencio">Horário silencioso</Label>
            <Switch
              id="pref-silencio"
              checked={prefs.quiet_hours_enabled}
              onCheckedChange={(v) => void salvarPrefs({ ...prefs, quiet_hours_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <PainelPushAdmin />

      <AvisosAgendadosCard />

      <RastreioPertoPostoCard />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Histórico</CardTitle>
            <CardDescription>
              {naoLidas > 0 ? `${naoLidas} aviso(s) não lido(s).` : "Nenhum aviso não lido."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {CATEGORIAS_PUSH.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ROTULO_CATEGORIA[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void marcarTodasLidas()}>
              <CheckCheck className="size-4" />
              Marcar todas como lidas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {carregandoHistorico && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando...
            </p>
          )}
          {!carregandoHistorico && visiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum aviso por aqui ainda.</p>
          )}
          {visiveis.map((h) => (
            <div
              key={h.id}
              className={`rounded-lg border p-3 ${
                h.read_at ? "border-border bg-muted/20" : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{h.title}</span>
                <Badge variant="outline">
                  {ROTULO_CATEGORIA[h.category as CategoriaPush] ?? h.category}
                </Badge>
                <Badge
                  variant={
                    h.status === "sent"
                      ? "secondary"
                      : h.status === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {h.status === "sent"
                    ? "entregue"
                    : h.status === "partial"
                      ? "parcial"
                      : h.status === "failed"
                        ? "falhou"
                        : "pendente"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{h.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString("pt-BR")}
                {h.error_message ? ` • ${h.error_message}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
