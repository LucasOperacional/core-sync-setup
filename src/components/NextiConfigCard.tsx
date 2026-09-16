import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Save,
  Eye,
  EyeOff,
  Power,
  PowerOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { protectedApiCall } from "@/lib/api-shield";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notificarNextiApiStatus } from "@/lib/nexti-api-status";
import {
  callNexti,
  getNextiConfig,
  saveNextiConfig,
  setNextiApiEnabled,
  type NextiResult,
  type NextiConfigValues,
} from "@/lib/nexti.functions";

type NextiTestResult = NextiResult & { functionUrl?: string | undefined };

const causeLabels: Record<string, string> = {
  missing_config: "Configuração ausente no backend",
  invalid_url: "URL base inválida",
  invalid_endpoint: "Endpoint inválido",
  invalid_url_or_endpoint: "URL, endpoint ou parâmetros inválidos",
  authentication: "Falha de autenticação",
  permission: "Permissão negada",
  cors: "Bloqueio de CORS",
  timeout: "Tempo limite excedido",
  rate_limit: "Limite de requisições atingido",
  server_unavailable: "Servidor indisponível",
  network_error: "Erro de rede",
  nexti_error: "Erro retornado pela NEXTI",
  internal_error: "Erro interno do backend",
};

const emptyConfig: NextiConfigValues = {
  enabled: true,
  baseUrl: "",
  clientId: "",
  clientSecret: "",
  username: "",
  token: "",
  tokenEndpoint: "",
  testEndpoint: "",
};

function buildFailureMessage(result: NextiTestResult) {
  const status = result.httpStatus ? `HTTP ${result.httpStatus}` : "Sem código HTTP";
  const cause = result.causeCode
    ? (causeLabels[result.causeCode] ?? result.causeCode)
    : "Causa não identificada";
  const detail = result.error || "Não foi possível concluir o teste de conexão com a NEXTI.";
  return `${status} · ${cause}: ${detail}`;
}

function SecretInput(props: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={visible ? "text" : "password"}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete="off"
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Ocultar valor" : "Mostrar valor"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function NextiConfigCard() {
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  const [config, setConfig] = useState<NextiConfigValues>(emptyConfig);
  const [lastTestResult, setLastTestResult] = useState<NextiTestResult | null>(null);

  const testNexti = useServerFn(callNexti);
  const fetchConfig = useServerFn(getNextiConfig);
  const persistConfig = useServerFn(saveNextiConfig);
  const toggleApi = useServerFn(setNextiApiEnabled);
  const [togglingApi, setTogglingApi] = useState(false);

  const functionUrl = "Backend do app (server function segura)";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!sessionData.session) return; // sem login: formulário fica oculto
        setPodeConfigurar(true);
        try {
          const result = await fetchConfig();
          if (!cancelled && result.ok && result.config) {
            setConfig({ ...emptyConfig, ...result.config });
          }
        } catch {
          // logado mas leitura falhou: formulário permanece disponível com campos vazios
        }
      } catch {
        // sem sessão: formulário fica oculto
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchConfig]);

  function updateField(field: keyof NextiConfigValues) {
    return (value: string) => setConfig((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await persistConfig({ data: config });
      if (!result.ok) {
        toast.error(result.error || "Não foi possível salvar a configuração.");
        return;
      }
      toast.success("Configuração da NEXTI salva com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleApi(next: boolean) {
    const previous = config.enabled;
    setConfig((prev) => ({ ...prev, enabled: next }));
    setTogglingApi(true);
    try {
      const result = await toggleApi({ data: { enabled: next } });
      if (!result.ok) {
        setConfig((prev) => ({ ...prev, enabled: previous }));
        toast.error(result.error || "Não foi possível alterar o estado da API NEXTI.");
        return;
      }
      notificarNextiApiStatus(next);
      toast.success(
        next
          ? "API NEXTI ligada."
          : "API NEXTI desligada. As sincronizações automáticas ficarão pausadas.",
      );
    } catch (err) {
      setConfig((prev) => ({ ...prev, enabled: previous }));
      toast.error(err instanceof Error ? err.message : "Erro ao alterar o estado da API NEXTI.");
    } finally {
      setTogglingApi(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setLastTestResult(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        const result: NextiTestResult = {
          ok: false,
          error: "Sessão ausente ou expirada. Faça login novamente antes de testar a integração.",
          causeCode: "authentication",
          httpStatus: 401,
          functionUrl,
          checkedAt: new Date().toISOString(),
        };
        setLastTestResult(result);
        toast.error(buildFailureMessage(result));
        return;
      }

      const result = await protectedApiCall(
        {
          cardKey: "nexti",
          resource: "nexti.api",
          limit: 10,
          windowSeconds: 60,
          retries: 1,
          timeoutMs: 60_000,
        },
        () => testNexti({ data: { action: "testConnection" } }),
      );
      const finalResult: NextiTestResult = {
        ...(result as NextiResult),
        functionUrl,
        checkedAt: new Date().toISOString(),
      };

      setLastTestResult(finalResult);

      if (finalResult.ok) {
        toast.success(finalResult.message || "Conexão com a NEXTI realizada com sucesso");
        return;
      }

      toast.error(buildFailureMessage(finalResult));
    } catch (err) {
      const result: NextiTestResult = {
        ok: false,
        error:
          err instanceof Error ? err.message : "Erro desconhecido ao testar conexão com a NEXTI.",
        causeCode: "network_error",
        functionUrl,
        checkedAt: new Date().toISOString(),
      };
      setLastTestResult(result);
      toast.error(buildFailureMessage(result));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      id="nexti-config"
      className="border-blue-200/50 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10"
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            <Settings className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Configuração API Nexti</CardTitle>
            <CardDescription>
              Qualquer usuário autenticado pode preencher as credenciais, ligar/desligar e testar a
              integração com a API NEXTI pelo backend do app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/80 p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-lg ${
                config.enabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {config.enabled ? <Power className="size-5" /> : <PowerOff className="size-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                API NEXTI
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? "Ligada" : "Desligada"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {config.enabled
                  ? "Sincronizações e consultas à NEXTI estão liberadas."
                  : "Todas as chamadas à NEXTI estão bloqueadas até ligar novamente."}
              </p>
            </div>
          </div>
          {podeConfigurar ? (
            <div className="flex items-center gap-2">
              {togglingApi && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={config.enabled}
                disabled={togglingApi || loadingConfig}
                onCheckedChange={(checked) => void handleToggleApi(checked)}
                aria-label={config.enabled ? "Desligar API NEXTI" : "Ligar API NEXTI"}
              />
              <Button
                type="button"
                variant={config.enabled ? "destructive" : "default"}
                size="sm"
                className="gap-2"
                disabled={togglingApi || loadingConfig}
                onClick={() => void handleToggleApi(!config.enabled)}
              >
                {config.enabled ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                {config.enabled ? "Desligar API" : "Ligar API"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Faça login para ligar ou desligar a integração.
            </p>
          )}
        </div>

        <Alert className="border-blue-200 bg-blue-50/60 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <ShieldCheck className="size-4" />
          <AlertTitle>Credenciais protegidas</AlertTitle>
          <AlertDescription className="text-sm">
            As informações são salvas no banco de dados com acesso restrito a usuários autenticados
            e usadas somente pelo backend do app — nunca expostas no navegador de outros usuários.
            Os dados da NEXTI <strong>não são vinculados ao Dashboard Control</strong>: o Control
            usa apenas relatórios em PDF importados.
          </AlertDescription>
        </Alert>

        {podeConfigurar && (
          <form
            className="space-y-4 rounded-lg border border-border bg-background/80 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Credenciais da NEXTI</h3>

            <div className="space-y-1.5">
              <Label htmlFor="nexti-base-url">URL base (NEXTI_BASE_URL)</Label>
              <Input
                id="nexti-base-url"
                type="url"
                value={config.baseUrl}
                placeholder="https://api.nexti.com"
                onChange={(e) => updateField("baseUrl")(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nexti-client-id">Client ID (NEXTI_CLIENT_ID)</Label>
                <Input
                  id="nexti-client-id"
                  value={config.clientId}
                  placeholder="client id"
                  onChange={(e) => updateField("clientId")(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <SecretInput
                id="nexti-client-secret"
                label="Client Secret (NEXTI_CLIENT_SECRET)"
                value={config.clientSecret}
                placeholder="client secret"
                onChange={updateField("clientSecret")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nexti-username">Usuário de integração (opcional)</Label>
                <Input
                  id="nexti-username"
                  value={config.username}
                  placeholder="usuário de integração"
                  onChange={(e) => updateField("username")(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <SecretInput
                id="nexti-token"
                label="Token / senha (opcional)"
                value={config.token}
                placeholder="token ou senha"
                onChange={updateField("token")}
              />
            </div>

            <details className="rounded-md border border-dashed border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Endpoints opcionais (avançado)
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nexti-token-endpoint">Endpoint de autenticação</Label>
                  <Input
                    id="nexti-token-endpoint"
                    value={config.tokenEndpoint}
                    placeholder="/security/oauth/token"
                    onChange={(e) => updateField("tokenEndpoint")(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nexti-test-endpoint">Endpoint de teste</Label>
                  <Input
                    id="nexti-test-endpoint"
                    value={config.testEndpoint}
                    placeholder="/api/persons?size=1"
                    onChange={(e) => updateField("testEndpoint")(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={saving || loadingConfig}
                className="gap-2"
                variant="secondary"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Salvar configuração
                  </>
                )}
              </Button>

              <Button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testing}
                className="gap-2"
              >
                {testing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Testando conexão...
                  </>
                ) : (
                  <>
                    <Wifi className="size-4" />
                    Testar conexão com a NEXTI
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {!podeConfigurar && !loadingConfig && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testing}
              className="gap-2"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Testando conexão...
                </>
              ) : (
                <>
                  <Wifi className="size-4" />
                  Testar conexão com a NEXTI
                </>
              )}
            </Button>
          </div>
        )}

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
              <WifiOff className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="space-y-1">
              {lastTestResult.ok ? (
                <>
                  <p className="font-medium">Conexão com a NEXTI realizada com sucesso</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
                    {lastTestResult.httpStatus != null && (
                      <span>HTTP {lastTestResult.httpStatus}</span>
                    )}
                    {lastTestResult.endpoint && <span>Endpoint: {lastTestResult.endpoint}</span>}
                    {lastTestResult.latencyMs != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="size-3" />
                        {lastTestResult.latencyMs}ms
                      </span>
                    )}
                    {lastTestResult.attempts != null && (
                      <span>Tentativas: {lastTestResult.attempts}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-medium">Falha ao conectar com a NEXTI</p>
                  <p className="text-xs opacity-85">{buildFailureMessage(lastTestResult)}</p>
                  {lastTestResult.endpoint && (
                    <p className="text-xs opacity-75">
                      Endpoint testado: {lastTestResult.endpoint}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
