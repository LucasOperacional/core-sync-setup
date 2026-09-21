import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Save,
  Send,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evolutionGoAtivarRecebimento,
  evolutionGoEnviarTexto,
  evolutionGoObterConfig,
  evolutionGoSalvarConfig,
  evolutionGoStatus,
  type EvolutionGoStatus,
} from "@/lib/evolution-go.functions";

const DOCS = "https://docs.evolutionfoundation.com.br/evolution-go";

/**
 * Card administrativo do Evolution Go (API WhatsApp em Go).
 * Configura URL, chave global e token da instância; mostra conexão e QR Code.
 * O mesmo servidor alimenta o card "WhatsApp" do Chat Interno.
 */
export function EvolutionGoCard() {
  const obterConfig = useServerFn(evolutionGoObterConfig);
  const salvarConfig = useServerFn(evolutionGoSalvarConfig);
  const buscarStatus = useServerFn(evolutionGoStatus);
  const enviarTexto = useServerFn(evolutionGoEnviarTexto);
  const ativarWebhook = useServerFn(evolutionGoAtivarRecebimento);

  const [baseUrl, setBaseUrl] = useState("");
  const [instancia, setInstancia] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [apiKeyDefinida, setApiKeyDefinida] = useState(false);
  const [tokenDefinido, setTokenDefinido] = useState(false);

  const [status, setStatus] = useState<EvolutionGoStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState("");
  const [numeroNotificacao, setNumeroNotificacao] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [ativando, setAtivando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const cfg = await obterConfig({});
      if (cfg.ok) {
        setBaseUrl(cfg.baseUrl);
        setInstancia(cfg.instancia);
        setApiKeyDefinida(cfg.apiKeyDefinida);
        setTokenDefinido(cfg.tokenDefinido);
        setWebhookUrl(cfg.webhookUrl);
      }
      setStatus(await buscarStatus({}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [obterConfig, buscarStatus]);

  useEffect(() => {
    void carregar();
    setNumeroNotificacao(
      window.localStorage.getItem("evolution-go-numero-notificacao") ?? "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvarNumeroNotificacao = () => {
    const numero = numeroNotificacao.replace(/\D/g, "");
    setNumeroNotificacao(numero);
    window.localStorage.setItem("evolution-go-numero-notificacao", numero);
    toast.success(
      numero
        ? "Número das notificações de control salvo neste dispositivo."
        : "Número das notificações removido.",
    );
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarConfig({ data: { baseUrl, apiKey, token, instancia } });
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível salvar.");
        return;
      }
      setApiKey("");
      setToken("");
      toast.success("Configuração do Evolution Go salva.");
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const ativarRecebimento = async () => {
    setAtivando(true);
    try {
      // O endereço de pré-visualização (*.lovableproject.com) exige login e
      // recusa a chamada do servidor de WhatsApp. Usamos o endereço estável.
      const host = window.location.hostname;
      const projeto = host.endsWith(".lovableproject.com") ? host.split(".")[0] : "";
      const base = projeto
        ? `https://project--${projeto}-dev.lovable.app`
        : window.location.origin;
      const url = `${base}/api/public/evolution-webhook`;
      const r = await ativarWebhook({ data: { webhookUrl: url } });
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível ativar o recebimento.");
        return;
      }
      setWebhookUrl(url);
      toast.success("Recebimento de mensagens ativado.");
      await carregar();
    } finally {
      setAtivando(false);
    }
  };

  const atualizarStatus = async () => {
    setTestando(true);
    try {
      const st = await buscarStatus({});
      setStatus(st);
      if (st.erro) toast.error(st.erro);
      else if (st.logado) toast.success("WhatsApp conectado.");
      else toast.info("Instância ainda não pareada. Leia o QR Code.");
    } finally {
      setTestando(false);
    }
  };

  const enviarTeste = async () => {
    const numero = numeroTeste.replace(/\D/g, "");
    if (!numero) {
      toast.error("Informe o número com DDI e DDD (ex.: 5511999999999).");
      return;
    }
    setTestando(true);
    try {
      const r = await enviarTexto({
        data: { numero, texto: "Mensagem de teste enviada pelo painel (Evolution Go)." },
      });
      if (r.ok) toast.success("Mensagem de teste enviada.");
      else toast.error(r.erro ?? "Falha ao enviar.");
    } finally {
      setTestando(false);
    }
  };

  const badge = !status?.configurado ? (
    <Badge variant="outline">Não configurado</Badge>
  ) : status.erro ? (
    <Badge variant="destructive">Erro</Badge>
  ) : status.logado ? (
    <Badge className="bg-emerald-500/15 text-emerald-500">Conectado</Badge>
  ) : (
    <Badge variant="secondary">Aguardando QR Code</Badge>
  );

  return (
    <Card id="evolution-go">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15">
              <MessageCircle className="size-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle>Evolution Go (WhatsApp)</CardTitle>
              <CardDescription>
                Servidor de WhatsApp que alimenta o card WhatsApp do Chat Interno
              </CardDescription>
            </div>
          </div>
          {carregando ? <Loader2 className="size-4 animate-spin" /> : badge}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="evo-url">URL da API</Label>
            <Input
              id="evo-url"
              placeholder="https://seu-servidor.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-inst">Nome da instância</Label>
            <Input
              id="evo-inst"
              placeholder="evolution"
              value={instancia}
              onChange={(e) => setInstancia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-key">
              Chave global (GLOBAL_API_KEY){apiKeyDefinida ? " — já salva" : ""}
            </Label>
            <Input
              id="evo-key"
              type="password"
              placeholder={apiKeyDefinida ? "••••••••" : "sua-chave-secreta"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-token">
              Token da instância{tokenDefinido ? " — já salvo" : " (opcional)"}
            </Label>
            <Input
              id="evo-token"
              type="password"
              placeholder={tokenDefinido ? "••••••••" : "token da instância"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>

        {status?.erro ? <p className="text-sm text-destructive">{status.erro}</p> : null}
        {status?.nome ? (
          <p className="text-sm text-muted-foreground">Número conectado: {status.nome}</p>
        ) : null}

        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <Label>Recebimento de mensagens</Label>
          <p className="text-sm text-muted-foreground">
            {webhookUrl
              ? `Ativo: as mensagens recebidas entram no Chat Interno (${webhookUrl}).`
              : "Ative para que as mensagens recebidas no WhatsApp apareçam no Chat Interno."}
          </p>
          <Button variant="secondary" size="sm" onClick={ativarRecebimento} disabled={ativando}>
            {ativando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Webhook className="mr-2 size-4" />
            )}
            {webhookUrl ? "Reativar recebimento" : "Ativar recebimento"}
          </Button>
        </div>


        {status?.qrCode ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <QrCode className="size-4" /> Leia o QR Code no WhatsApp do celular
            </p>
            <img
              src={
                status.qrCode.startsWith("data:")
                  ? status.qrCode
                  : `data:image/png;base64,${status.qrCode}`
              }
              alt="QR Code de pareamento do WhatsApp no Evolution Go"
              className="size-56 rounded bg-white p-2"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Salvar
          </Button>
          <Button variant="outline" onClick={atualizarStatus} disabled={testando}>
            {testando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Testar conexão
          </Button>
          <Button variant="outline" asChild>
            <Link to="/chat-interno">
              <MessageCircle className="mr-2 size-4" />
              Abrir WhatsApp no Chat Interno
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <a href={DOCS} target="_blank" rel="noreferrer">
              <BookOpen className="mr-2 size-4" />
              Documentação
            </a>
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div>
            <Label htmlFor="evo-notificacao-control">Número para notificações do control</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Receberá uma mensagem quando o supervisor chegar ao posto e outra quando finalizar o control. Informe com DDI e DDD.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="evo-notificacao-control"
              placeholder="5511999999999"
              value={numeroNotificacao}
              onChange={(e) => setNumeroNotificacao(e.target.value)}
              className="w-64"
            />
            <Button variant="secondary" onClick={salvarNumeroNotificacao}>
              <Save className="mr-2 size-4" />
              Salvar número
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="evo-teste">Enviar mensagem de teste</Label>
            <Input
              id="evo-teste"
              placeholder="5511999999999"
              value={numeroTeste}
              onChange={(e) => setNumeroTeste(e.target.value)}
              className="w-56"
            />
          </div>
          <Button variant="secondary" onClick={enviarTeste} disabled={testando}>
            <Send className="mr-2 size-4" />
            Enviar teste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
