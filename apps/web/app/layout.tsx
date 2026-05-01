import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "../src/context/project-context";
import { ProjectSwitcher } from "../src/components/project-switcher";
import { PageShell, SidebarNav } from "@repo/ui";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Webhook Monitor",
  description: "Webhook monitoring and delivery system",
  icons: { icon: "/favicon.svg" },
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">
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
