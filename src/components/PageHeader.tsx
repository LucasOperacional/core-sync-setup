import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("border-b border-border bg-card", className)}>
      <div className="mx-auto grid max-w-[88rem] grid-cols-1 items-start gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary"><Icon className="size-4.5" /></span>}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-xs font-semibold text-primary">{eyebrow}</p>}
            <h1 className="truncate font-display text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </header>
  );
}