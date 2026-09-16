import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Wifi,
  Loader2,
  Save,
  Eye,
  EyeOff,
  RotateCcw,
  Zap,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { protectedApiCall } from "@/lib/api-shield";
import { useAutoConexaoChave } from "@/hooks/useAutoConexaoChave";
import { compartilharApiGlobal, ouvirApisGlobais } from "@/lib/api-globais";
import { StatusConexaoChave } from "@/components/StatusConexaoChave";
import {
  loadOpenAIConfig,
  saveOpenAIConfig,
  testOpenAIConnection,
  loadTokenUsage,
  resetTokenUsage,
  type OpenAIConfig,
  type TokenUsage,
} from "@/lib/openai-enhancer";

export function OpenAIConfigCard() {
  const [config, setConfig] = useState<OpenAIConfig>(loadOpenAIConfig);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(loadTokenUsage);
  const [lastTestResult, setLastTestResult] = useState<{
    ok: boolean;
    model?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    setConfig(loadOpenAIConfig());
    setTokenUsage(loadTokenUsage());
  }, []);

  // Atualiza tokens periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setTokenUsage(loadTokenUsage());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Regra geral: aplica a configuração ligada pelo superadmin para todos.
  useEffect(() => ouvirApisGlobais(() => setConfig(loadOpenAIConfig())), []);

  function handleChange(value: string) {
    setConfig({ apiKey: value });
    setSaved(false);
    setLastTestResult(null);
  }

  function handleSave() {
    saveOpenAIConfig(config);
    void compartilharApiGlobal("openai", config);
    setSaved(true);
    toast.success("Chave da API OpenAI salva com sucesso.");
  }

  async function handleTestConnection() {
    if (!config.apiKey.trim()) {
      toast.error("Preencha a chave de API antes de testar.");
      return;
    }

    saveOpenAIConfig(config);
    void compartilharApiGlobal("openai", config);
    setSaved(true);
    setTesting(true);
    setLastTestResult(null);

    try {
      const result = await protectedApiCall(
        {
          cardKey: "openai",
          resource: "openai.api",
          limit: 10,
          windowSeconds: 60,
          retries: 1,
          timeoutMs: 120_000,
        },
        () => testOpenAIConnection(config.apiKey),
      );
      setLastTestResult(result);
      if (result.ok) {
        toast.success(
          `Conexão com a OpenAI estabelecida. Modelo: ${result.model}${result.latencyMs ? ` (${result.latencyMs}ms)` : ""}`,
        );
        setTokenUsage(loadTokenUsage());
      } else {
        toast.error(`Falha na conexão: ${result.error}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      setLastTestResult({ ok: false, error: errorMsg });
      toast.error(`Erro ao testar: ${errorMsg}`);
    } finally {
      setTesting(false);
    }
  }

  function handleResetTokens() {
    if (!window.confirm("Zerar o contador de tokens consumidos?")) return;
    resetTokenUsage();
    setTokenUsage(loadTokenUsage());
    toast.success("Contador de tokens zerado.");
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  const autoConexao = useAutoConexaoChave({
    chave: config.apiKey,
    minLength: 20,
    salvar: () => {
      saveOpenAIConfig({ apiKey: config.apiKey.trim() });
      void compartilharApiGlobal("openai", { apiKey: config.apiKey.trim() });
      setSaved(true);
    },
    testar: async () => {
      const result = await testOpenAIConnection(config.apiKey.trim());
      setLastTestResult(result);
      if (result.ok) {
        setTokenUsage(loadTokenUsage());
        return { ok: true };
      }
      return { ok: false, erro: result.error };
    },
  });

  const hasFilled = config.apiKey.trim().length > 0;

  return (
    <Card
      id="openai-config"
      className="border-purple-200/50 bg-gradient-to-br from-purple-50/50 to-pink-50/30 dark:from-purple-950/20 dark:to-pink-950/10"
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
            <Brain className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Configuração API OpenAI</CardTitle>
            <CardDescription>
              Configure a chave de API da OpenAI para melhorar a leitura e extração de dados de PDFs
              e planilhas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="openai-api-key">OPENAI_API_KEY</Label>
            <StatusConexaoChave
              estado={autoConexao.estado}
              erro={autoConexao.erro}
              verificadoEm={autoConexao.verificadoEm}
            />
          </div>
          <div className="relative">
            <Input
              id="openai-api-key"
              type={showKey ? "text" : "password"}
              placeholder="sk-..."
              value={config.apiKey}
              onChange={(e) => handleChange(e.target.value)}
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
            A chave é salva localmente no navegador. Obtenha em{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              platform.openai.com/api-keys
            </a>
          </p>
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
            onClick={() => void handleTestConnection()}
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
        </div>

        {/* Resultado do último teste */}
        {lastTestResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              lastTestResult.ok
                ? "border-emerald-200 bg-emerald-50/50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-red-200 bg-red-50/50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {lastTestResult.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Wifi className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="space-y-0.5">
              {lastTestResult.ok ? (
                <>
                  <p className="font-medium">Conexão estabelecida</p>
                  <p className="text-xs opacity-80">
                    Modelo: {lastTestResult.model}
                    {lastTestResult.latencyMs != null && (
                      <>
                        {" "}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="size-3" />
                          {lastTestResult.latencyMs}ms
                        </span>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Falha na conexão</p>
                  <p className="text-xs opacity-80">{lastTestResult.error}</p>
                </>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Token usage stats */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Consumo de Tokens
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetTokens}
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              Zerar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <p className="text-lg font-bold text-foreground">
                {formatNumber(tokenUsage.totalTokens)}
              </p>
              <p className="text-[11px] text-muted-foreground">Total</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatNumber(tokenUsage.promptTokens)}
              </p>
              <p className="text-[11px] text-muted-foreground">Prompt</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatNumber(tokenUsage.completionTokens)}
              </p>
              <p className="text-[11px] text-muted-foreground">Completion</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {tokenUsage.requestCount}
              </p>
              <p className="text-[11px] text-muted-foreground">Requisições</p>
            </div>
          </div>

          {tokenUsage.lastUsed && (
            <p className="mt-2 text-xs text-muted-foreground">
              Último uso: {new Date(tokenUsage.lastUsed).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
