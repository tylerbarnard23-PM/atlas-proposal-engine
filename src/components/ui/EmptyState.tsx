import * as React from "react";
import { cn } from "@/utils/cn";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-dashed border-ink-200 rounded-lg p-8 text-center bg-slatey-50/50", className)}>
      {icon && <div className="text-ink-400 mx-auto mb-3 w-fit">{icon}</div>}
      <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
