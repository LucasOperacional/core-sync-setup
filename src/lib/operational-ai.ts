/**
 * IA Operacional — Motor principal de monitoramento e recuperação.
 *
 * Responsabilidades:
 * - Capturar erros globais (JS, promises, rede)
 * - Retry com backoff progressivo (2s, 5s, 10s)
 * - Circuit breaker para serviços indisponíveis
 * - Proteger contra loops de recarga
 * - Preservar dados de formulário antes de recargas
 * - Registrar tudo para auditoria
 */

export type ErrorSeverity = "low" | "medium" | "high" | "critical";
export type ErrorStatus = "detected" | "recovering" | "resolved" | "failed" | "pending_review";

export interface OperationalError {
  id: string;
  timestamp: string;
  userId?: string | undefined;
  page: string;
  component?: string | undefined;
  errorType: string;
  message: string;
  technicalDetails?: string | undefined;
  severity: ErrorSeverity;
  status: ErrorStatus;
  retryCount: number;
}

export interface RecoveryAction {
  id: string;
  errorId: string;
  action: string;
  result: "success" | "failure" | "skipped";
  timestamp: string;
  durationMs: number;
  automatic: boolean;
}

export interface OperationalSnapshot {
  totalErrors: number;
  recentErrors: number;
  resolved: number;
  pending: number;
  totalActions: number;
  autoFixEnabled: boolean;
  autoFixed: number;
  autoFixRunning: boolean;
}

export interface AutoFixResult {
  success: boolean;
  strategy: string;
  message: string;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

const RETRY_DELAYS = [2000, 5000, 10000];
const MAX_RETRIES = 3;
const PAGE_RELOAD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30000;
const FORM_DATA_KEY = "__ia_operational_form_backup";
const AUTOFIX_KEY = "__ia_operational_autofix";

let _instance: OperationalAI | null = null;

export class OperationalAI {
  private errors: OperationalError[] = [];
  private actions: RecoveryAction[] = [];
  private circuits: Map<string, CircuitState> = new Map();
  private lastPageReload = 0;
  private listeners: Set<() => void> = new Set();
  private initialized = false;
  private cleanupFns: Array<() => void> = [];
  private autoFixEnabled = true;
  private autoFixed = 0;
  private autoFixRunning = new Set<string>();
  private autoFixLog = new Map<string, AutoFixResult>();

  /**
   * Cached snapshot object. Invalidated (set to null) whenever state changes
   * via notify(). getSnapshot() rebuilds it lazily and returns the same
   * reference until the next mutation — this is required for
   * useSyncExternalStore to work without spurious re-renders.
   */
  private _cachedSnapshot: OperationalSnapshot | null = null;

  static getInstance(): OperationalAI {
    if (!_instance) {
      _instance = new OperationalAI();
    }
    return _instance;
  }

  /** Initialize global error listeners. Call once at app root. */
  init() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    // Global JS errors
    const onError = (event: ErrorEvent) => {
      this.captureError({
        errorType: "javascript_error",
        message: event.message || "Unknown error",
        technicalDetails: event.error?.stack,
        severity: "high",
        component: event.filename ?? undefined,
      });
    };
    window.addEventListener("error", onError);
    this.cleanupFns.push(() => window.removeEventListener("error", onError));

    // Unhandled promise rejections
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      this.captureError({
        errorType: "unhandled_rejection",
        message,
        technicalDetails: reason instanceof Error ? reason.stack : String(reason),
        severity: "high",
      });
    };
    window.addEventListener("unhandledrejection", onRejection);
    this.cleanupFns.push(() => window.removeEventListener("unhandledrejection", onRejection));

    // Offline / online detection
    const onOffline = () => {
      this.captureError({
        errorType: "network_offline",
        message: "Conexão com a internet perdida",
        severity: "critical",
      });
    };
    const onOnline = () => {
      this.resolveErrorsByType("network_offline");
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    this.cleanupFns.push(() => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    });
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.initialized = false;
  }

  // ── Listener API for React ──
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    // Invalidate the cached snapshot so the next getSnapshot() rebuilds it.
    this._cachedSnapshot = null;
    this.listeners.forEach((fn) => fn());
  }

  // ── Error capture ──
  captureError(params: {
    errorType: string;
    message: string;
    technicalDetails?: string | undefined;
    severity: ErrorSeverity;
    component?: string | undefined;
    userId?: string | undefined;
  }): OperationalError {
    const error: OperationalError = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      page: typeof window !== "undefined" ? window.location.pathname : "/",
      status: "detected",
      retryCount: 0,
      ...params,
    };
    this.errors.push(error);
    // Keep max 500 in memory
    if (this.errors.length > 500) this.errors = this.errors.slice(-500);
    this.notify();
    // Integração automática de correção: tenta resolver assim que o erro aparece.
    if (this.autoFixEnabled && typeof window !== "undefined" && this.autoFixRunning.size === 0) {
      setTimeout(() => {
        void this.autoFixError(error.id);
      }, 300);
    }

    return error;
  }

  // ── Recovery with retry + backoff ──
  async attemptRecovery<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: { serviceKey?: string },
  ): Promise<{ success: boolean; result?: T; error?: OperationalError }> {
    const serviceKey = options?.serviceKey ?? operationName;

    // Check circuit breaker
    if (this.isCircuitOpen(serviceKey)) {
      const err = this.captureError({
        errorType: "circuit_open",
        message: `Serviço "${serviceKey}" temporariamente indisponível (circuit breaker aberto)`,
        severity: "high",
      });
      return { success: false, error: err };
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const start = Date.now();
      try {
        const result = await operation();
        this.recordCircuitSuccess(serviceKey);
        if (attempt > 0) {
          this.addAction({
            errorId: "retry_" + operationName,
            action: `Retry #${attempt + 1} de "${operationName}" bem-sucedido`,
            result: "success",
            durationMs: Date.now() - start,
            automatic: true,
          });
        }
        return { success: true, result };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        this.recordCircuitFailure(serviceKey);

        if (attempt < MAX_RETRIES - 1) {
          this.addAction({
            errorId: "retry_" + operationName,
            action: `Tentativa ${attempt + 1}/${MAX_RETRIES} de "${operationName}" falhou. Aguardando ${RETRY_DELAYS[attempt]}ms`,
            result: "failure",
            durationMs: Date.now() - start,
            automatic: true,
          });
          await this.delay(RETRY_DELAYS[attempt] ?? 1000);
        } else {
          const err = this.captureError({
            errorType: "operation_failed",
            message: `Operação "${operationName}" falhou após ${MAX_RETRIES} tentativas: ${errMsg}`,
            technicalDetails: e instanceof Error ? e.stack : undefined,
            severity: "high",
          });
          err.retryCount = MAX_RETRIES;
          err.status = "failed";
          this.addAction({
            errorId: err.id,
            action: `Todas as ${MAX_RETRIES} tentativas de "${operationName}" falharam`,
            result: "failure",
            durationMs: Date.now() - start,
            automatic: true,
          });
          this.notify();
          return { success: false, error: err };
        }
      }
    }
    return { success: false };
  }

  // ── Circuit breaker ──
  private isCircuitOpen(key: string): boolean {
    const state = this.circuits.get(key);
    if (!state || !state.open) return false;
    // Auto-reset after cooldown
    if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
      state.open = false;
      state.failures = 0;
      return false;
    }
    return true;
  }

  private recordCircuitSuccess(key: string) {
    const state = this.circuits.get(key);
    if (state) {
      state.failures = 0;
      state.open = false;
    }
  }

  private recordCircuitFailure(key: string) {
    let state = this.circuits.get(key);
    if (!state) {
      state = { failures: 0, lastFailure: 0, open: false };
      this.circuits.set(key, state);
    }
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= CIRCUIT_THRESHOLD) {
      state.open = true;
    }
  }

  // ── Safe page reload ──
  safeReload() {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (now - this.lastPageReload < PAGE_RELOAD_COOLDOWN_MS) {
      console.warn("[IA Operacional] Reload bloqueado — cooldown de 5 minutos ativo.");
      this.captureError({
        errorType: "reload_blocked",
        message: "Recarga de página bloqueada pelo cooldown de 5 minutos",
        severity: "medium",
      });
      return;
    }
    this.preserveFormData();
    this.lastPageReload = now;
    this.addAction({
      errorId: "page_reload",
      action: "Recarga completa da página como último recurso",
      result: "success",
      durationMs: 0,
      automatic: true,
    });
    window.location.reload();
  }

  // ── Form data preservation ──
  preserveFormData() {
    if (typeof document === "undefined") return;
    try {
      const forms = document.querySelectorAll("form");
      const data: Record<string, Record<string, string>> = {};
      forms.forEach((form, idx) => {
        const formData: Record<string, string> = {};
        const inputs = form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("input, textarea, select");
        inputs.forEach((el) => {
          if (el.name || el.id) {
            formData[el.name || el.id] = el.value;
          }
        });
        if (Object.keys(formData).length > 0) {
          data[`form_${idx}_${form.id || form.name || "anon"}`] = formData;
        }
      });
      if (Object.keys(data).length > 0) {
        sessionStorage.setItem(
          FORM_DATA_KEY,
          JSON.stringify({ page: window.location.pathname, data, ts: Date.now() }),
        );
      }
    } catch {
      // silently ignore
    }
  }

  restoreFormData() {
    if (typeof sessionStorage === "undefined") return;
    try {
      const raw = sessionStorage.getItem(FORM_DATA_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        page: string;
        data: Record<string, Record<string, string>>;
        ts: number;
      };
      // Only restore if same page and less than 10 minutes old
      if (saved.page !== window.location.pathname || Date.now() - saved.ts > 600000) {
        sessionStorage.removeItem(FORM_DATA_KEY);
        return;
      }
      // Best-effort restoration
      const forms = document.querySelectorAll("form");
      forms.forEach((form, idx) => {
        const key = `form_${idx}_${form.id || form.name || "anon"}`;
        const formData = saved.data[key];
        if (!formData) return;
        Object.entries(formData).forEach(([name, value]) => {
          const el = form.querySelector<HTMLInputElement>(`[name="${name}"], #${CSS.escape(name)}`);
          if (el) el.value = value;
        });
      });
      sessionStorage.removeItem(FORM_DATA_KEY);
    } catch {
      // silently ignore
    }
  }

  // ── Session recovery ──
  async refreshSession(): Promise<boolean> {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
      this.addAction({
        errorId: "session_refresh",
        action: "Sessão renovada automaticamente",
        result: "success",
        durationMs: 0,
        automatic: true,
      });
      this.resolveErrorsByType("auth_session_expired");
      return true;
    } catch (e) {
      this.captureError({
        errorType: "auth_session_expired",
        message: "Falha ao renovar sessão: " + (e instanceof Error ? e.message : String(e)),
        severity: "high",
      });
      return false;
    }
  }

  // ── Health checks ──
  async checkSupabaseHealth(): Promise<boolean> {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const { error } = await supabase
        .from("gerentes")
        .select("id")
        .limit(1)
        .abortSignal(controller.signal);
      clearTimeout(timeout);
      if (error) throw error;
      return true;
    } catch {
      return false;
    }
  }

  async checkAuthHealth(): Promise<boolean> {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    } catch {
      return false;
    }
  }

  async runDiagnostics(): Promise<{
    supabase: boolean;
    auth: boolean;
    online: boolean;
    timestamp: string;
  }> {
    const [supabaseOk, authOk] = await Promise.all([
      this.checkSupabaseHealth(),
      this.checkAuthHealth(),
    ]);
    const result = {
      supabase: supabaseOk,
      auth: authOk,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      timestamp: new Date().toISOString(),
    };
    this.addAction({
      errorId: "diagnostics",
      action: `Diagnóstico executado — Supabase: ${supabaseOk ? "OK" : "FALHA"}, Auth: ${authOk ? "OK" : "FALHA"}, Online: ${result.online ? "SIM" : "NÃO"}`,
      result: supabaseOk && authOk && result.online ? "success" : "failure",
      durationMs: 0,
      automatic: false,
    });
    this.notify();
    return result;
  }

  // ── Resolve helpers ──
  resolveErrorsByType(errorType: string) {
    let changed = false;
    this.errors.forEach((e) => {
      if (e.errorType === errorType && e.status !== "resolved") {
        e.status = "resolved";
        changed = true;
      }
    });
    if (changed) this.notify();
  }

  resolveError(id: string) {
    const err = this.errors.find((e) => e.id === id);
    if (err) {
      err.status = "resolved";
      this.notify();
    }
  }

  // ── Action recording ──
  private addAction(params: Omit<RecoveryAction, "id" | "timestamp">) {
    const action: RecoveryAction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
    this.actions.push(action);
    if (this.actions.length > 500) this.actions = this.actions.slice(-500);
  }

  // ── Classify HTTP errors ──
  classifyHttpError(status: number): {
    severity: ErrorSeverity;
    errorType: string;
    recoverable: boolean;
  } {
    switch (status) {
      case 400:
        return { severity: "medium", errorType: "http_400_bad_request", recoverable: false };
      case 401:
        return { severity: "high", errorType: "http_401_unauthorized", recoverable: true };
      case 403:
        return { severity: "high", errorType: "http_403_forbidden", recoverable: false };
      case 404:
        return { severity: "low", errorType: "http_404_not_found", recoverable: false };
      case 409:
        return { severity: "medium", errorType: "http_409_conflict", recoverable: true };
      case 429:
        return { severity: "medium", errorType: "http_429_rate_limited", recoverable: true };
      case 500:
        return { severity: "critical", errorType: "http_500_server_error", recoverable: true };
      default:
        return { severity: "medium", errorType: `http_${status}`, recoverable: status >= 500 };
    }
  }

  // ── Getters ──
  getErrors(): readonly OperationalError[] {
    return this.errors;
  }

  getActions(): readonly RecoveryAction[] {
    return this.actions;
  }

  getRecentErrors(hours = 24): OperationalError[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.errors.filter((e) => new Date(e.timestamp).getTime() > cutoff);
  }

  getResolvedCount(hours = 24): number {
    return this.getRecentErrors(hours).filter((e) => e.status === "resolved").length;
  }

  getPendingCount(): number {
    return this.errors.filter((e) => e.status === "detected" || e.status === "pending_review")
      .length;
  }

  /**
   * Returns a cached snapshot object. The cache is invalidated whenever
   * notify() is called (i.e., when errors or actions change). This
   * guarantees referential stability between mutations, which is
   * required by React's useSyncExternalStore to avoid infinite
   * re-render loops.
   */
  getSnapshot(): OperationalSnapshot {
    if (!this._cachedSnapshot) {
      this._cachedSnapshot = {
        totalErrors: this.errors.length,
        recentErrors: this.getRecentErrors().length,
        resolved: this.getResolvedCount(),
        pending: this.getPendingCount(),
        totalActions: this.actions.length,
        autoFixEnabled: this.autoFixEnabled,
        autoFixed: this.autoFixed,
        autoFixRunning: this.autoFixRunning.size > 0,
      };
    }
    return this._cachedSnapshot;
  }

  // ── Correção automática ──
  isAutoFixEnabled(): boolean {
    return this.autoFixEnabled;
  }

  setAutoFix(enabled: boolean) {
    this.autoFixEnabled = enabled;
    try {
      localStorage.setItem(AUTOFIX_KEY, enabled ? "1" : "0");
    } catch {
      /* armazenamento indisponível */
    }
    this.addAction({
      errorId: "autofix_toggle",
      action: `Correção automática ${enabled ? "ativada" : "desativada"}`,
      result: "success",
      durationMs: 0,
      automatic: false,
    });
    this.notify();
    if (enabled) void this.autoFixAll();
  }

  loadAutoFixPreference() {
    try {
      const raw = localStorage.getItem(AUTOFIX_KEY);
      if (raw !== null) this.autoFixEnabled = raw === "1";
    } catch {
      /* ignora */
    }
  }

  isFixing(errorId: string): boolean {
    return this.autoFixRunning.has(errorId);
  }

  getAutoFixResult(errorId: string): AutoFixResult | undefined {
    return this.autoFixLog.get(errorId);
  }

  /** Executa a correção automática de todos os erros pendentes. */
  async autoFixAll(): Promise<{ fixed: number; failed: number }> {
    const pendentes = this.errors.filter(
      (e) => e.status !== "resolved" && e.status !== "recovering" && !this.autoFixRunning.has(e.id),
    );
    let fixed = 0;
    let failed = 0;
    for (const err of pendentes) {
      const r = await this.autoFixError(err.id);
      if (r.success) fixed++;
      else failed++;
    }
    return { fixed, failed };
  }

  /**
   * Aplica a estratégia de correção adequada ao tipo do erro.
   * Sempre segura: nunca recarrega a página sem cooldown nem apaga a sessão.
   */
  async autoFixError(errorId: string): Promise<AutoFixResult> {
    const err = this.errors.find((e) => e.id === errorId);
    if (!err) return { success: false, strategy: "none", message: "Erro não encontrado." };
    if (this.autoFixRunning.has(errorId)) {
      return { success: false, strategy: "none", message: "Correção já em andamento." };
    }

    this.autoFixRunning.add(errorId);
    err.status = "recovering";
    err.retryCount += 1;
    this.notify();

    const start = Date.now();
    let result: AutoFixResult;

    try {
      result = await this.runFixStrategy(err);
    } catch (e) {
      result = {
        success: false,
        strategy: "erro_interno",
        message: e instanceof Error ? e.message : String(e),
      };
    }

    err.status = result.success
      ? "resolved"
      : err.retryCount >= MAX_RETRIES
        ? "failed"
        : "pending_review";
    if (result.success) this.autoFixed += 1;

    this.autoFixLog.set(errorId, result);
    this.autoFixRunning.delete(errorId);
    this.addAction({
      errorId,
      action: `Correção automática (${result.strategy}): ${result.message}`,
      result: result.success ? "success" : "failure",
      durationMs: Date.now() - start,
      automatic: true,
    });
    this.notify();
    return result;
  }

  private async runFixStrategy(err: OperationalError): Promise<AutoFixResult> {
    const tipo = `${err.errorType} ${err.message}`.toLowerCase();

    // 1. Sessão expirada / não autorizado → renovar sessão
    if (/401|unauthorized|auth|jwt|session|sess[aã]o|token/.test(tipo)) {
      const ok = await this.refreshSession();
      return {
        success: ok,
        strategy: "renovar sessão",
        message: ok
          ? "Sessão renovada com sucesso."
          : "Não foi possível renovar a sessão. Faça login novamente.",
      };
    }

    // 2. Rede / offline / servidor indisponível → aguardar e revalidar conexão
    if (/offline|network|failed to fetch|timeout|abort|50\d|circuit|indispon/.test(tipo)) {
      for (let i = 0; i < 3; i++) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await this.delay(RETRY_DELAYS[i] ?? 2000);
          continue;
        }
        if (await this.checkSupabaseHealth()) {
          this.resolveErrorsByType(err.errorType);
          return {
            success: true,
            strategy: "reconexão",
            message: "Conexão com o serviço restabelecida.",
          };
        }
        await this.delay(RETRY_DELAYS[i] ?? 2000);
      }
      return {
        success: false,
        strategy: "reconexão",
        message: "Serviço ainda indisponível após 3 tentativas.",
      };
    }

    // 3. Falha de carregamento de módulo/versão antiga → limpar caches
    if (/chunk|dynamically imported|import\(|module|mime type|loading css/.test(tipo)) {
      const limpou = await this.clearBrowserCaches();
      return {
        success: limpou,
        strategy: "limpar cache",
        message: limpou
          ? "Cache do navegador limpo. Recarregue a página para aplicar a versão mais recente."
          : "Não foi possível limpar o cache do navegador.",
      };
    }

    // 4. Erros de renderização → preserva formulário e revalida ambiente
    if (/render|hydrat|react|undefined is not|cannot read/.test(tipo)) {
      this.preserveFormData();
      const diag = await this.runDiagnostics();
      const ok = diag.supabase && diag.auth && diag.online;
      return {
        success: ok,
        strategy: "revalidar tela",
        message: ok
          ? "Ambiente íntegro e dados do formulário preservados. Tela pronta para nova tentativa."
          : "Ambiente instável — verifique conexão e sessão.",
      };
    }

    // 5. Limite de requisições → aguardar janela
    if (/429|rate|limite|too many/.test(tipo)) {
      await this.delay(RETRY_DELAYS[2] ?? 10000);
      return {
        success: true,
        strategy: "aguardar limite",
        message: "Janela de limite aguardada. Pode tentar novamente.",
      };
    }

    // 6. Genérico → diagnóstico completo
    const diag = await this.runDiagnostics();
    const ok = diag.supabase && diag.auth && diag.online;
    return {
      success: ok,
      strategy: "diagnóstico",
      message: ok
        ? "Diagnóstico sem falhas: erro pontual, sistema operando normalmente."
        : `Falhas detectadas — Banco: ${diag.supabase ? "OK" : "FALHA"}, Sessão: ${diag.auth ? "OK" : "FALHA"}, Internet: ${diag.online ? "OK" : "FALHA"}.`,
    };
  }

  private async clearBrowserCaches(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ──
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
