/**
 * Overlay mostrado durante tentativas de recuperação automática.
 */
export function RecoveryOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-4 border-muted border-t-blue-500" />
        <p className="text-sm font-medium text-foreground">
          {message ?? "Identificamos uma instabilidade e estamos tentando recuperar esta função."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Seus dados estão sendo preservados.</p>
      </div>
    </div>
  );
}
