import { type ReactNode } from "react";

interface PageShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function PageShell({ sidebar, children }: PageShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-background">{sidebar}</aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
