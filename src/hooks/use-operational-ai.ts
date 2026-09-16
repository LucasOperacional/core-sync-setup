import { useCallback, useEffect, useSyncExternalStore } from "react";
import { OperationalAI } from "@/lib/operational-ai";

const ai = OperationalAI.getInstance();

// Stable function references for useSyncExternalStore — defined outside the
// component so React never sees a new callback identity on re-render.
const subscribe = (cb: () => void) => ai.subscribe(cb);
const getSnapshot = () => ai.getSnapshot();

/**
 * Hook to use the IA Operacional engine from any component.
 *
 * Initializes global listeners on first mount and provides
 * reactive access to the current state snapshot.
 */
export function useOperationalAI() {
  useEffect(() => {
    ai.loadAutoFixPreference();
    ai.init();
    ai.restoreFormData();
    // No cleanup — the singleton survives the app lifetime.
  }, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const runDiagnostics = useCallback(() => ai.runDiagnostics(), []);

  const attemptRecovery = useCallback(
    <T>(name: string, op: () => Promise<T>, opts?: { serviceKey?: string }) =>
      ai.attemptRecovery(name, op, opts),
    [],
  );

  const captureError = useCallback(
    (params: Parameters<typeof ai.captureError>[0]) => ai.captureError(params),
    [],
  );

  const refreshSession = useCallback(() => ai.refreshSession(), []);
  const safeReload = useCallback(() => ai.safeReload(), []);

  const getRecentErrors = useCallback((hours?: number) => ai.getRecentErrors(hours), []);
  const getActions = useCallback(() => ai.getActions(), []);
  const resolveError = useCallback((id: string) => ai.resolveError(id), []);

  const setAutoFix = useCallback((enabled: boolean) => ai.setAutoFix(enabled), []);
  const autoFixError = useCallback((id: string) => ai.autoFixError(id), []);
  const autoFixAll = useCallback(() => ai.autoFixAll(), []);
  const isFixing = useCallback((id: string) => ai.isFixing(id), []);
  const getAutoFixResult = useCallback((id: string) => ai.getAutoFixResult(id), []);

  return {
    snapshot,
    runDiagnostics,
    attemptRecovery,
    captureError,
    refreshSession,
    safeReload,
    getRecentErrors,
    getActions,
    resolveError,
    setAutoFix,
    autoFixError,
    autoFixAll,
    isFixing,
    getAutoFixResult,
  };
}
