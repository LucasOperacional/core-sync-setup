import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon?: LucideIcon | undefined;
  tone?: "primary" | "accent" | "destructive" | "success" | undefined;
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  primary: "text-primary bg-primary/10",
  accent: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
  success: "text-success bg-success/10",
};

export function KpiCard({ label, value, hint, icon: Icon, tone = "primary" }: Props) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={`rounded-md p-2 ${toneClass[tone]}`}>
            <Icon className="size-5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
