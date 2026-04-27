import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "../src/context/project-context";
import { ProjectSwitcher } from "../src/components/project-switcher";
import { PageShell, SidebarNav } from "@repo/ui";

export const metadata: Metadata = {
  title: "Webhook Monitor",
  description: "Webhook monitoring and delivery system",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/endpoints", label: "Endpoints" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ProjectProvider>
          <PageShell
            sidebar={
              <div className="flex flex-col gap-4 p-4">
                <ProjectSwitcher />
                <SidebarNav items={navItems} />
              </div>
            }
          >
            {children}
          </PageShell>
        </ProjectProvider>
      </body>
    </html>
  );
}
