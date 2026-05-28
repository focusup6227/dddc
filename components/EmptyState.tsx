import type { ReactNode } from "react";

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className = "",
}: {
  illustration?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "card flex flex-col items-center text-center py-12 px-6 " + className
      }
    >
      {illustration && (
        <div className="text-brand-400 mb-4 w-32 h-24 flex items-center justify-center">
          {illustration}
        </div>
      )}
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
