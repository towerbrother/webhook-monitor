"use client";

import { type ComponentType } from "react";
import { cn } from "../lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

interface SidebarNavProps {
  items: NavItem[];
  activePath?: string;
}

export function SidebarNav({ items, activePath }: SidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = activePath === href;
        return (
          <a
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-primary/10 font-medium text-primary"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {label}
          </a>
        );
      })}
    </nav>
  );
}
