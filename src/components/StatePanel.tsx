import { AlertCircle, CheckCircle2, Inbox, Loader2, ShieldX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StateKind = "empty" | "loading" | "error" | "success" | "permission";

const icons: Record<StateKind, LucideIcon> = {
  empty: Inbox,
  loading: Loader2,
  error: AlertCircle,
  success: CheckCircle2,
  permission: ShieldX,
};

export function StatePanel({ kind = "empty", title, description, action, compact = false, className }: {
  kind?: StateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const Icon = icons[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex flex-col items-center justify-center border border-dashed border-border bg-muted/25 text-center", compact ? "min-h-32 p-5" : "min-h-52 p-8", className)}>
      <span className={cn("mb-3 grid size-9 place-items-center rounded-md border bg-background", kind === "error" ? "border-destructive/25 text-destructive" : kind === "success" ? "border-success/25 text-success" : kind === "permission" ? "border-warning/25 text-warning" : "border-border text-muted-foreground")}>
        <Icon className={cn("size-4.5", kind === "loading" && "animate-spin")} />
      </span>
      <p className="font-display text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}