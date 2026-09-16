import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileWarning,
  FileCheck2,
  FileScan,
  Activity,
  RefreshCw,
  Eye,
  Undo2,
  Lock,
  Unlock,
  Server,
  Wifi,
  WifiOff,
  Database,
  Key,
  Upload,
  Trash2,
  ClipboardCheck,
  Search,
  Filter,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useOperationalAI } from "@/hooks/use-operational-ai";
import {
  fetchAuditLogs,
  insertAuditLog,
  approveAuditEntry,
  rollbackAuditEntry,
  type AuditLogEntry,
} from "@/lib/security-audit-db";
import { calcularHashSha256, extrairTexto } from "@/lib/atestado-verificador";
import type { ClassificacaoAtestado } from "@/lib/atestado-types";
import { SecurityShieldPanel } from "@/components/SecurityShieldPanel";

/* ─── File validation types ─── */
interface FileValidationResult {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  hash: string;
  status: "approved" | "blocked" | "warning";
  issues: string[];
  timestamp: string;
  isDuplicate: boolean;
}

/* ─── Certificate validation types ─── */
interface CertificateValidation {
  id: string;
  fileName: string;
  classification: string;
  riskScore: number;
  extractedFields: string[];
  missingFields: string[];
  issues: string[];
  timestamp: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".xls", ".jpg", ".jpeg", ".png"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];

/* ─── Helpers ─── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function severityColor(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-red-500/10 text-red-500 border-red-500/30";
    case "high":
      return "bg-orange-500/10 text-orange-500 border-orange-500/30";
    case "medium":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
    case "low":
      return "bg-blue-500/10 text-blue-500 border-blue-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "resolved":
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case "detected":
      return <AlertTriangle className="size-4 text-yellow-500" />;
    case "failed":
      return <XCircle className="size-4 text-red-500" />;
    case "recovering":
      return <RefreshCw className="size-4 text-blue-500 animate-spin" />;
    case "pending_review":
      return <Eye className="size-4 text-orange-500" />;
    default:
      return <Clock className="size-4 text-muted-foreground" />;
  }
}

/* ─── Dashboard Panel ─── */
function DashboardPanel() {
  const { snapshot, runDiagnostics, getRecentErrors, safeReload, refreshSession } =
    useOperationalAI();
  const [diagnostics, setDiagnostics] = useState<{
    supabase: boolean;
    auth: boolean;
    online: boolean;
    timestamp: string;
  } | null>(null);
  const [running, setRunning] = useState(false);

  async function handleDiagnostics() {
    setRunning(true);
    try {
      const result = await runDiagnostics();
      setDiagnostics(result);
      await insertAuditLog({
        event_type: "diagnostics_run",
        severity: result.supabase && result.auth && result.online ? "low" : "high",
        description: `Diagnóstico executado — Supabase: ${result.supabase ? "OK" : "FALHA"}, Auth: ${result.auth ? "OK" : "FALHA"}, Online: ${result.online ? "SIM" : "NÃO"}`,
        metadata: result,
      });
      toast.success("Diagnóstico concluído.");
    } catch {
      toast.error("Falha ao executar diagnóstico.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRefreshSession() {
    const ok = await refreshSession();
    if (ok) {
      toast.success("Sessão renovada com sucesso.");
    } else {
      toast.error("Falha ao renovar sessão.");
    }
  }

  const recentErrors = getRecentErrors(24);
  const criticalCount = recentErrors.filter((e) => e.severity === "critical").length;
  const highCount = recentErrors.filter((e) => e.severity === "high").length;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10">
              <ShieldAlert className="size-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{snapshot.recentErrors}</p>
              <p className="text-[10px] text-muted-foreground">Erros (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <ShieldCheck className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{snapshot.resolved}</p>
              <p className="text-[10px] text-muted-foreground">Resolvidos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <Clock className="size-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{snapshot.pending}</p>
              <p className="text-[10px] text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Activity className="size-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{snapshot.totalActions}</p>
              <p className="text-[10px] text-muted-foreground">Ações</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(criticalCount > 0 || highCount > 0) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldX className="size-6 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">
                {criticalCount > 0 ? `${criticalCount} erro(s) crítico(s)` : ""}
                {criticalCount > 0 && highCount > 0 ? " e " : ""}
                {highCount > 0 ? `${highCount} erro(s) de alta severidade` : ""}
                {" nas últimas 24h"}
              </p>
              <p className="text-xs text-red-400/70">
                Verifique a aba de Erros para detalhes e ações de correção.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnostics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Diagnóstico do Sistema</CardTitle>
          <CardDescription className="text-xs">
            Verificação de saúde dos serviços principais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleDiagnostics()}
              disabled={running}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} />
              Executar Diagnóstico
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefreshSession()}
              className="gap-1.5"
            >
              <Key className="size-3.5" />
              Renovar Sessão
            </Button>
          </div>
          {diagnostics && (
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 ${diagnostics.supabase ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
              >
                <Database
                  className={`size-4 ${diagnostics.supabase ? "text-emerald-500" : "text-red-500"}`}
                />
                <div>
                  <p className="text-xs font-medium">Supabase</p>
                  <p
                    className={`text-[10px] ${diagnostics.supabase ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {diagnostics.supabase ? "Operacional" : "Indisponível"}
                  </p>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 ${diagnostics.auth ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
              >
                {diagnostics.auth ? (
                  <Lock className="size-4 text-emerald-500" />
                ) : (
                  <Unlock className="size-4 text-red-500" />
                )}
                <div>
                  <p className="text-xs font-medium">Autenticação</p>
                  <p
                    className={`text-[10px] ${diagnostics.auth ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {diagnostics.auth ? "Autenticado" : "Sessão expirada"}
                  </p>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 ${diagnostics.online ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
              >
                {diagnostics.online ? (
                  <Wifi className="size-4 text-emerald-500" />
                ) : (
                  <WifiOff className="size-4 text-red-500" />
                )}
                <div>
                  <p className="text-xs font-medium">Rede</p>
                  <p
                    className={`text-[10px] ${diagnostics.online ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {diagnostics.online ? "Online" : "Offline"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Errors Panel ─── */
function ErrorsPanel() {
  const {
    snapshot,
    getRecentErrors,
    resolveError,
    setAutoFix,
    autoFixError,
    autoFixAll,
    isFixing,
    getAutoFixResult,
  } = useOperationalAI();
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [corrigindoTudo, setCorrigindoTudo] = useState(false);

  const errors = getRecentErrors(72);

  const filtered = errors.filter((e) => {
    if (filterSeverity !== "all" && e.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (
      search &&
      !e.message.toLowerCase().includes(search.toLowerCase()) &&
      !e.errorType.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const pendentes = errors.filter((e) => e.status !== "resolved").length;

  async function handleResolve(id: string) {
    resolveError(id);
    await insertAuditLog({
      event_type: "error_resolved",
      severity: "low",
      description: `Erro ${id.slice(0, 8)} marcado como resolvido manualmente.`,
      metadata: { errorId: id },
      allows_rollback: true,
    });
    toast.success("Erro marcado como resolvido.");
  }

  async function handleCorrigir(id: string) {
    const res = await autoFixError(id);
    if (res.success) toast.success(`Correção aplicada (${res.strategy}): ${res.message}`);
    else toast.error(`Não foi possível corrigir (${res.strategy}): ${res.message}`);
    await insertAuditLog({
      event_type: "error_auto_fix",
      severity: res.success ? "low" : "medium",
      description: `Correção automática do erro ${id.slice(0, 8)} — ${res.strategy}: ${res.message}`,
      metadata: { errorId: id, strategy: res.strategy, success: res.success },
      allows_rollback: false,
    });
  }

  async function handleCorrigirTudo() {
    setCorrigindoTudo(true);
    try {
      const { fixed, failed } = await autoFixAll();
      if (fixed > 0) toast.success(`${fixed} erro(s) corrigido(s) automaticamente.`);
      if (failed > 0) toast.warning(`${failed} erro(s) exigem atenção manual.`);
      if (fixed === 0 && failed === 0) toast.info("Nenhum erro pendente para corrigir.");
    } finally {
      setCorrigindoTudo(false);
    }
  }

  function handleToggle(enabled: boolean) {
    setAutoFix(enabled);
    toast.success(enabled ? "Correção automática ativada." : "Correção automática desativada.");
  }

  return (
    <div className="space-y-4">
      {/* Integração automática de correção */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Wrench className="size-5 shrink-0 text-blue-400" />
          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-medium text-foreground">Correção automática integrada</p>
            <p className="text-xs text-muted-foreground">
              Detecta o erro e aplica sozinha a correção: renova sessão, reconecta ao serviço, limpa
              cache e revalida a tela.
              {snapshot.autoFixed > 0
                ? ` ${snapshot.autoFixed} correção(ões) aplicada(s) nesta sessão.`
                : ""}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              snapshot.autoFixEnabled
                ? "border-emerald-500/40 text-emerald-400"
                : "border-muted text-muted-foreground"
            }
          >
            {snapshot.autoFixEnabled ? "Ativa" : "Desativada"}
          </Badge>
          <Switch
            checked={snapshot.autoFixEnabled}
            onCheckedChange={handleToggle}
            aria-label="Ativar correção automática"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={corrigindoTudo || pendentes === 0}
            onClick={() => void handleCorrigirTudo()}
          >
            {corrigindoTudo ? (
              <RefreshCw className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Wrench className="mr-1 size-3.5" />
            )}
            Corrigir agora ({pendentes})
          </Button>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por mensagem ou tipo..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
            <SelectItem value="high">Alto</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="detected">Detectado</SelectItem>
            <SelectItem value="recovering">Recuperando</SelectItem>
            <SelectItem value="resolved">Resolvido</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="pending_review">Revisão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} erro(s) encontrado(s)</p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <ShieldCheck className="size-8 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            Nenhum erro encontrado com os filtros aplicados.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-3">
            {filtered.map((err) => (
              <Card key={err.id} className={`${err.status === "resolved" ? "opacity-60" : ""}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{statusIcon(err.status)}</div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${severityColor(err.severity)}`}
                        >
                          {err.severity.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{err.errorType}</span>
                        <span className="text-[10px] text-muted-foreground">{err.page}</span>
                      </div>
                      <p className="text-xs text-foreground">{err.message}</p>
                      {err.technicalDetails && (
                        <details className="text-[10px] text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            Detalhes técnicos
                          </summary>
                          <pre className="mt-1 max-h-[100px] overflow-auto rounded bg-black/20 p-2 text-[10px]">
                            {err.technicalDetails.slice(0, 500)}
                          </pre>
                        </details>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(err.timestamp).toLocaleString("pt-BR")}
                        </span>
                        {err.retryCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {err.retryCount} tentativa(s)
                          </span>
                        )}
                      </div>
                      {(() => {
                        const fix = getAutoFixResult(err.id);
                        if (!fix) return null;
                        return (
                          <p
                            className={`text-[10px] ${fix.success ? "text-emerald-400" : "text-amber-400"}`}
                          >
                            Correção automática ({fix.strategy}): {fix.message}
                          </p>
                        );
                      })()}
                    </div>
                    {err.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleCorrigir(err.id)}
                        disabled={isFixing(err.id)}
                        className="shrink-0 h-7 px-2 text-xs text-blue-400"
                        title="Corrigir automaticamente"
                      >
                        {isFixing(err.id) ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Wrench className="size-3.5" />
                        )}
                      </Button>
                    )}
                    {err.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleResolve(err.id)}
                        className="shrink-0 text-xs h-7 px-2"
                        title="Marcar como resolvido"
                      >
                        <CheckCircle2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ─── File Validation Panel ─── */
function FileValidationPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<FileValidationResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [knownHashes, setKnownHashes] = useState<Set<string>>(new Set());

  async function validateFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);

    const newResults: FileValidationResult[] = [];
    const updatedHashes = new Set(knownHashes);

    for (const file of Array.from(files)) {
      const issues: string[] = [];
      let status: FileValidationResult["status"] = "approved";
      let isDuplicate = false;

      // 1. Extension check
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        issues.push(`Extensão "${ext}" não permitida. Aceitas: ${ALLOWED_EXTENSIONS.join(", ")}`);
        status = "blocked";
      }

      // 2. MIME type check
      if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && status !== "blocked") {
        issues.push(`Tipo MIME "${file.type}" suspeito.`);
        status = "warning";
      }

      // 3. Size check
      if (file.size > MAX_FILE_SIZE) {
        issues.push(`Arquivo excede o tamanho máximo de ${formatBytes(MAX_FILE_SIZE)}.`);
        status = "blocked";
      }

      if (file.size === 0) {
        issues.push("Arquivo vazio (0 bytes).");
        status = "blocked";
      }

      // 4. Hash / integrity / duplicate
      let hash = "";
      try {
        hash = await calcularHashSha256(file);
        if (updatedHashes.has(hash)) {
          issues.push("Arquivo duplicado (hash SHA-256 já registrado).");
          isDuplicate = true;
          if (status === "approved") status = "warning";
        } else {
          updatedHashes.add(hash);
        }
      } catch {
        issues.push("Não foi possível calcular hash de integridade.");
        if (status === "approved") status = "warning";
      }

      // 5. Magic bytes check for common types
      try {
        const slice = await file.slice(0, 8).arrayBuffer();
        const bytes = new Uint8Array(slice);
        const isPdf =
          bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const isPng =
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // xlsx/xls in zip format

        if (ext === ".pdf" && !isPdf) {
          issues.push("Extensão .pdf mas conteúdo não corresponde a um PDF válido.");
          if (status === "approved") status = "warning";
        }
        if ((ext === ".jpg" || ext === ".jpeg") && !isJpeg) {
          issues.push("Extensão JPEG mas cabeçalho do arquivo não confere.");
          if (status === "approved") status = "warning";
        }
        if (ext === ".png" && !isPng) {
          issues.push("Extensão PNG mas cabeçalho do arquivo não confere.");
          if (status === "approved") status = "warning";
        }
        if (ext === ".xlsx" && !isZip) {
          issues.push("Extensão XLSX mas arquivo não está em formato ZIP.");
          if (status === "approved") status = "warning";
        }
      } catch {
        // ignore magic byte check failures
      }

      if (issues.length === 0) {
        issues.push("Arquivo aprovado. Formato, tamanho e integridade verificados.");
      }

      newResults.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || ext,
        hash,
        status,
        issues,
        timestamp: new Date().toISOString(),
        isDuplicate,
      });

      // Log to audit
      await insertAuditLog({
        event_type: "file_validation",
        severity: status === "blocked" ? "high" : status === "warning" ? "medium" : "low",
        description: `Arquivo "${file.name}" validado: ${status.toUpperCase()}. ${issues.join(" ")}`,
        metadata: { fileName: file.name, fileSize: file.size, hash, status, isDuplicate },
      });
    }

    setKnownHashes(updatedHashes);
    setResults((prev) => [...newResults, ...prev]);
    setProcessing(false);
    if (inputRef.current) inputRef.current.value = "";
    toast.success(`${newResults.length} arquivo(s) validado(s).`);
  }

  const approvedCount = results.filter((r) => r.status === "approved").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  const warningCount = results.filter((r) => r.status === "warning").length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Validação de Arquivos</h3>
        <p className="text-xs text-muted-foreground">
          Valide formato, tamanho, integridade (SHA-256), duplicidade e tipo MIME antes da
          importação. O arquivo original é sempre preservado.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void validateFiles(e.target.files)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="gap-1.5"
        >
          {processing ? (
            <>
              <RefreshCw className="size-3.5 animate-spin" /> Validando...
            </>
          ) : (
            <>
              <Upload className="size-3.5" /> Selecionar Arquivos para Validação
            </>
          )}
        </Button>

        {results.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-500">
              <FileCheck2 className="size-3.5" /> {approvedCount} aprovado(s)
            </span>
            <span className="flex items-center gap-1 text-yellow-500">
              <FileWarning className="size-3.5" /> {warningCount} alerta(s)
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3.5" /> {blockedCount} bloqueado(s)
            </span>
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <FileScan className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum arquivo validado ainda. Selecione arquivos para verificar.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[350px]">
          <div className="space-y-2 pr-3">
            {results.map((r) => (
              <Card
                key={r.id}
                className={
                  r.status === "blocked"
                    ? "border-red-500/30"
                    : r.status === "warning"
                      ? "border-yellow-500/30"
                      : "border-emerald-500/30"
                }
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {r.status === "approved" ? (
                      <FileCheck2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : r.status === "blocked" ? (
                      <XCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                    ) : (
                      <FileWarning className="size-5 text-yellow-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {r.fileName}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            r.status === "approved"
                              ? "border-emerald-500/30 text-emerald-500"
                              : r.status === "blocked"
                                ? "border-red-500/30 text-red-500"
                                : "border-yellow-500/30 text-yellow-500"
                          }`}
                        >
                          {r.status === "approved"
                            ? "APROVADO"
                            : r.status === "blocked"
                              ? "BLOQUEADO"
                              : "ALERTA"}
                        </Badge>
                        {r.isDuplicate && (
                          <Badge variant="secondary" className="text-[10px]">
                            DUPLICADO
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(r.fileSize)} • {r.fileType}
                        {r.hash && ` • SHA-256: ${r.hash.slice(0, 16)}...`}
                      </p>
                      {r.issues.map((issue, idx) => (
                        <p key={idx} className="text-[10px] text-muted-foreground">
                          • {issue}
                        </p>
                      ))}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.timestamp).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ─── Certificate Validation Panel ─── */
function CertificatePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<CertificateValidation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const REQUIRED_FIELDS = ["nomePaciente", "nomeMedico", "crm", "dataEmissao", "diasAfastamento"];
  const FIELD_LABELS: Record<string, string> = {
    nomePaciente: "Nome do Paciente",
    cpf: "CPF",
    nomeMedico: "Nome do Médico",
    crm: "CRM",
    ufCrm: "UF do CRM",
    dataEmissao: "Data de Emissão",
    horaEmissao: "Hora de Emissão",
    diasAfastamento: "Dias de Afastamento",
    dataInicioAfastamento: "Início do Afastamento",
    dataFimAfastamento: "Fim do Afastamento",
    nomeClinica: "Clínica/Hospital",
    cnpjEstabelecimento: "CNPJ",
    codigoValidacao: "Código de Validação",
    cid: "CID",
  };

  const NOT_IDENTIFIED = "Não identificado";

  function classify(
    extractedFields: string[],
    missingFields: string[],
    issues: string[],
    textLength: number,
  ): string {
    // Ilegível: very short or no text
    if (textLength < 20) return "Ilegível";

    // Many critical issues
    const criticalIssues = issues.filter(
      (i) => i.includes("incoerente") || i.includes("alterado") || i.includes("inválida"),
    );
    if (criticalIssues.length >= 2) return "Suspeito";

    // Missing many required fields
    const missingRequired = missingFields.filter((f) => REQUIRED_FIELDS.includes(f));
    if (missingRequired.length >= 3) return "Pendente";

    if (issues.length > 0 || missingRequired.length > 0) return "Pendente";

    return "Aprovado";
  }

  async function validateCertificates(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setProgress(0);

    const total = files.length;
    const newResults: CertificateValidation[] = [];
    const knownHashes = new Set<string>();

    for (let i = 0; i < total; i++) {
      const file = files[i]!;
      setProgress(Math.round((i / total) * 100));

      const issues: string[] = [];
      const extractedFields: string[] = [];
      const missingFields: string[] = [];

      // Hash for duplicate check
      let hash = "";
      try {
        hash = await calcularHashSha256(file);
        if (knownHashes.has(hash)) {
          issues.push("Documento duplicado (mesmo hash SHA-256 de outro arquivo nesta sessão).");
        }
        knownHashes.add(hash);
      } catch {
        /* ignore */
      }

      // Extract text
      let text = "";
      try {
        text = await extrairTexto(file);
      } catch {
        issues.push("Não foi possível extrair texto do documento.");
      }

      // Import the extraction dynamically to avoid large bundle
      const dados: Record<string, unknown> = {};
      try {
        // We use the regex extraction from atestado-verificador
        const mod = await import("@/lib/atestado-verificador");
        // extrairDados is not exported — we replicate field checking from text
        // Check for key patterns in the text
        const fieldChecks: Array<{ key: string; patterns: RegExp[] }> = [
          { key: "nomePaciente", patterns: [/(?:paciente|nome)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im] },
          {
            key: "nomeMedico",
            patterns: [/(?:m[eé]dico|dr\.?|dra\.?)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})/im],
          },
          { key: "crm", patterns: [/(?:CRM)[:\s\-/]*([A-Z]{0,2})[\s\-/]*(\d{4,7})/im] },
          {
            key: "dataEmissao",
            patterns: [/(?:data|emitido|emiss[aã]o)[:\s]*(\d{2}[/\-.]\d{2}[/\-.]\d{2,4})/im],
          },
          {
            key: "diasAfastamento",
            patterns: [
              /(\d{1,3})\s*(?:dia|dias)\s*(?:de)?\s*(?:afastamento|repouso|dispensa)/im,
              /(?:afastamento|afastado)[^\d]*(\d{1,3})\s*(?:dia|dias)/im,
            ],
          },
          { key: "cpf", patterns: [/(\d{3}\.\d{3}\.\d{3}-\d{2})/m] },
          { key: "cid", patterns: [/(?:CID)[:\s\-]*([A-Z]\d{2,3}(?:\.\d{1,2})?)/im] },
          {
            key: "dataInicioAfastamento",
            patterns: [/(?:in[ií]cio|a partir de)[:\s]*(\d{2}[/\-.]\d{2}[/\-.]\d{2,4})/im],
          },
          {
            key: "dataFimAfastamento",
            patterns: [/(?:t[eé]rmino|at[eé]|final|fim)[:\s]*(\d{2}[/\-.]\d{2}[/\-.]\d{2,4})/im],
          },
          {
            key: "nomeClinica",
            patterns: [
              /(?:cl[ií]nica|hospital|laborat[oó]rio)[:\s]+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.]{2,})/im,
            ],
          },
          { key: "cnpjEstabelecimento", patterns: [/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/m] },
          {
            key: "codigoValidacao",
            patterns: [/(?:c[oó]digo de valida[cç][aã]o|hash|chave)[:\s]*([A-Za-z0-9\-]{6,})/im],
          },
        ];

        for (const { key, patterns } of fieldChecks) {
          let found = false;
          for (const p of patterns) {
            if (p.test(text)) {
              found = true;
              break;
            }
          }
          if (found) {
            extractedFields.push(key);
          } else {
            missingFields.push(key);
          }
        }

        // Additional checks
        const hasSignature = /assinatura|assinado/im.test(text);
        const hasStamp = /carimbo|selo/im.test(text);
        if (!hasSignature) issues.push("Assinatura não detectada no texto.");
        if (!hasStamp) issues.push("Carimbo não detectado no texto.");

        // Date coherence check
        const dateMatches = text.match(/(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})/g);
        if (dateMatches && dateMatches.length >= 2) {
          // Simple check: parse and compare
          const dates = dateMatches
            .map((d) => {
              const parts = d.match(/(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})/);
              if (!parts) return null;
              let year = parseInt(parts[3]!, 10);
              if (year < 100) year += 2000;
              return new Date(year, parseInt(parts[2]!, 10) - 1, parseInt(parts[1]!, 10));
            })
            .filter(Boolean) as Date[];

          for (let d = 0; d < dates.length; d++) {
            const dt = dates[d]!;
            if (dt.getFullYear() < 2020 || dt.getFullYear() > 2030) {
              issues.push(`Data suspeita encontrada: ${dateMatches[d]}.`);
            }
          }
        }
      } catch {
        issues.push("Erro na análise de campos do atestado.");
      }

      // Risk score
      const missingReqCount = missingFields.filter((f) => REQUIRED_FIELDS.includes(f)).length;
      let riskScore = missingReqCount * 15 + issues.length * 10;
      if (text.length < 20) riskScore += 30;
      riskScore = Math.min(100, riskScore);

      const classification = classify(extractedFields, missingFields, issues, text.length);

      const result: CertificateValidation = {
        id: crypto.randomUUID(),
        fileName: file.name,
        classification,
        riskScore,
        extractedFields,
        missingFields,
        issues,
        timestamp: new Date().toISOString(),
      };

      newResults.push(result);

      await insertAuditLog({
        event_type: "certificate_validation",
        severity:
          classification === "Aprovado" ? "low" : classification === "Suspeito" ? "high" : "medium",
        description: `Atestado "${file.name}" classificado como: ${classification}. Score de risco: ${riskScore}. Campos extraídos: ${extractedFields.length}. Campos ausentes: ${missingFields.length}.`,
        metadata: {
          fileName: file.name,
          classification,
          riskScore,
          extractedFields,
          missingFields,
          issues,
        },
      });
    }

    setProgress(100);
    setResults((prev) => [...newResults, ...prev]);
    setProcessing(false);
    if (inputRef.current) inputRef.current.value = "";
    toast.success(`${newResults.length} atestado(s) analisado(s).`);
  }

  function classificationColor(c: string): string {
    switch (c) {
      case "Aprovado":
        return "border-emerald-500/30 text-emerald-500";
      case "Pendente":
        return "border-yellow-500/30 text-yellow-500";
      case "Ilegível":
        return "border-orange-500/30 text-orange-500";
      case "Duplicado":
        return "border-blue-500/30 text-blue-500";
      case "Suspeito":
        return "border-red-500/30 text-red-500";
      default:
        return "border-muted text-muted-foreground";
    }
  }

  function classificationIcon(c: string) {
    switch (c) {
      case "Aprovado":
        return <CheckCircle2 className="size-5 text-emerald-500" />;
      case "Pendente":
        return <Clock className="size-5 text-yellow-500" />;
      case "Ilegível":
        return <Eye className="size-5 text-orange-500" />;
      case "Duplicado":
        return <FileScan className="size-5 text-blue-500" />;
      case "Suspeito":
        return <AlertTriangle className="size-5 text-red-500" />;
      default:
        return <FileScan className="size-5 text-muted-foreground" />;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Validação de Atestados Médicos</h3>
        <p className="text-xs text-muted-foreground">
          Extraia dados automaticamente, verifique campos ausentes, datas, CRM e inconsistências.
          Classificação: Aprovado, Pendente, Ilegível, Duplicado ou Suspeito (sem declarar falsidade
          automaticamente).
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => void validateCertificates(e.target.files)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="gap-1.5"
        >
          {processing ? (
            <>
              <RefreshCw className="size-3.5 animate-spin" /> Analisando...
            </>
          ) : (
            <>
              <ClipboardCheck className="size-3.5" /> Selecionar Atestados
            </>
          )}
        </Button>
      </div>

      {processing && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-[10px] text-muted-foreground">Processando... {progress}%</p>
        </div>
      )}

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <ClipboardCheck className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum atestado analisado ainda. Selecione PDFs ou imagens.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[350px]">
          <div className="space-y-2 pr-3">
            {results.map((r) => (
              <Card
                key={r.id}
                className={
                  classificationColor(r.classification).replace("text-", "border-").split(" ")[0]
                }
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {classificationIcon(r.classification)}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {r.fileName}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${classificationColor(r.classification)}`}
                        >
                          {r.classification.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          Risco: {r.riskScore}%
                        </Badge>
                      </div>

                      {r.extractedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.extractedFields.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500"
                            >
                              ✓ {FIELD_LABELS[f] || f}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.missingFields.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.missingFields
                            .filter((f) => REQUIRED_FIELDS.includes(f))
                            .map((f) => (
                              <span
                                key={f}
                                className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500"
                              >
                                ✗ {FIELD_LABELS[f] || f}
                              </span>
                            ))}
                        </div>
                      )}

                      {r.issues.length > 0 && (
                        <div className="space-y-0.5">
                          {r.issues.map((issue, idx) => (
                            <p key={idx} className="text-[10px] text-yellow-500">
                              ⚠ {issue}
                            </p>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.timestamp).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ─── Audit Panel ─── */
function AuditPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");

  async function loadLogs() {
    setLoading(true);
    const data = await fetchAuditLogs(200);
    setLogs(data);
    setLoading(false);
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const filtered = filterType === "all" ? logs : logs.filter((l) => l.event_type === filterType);
  const eventTypes = [...new Set(logs.map((l) => l.event_type))];

  async function handleApprove(entry: AuditLogEntry) {
    if (!window.confirm("Confirma a aprovação desta ação? Esta é uma correção crítica.")) return;
    await approveAuditEntry(entry.id);
    await insertAuditLog({
      event_type: "admin_approval",
      severity: "medium",
      description: `Admin aprovou a ação: ${entry.description.slice(0, 100)}`,
      metadata: { approved_entry_id: entry.id },
    });
    toast.success("Ação aprovada pelo administrador.");
    await loadLogs();
  }

  async function handleRollback(entry: AuditLogEntry) {
    if (!window.confirm("Confirma o rollback desta ação? Ela será revertida.")) return;
    await rollbackAuditEntry(entry.id);
    await insertAuditLog({
      event_type: "rollback_executed",
      severity: "high",
      description: `Rollback executado para ação: ${entry.description.slice(0, 100)}`,
      metadata: { rolled_back_entry_id: entry.id },
      allows_rollback: false,
    });
    toast.success("Rollback executado.");
    await loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Histórico de Auditoria</h3>
          <p className="text-xs text-muted-foreground">
            Registro de todas as ações de segurança, correções e rollbacks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {eventTypes.length > 0 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Filtrar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {eventTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-10 text-center">
          <Shield className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum registro de auditoria encontrado.</p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-3">
            {filtered.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${severityColor(log.severity)}`}
                      >
                        {log.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-medium text-primary">
                          {log.event_type.replace(/_/g, " ")}
                        </span>
                        {log.requires_admin_approval && !log.admin_approved && (
                          <Badge variant="destructive" className="text-[10px]">
                            Aguardando aprovação
                          </Badge>
                        )}
                        {log.admin_approved && (
                          <Badge variant="secondary" className="text-[10px] text-emerald-500">
                            Aprovado
                          </Badge>
                        )}
                        {log.rolled_back && (
                          <Badge variant="secondary" className="text-[10px] text-orange-500">
                            Revertido
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground">{log.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {log.requires_admin_approval && !log.admin_approved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleApprove(log)}
                          className="h-7 px-2 text-xs gap-1"
                          title="Aprovar como admin"
                        >
                          <Lock className="size-3" /> Aprovar
                        </Button>
                      )}
                      {log.allows_rollback && !log.rolled_back && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleRollback(log)}
                          className="h-7 px-2 text-xs gap-1 text-orange-500 hover:text-orange-400"
                          title="Reverter ação"
                        >
                          <Undo2 className="size-3" /> Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ─── Main Security Dashboard ─── */
export function SecurityDashboard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-primary" />
        <div>
          <h3 className="text-base font-semibold text-foreground">IA de Segurança</h3>
          <p className="text-xs text-muted-foreground">
            Monitoramento, detecção, prevenção e correção de erros em todo o projeto.
          </p>
        </div>
      </div>

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="painel" className="text-xs gap-1">
            <Activity className="size-3" /> Painel
          </TabsTrigger>
          <TabsTrigger value="erros" className="text-xs gap-1">
            <ShieldAlert className="size-3" /> Erros
          </TabsTrigger>
          <TabsTrigger value="arquivos" className="text-xs gap-1">
            <FileScan className="size-3" /> Arquivos
          </TabsTrigger>
          <TabsTrigger value="atestados" className="text-xs gap-1">
            <ClipboardCheck className="size-3" /> Atestados
          </TabsTrigger>
          <TabsTrigger value="escudo" className="text-xs gap-1">
            <ShieldCheck className="size-3" /> Escudo
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="text-xs gap-1">
            <Shield className="size-3" /> Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel">
          <DashboardPanel />
        </TabsContent>
        <TabsContent value="erros">
          <ErrorsPanel />
        </TabsContent>
        <TabsContent value="arquivos">
          <FileValidationPanel />
        </TabsContent>
        <TabsContent value="atestados">
          <CertificatePanel />
        </TabsContent>
        <TabsContent value="escudo">
          <SecurityShieldPanel />
        </TabsContent>
        <TabsContent value="auditoria">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
