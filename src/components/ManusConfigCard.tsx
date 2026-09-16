import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Wifi,
  Loader2,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { manusTestarConexao } from "@/lib/manus.functions";
import { useAutoConexaoChave } from "@/hooks/useAutoConexaoChave";
import { compartilharApiGlobal, ouvirApisGlobais } from "@/lib/api-globais";
import { StatusConexaoChave } from "@/components/StatusConexaoChave";
import {
  loadManusConfig,
  saveManusConfig,
  MANUS_PROFILES,
  type ManusConfig,
  type ManusAgentProfile,
} from "@/lib/manus-ai";

const RECURSOS = [
  {
    titulo: "Tarefas assíncronas",
    texto: "Cria tarefas que o agente executa em várias etapas e devolve o resultado final.",
  },
  {
    titulo: "Conversa multi-turno",
    texto: "Continua a mesma tarefa com novas mensagens, mantendo o contexto do agente.",
  },
  {
    titulo: "Perfis de agente",
    texto: "Lite, Standard e Max — escolha entre velocidade, equilíbrio e capacidade máxima.",
  },
  {
    titulo: "Anexos e conectores",
    texto: "Suporta arquivos (PDF, imagens, CSV) e apps conectados na conta Manus.",
  },
  {
    titulo: "Idioma da resposta",
    texto: "Define o idioma de saída da tarefa — configurado aqui como português do Brasil.",
  },
  {
    titulo: "Créditos e limites",
    texto: "Saldo e limites de uso são por conta Manus, compartilhados entre todas as chaves.",
  },
];

export function ManusConfigCard() {
  const [config, setConfig] = useState<ManusConfig>(loadManusConfig);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resultado, setResultado] = useState<{
    ok: boolean;
    latencyMs?: number;
    credits?: number | null;
    detalhe?: string;
    erro?: string;
  } | null>(null);

  useEffect(() => {
    setConfig(loadManusConfig());
  }, []);

  function update(patch: Partial<ManusConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setSaved(false);
    setResultado(null);
  }

  // Regra geral: aplica a configuração ligada pelo superadmin para todos.
  useEffect(() => ouvirApisGlobais(() => setConfig(loadManusConfig())), []);

  function handleSave() {
    saveManusConfig(config);
    void compartilharApiGlobal("manus", config);
    setSaved(true);
    toast.success("Configuração da Manus AI salva.");
  }

  async function handleTest() {
    if (!config.apiKey.trim()) {
      toast.error("Informe a chave de API da Manus antes de testar.");
      return;
    }
    saveManusConfig(config);
    void compartilharApiGlobal("manus", config);
    setSaved(true);
    setTesting(true);
    setResultado(null);

    try {
      const res = await manusTestarConexao({ data: { apiKey: config.apiKey.trim() } });
      if (res.ok) {
        setResultado({
          ok: true,
          latencyMs: res.latencyMs,
          credits: res.credits,
          detalhe: res.detalhe,
        });
        toast.success("Conexão com a Manus AI estabelecida.");
      } else {
        setResultado({ ok: false, erro: res.erro, latencyMs: res.latencyMs });
        toast.error(`Falha na conexão: ${res.erro}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setResultado({ ok: false, erro: msg });
      toast.error(`Erro ao testar: ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  const autoConexao = useAutoConexaoChave({
    chave: config.apiKey,
    minLength: 10,
    salvar: () => saveManusConfig({ ...config, apiKey: config.apiKey.trim() }),
    testar: async () => {
      const res = await manusTestarConexao({ data: { apiKey: config.apiKey.trim() } });
      if (res.ok) {
        setResultado({
          ok: true,
          latencyMs: res.latencyMs,
          credits: res.credits,
          detalhe: res.detalhe,
        });
        setSaved(true);
        return { ok: true };
      }
      setResultado({ ok: false, erro: res.erro, latencyMs: res.latencyMs });
      setSaved(true);
      return { ok: false, erro: res.erro };
    },
  });

  const hasFilled = config.apiKey.trim().length > 0;

  return (
    <Card
      id="manus-config"
      className="border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10"
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Bot className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Manus AI</CardTitle>
            <CardDescription>
              Agente autônomo da Manus (API v2) para tarefas de várias etapas: pesquisa, análise e
              geração de relatórios. Disponível também no Chat IA.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="manus-api-key">MANUS_API_KEY</Label>
            <StatusConexaoChave
              estado={autoConexao.estado}
              erro={autoConexao.erro}
              verificadoEm={autoConexao.verificadoEm}
            />
          </div>

          <div className="relative">
            <Input
              id="manus-api-key"
              type={showKey ? "text" : "password"}
              placeholder="Cole aqui a chave criada na Manus"
              value={config.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              className="bg-background pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            A chave é salva localmente no navegador e enviada apenas para a API oficial{" "}
            <code className="rounded bg-muted px-1">api.manus.ai</code>. Crie a chave em
            Configurações › Integrações do app da Manus.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Perfil do agente</Label>
            <Select
              value={config.agentProfile}
              onValueChange={(v) => update({ agentProfile: v as ManusAgentProfile })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUS_PROFILES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MANUS_PROFILES.find((p) => p.value === config.agentProfile)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manus-locale">Idioma da resposta</Label>
            <Input
              id="manus-locale"
              value={config.locale}
              onChange={(e) => update({ locale: e.target.value })}
              placeholder="pt-BR"
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Código do idioma usado nas respostas (ex.: pt-BR, en).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Ocultar tarefas no app da Manus</p>
            <p className="text-xs text-muted-foreground">
              As tarefas criadas por este painel não aparecem na lista do app.
            </p>
          </div>
          <Switch
            checked={config.hideInTaskList}
            onCheckedChange={(v) => update({ hideInTaskList: v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={!hasFilled}
            className="gap-2"
          >
            <Save className="size-4" />
            {saved ? "Salvo" : "Salvar"}
          </Button>

          <Button
            type="button"
            onClick={() => void handleTest()}
            disabled={!hasFilled || testing}
            className="gap-2"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Wifi className="size-4" />
                Testar Conexão
              </>
            )}
          </Button>

          <a
            href="https://open.manus.ai/docs/v2/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            Documentação da API
            <ExternalLink className="size-3" />
          </a>
        </div>

        {resultado && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              resultado.ok
                ? "border-emerald-200 bg-emerald-50/50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-red-200 bg-red-50/50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {resultado.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Wifi className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="space-y-0.5">
              <p className="font-medium">
                {resultado.ok ? "Conexão estabelecida" : "Falha na conexão"}
              </p>
              <p className="text-xs opacity-80">
                {resultado.ok ? resultado.detalhe : resultado.erro}
              </p>
              <p className="flex flex-wrap items-center gap-3 text-xs opacity-80">
                {resultado.latencyMs != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {resultado.latencyMs}ms
                  </span>
                )}
                {resultado.credits != null && (
                  <span className="inline-flex items-center gap-1">
                    <Coins className="size-3" />
                    {resultado.credits.toLocaleString("pt-BR")} créditos
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Recursos disponíveis</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((r) => (
              <div key={r.titulo} className="rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-medium text-foreground">{r.titulo}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fluxo usado pelo painel: criação da tarefa, acompanhamento do andamento e leitura da
            resposta final do agente. Tarefas longas continuam rodando na Manus mesmo se a página
            for fechada.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
