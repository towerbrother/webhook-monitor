import { type ComponentType, type ReactNode } from "react";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  heading: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground" />}
      <h3 className="text-lg font-medium">{heading}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
