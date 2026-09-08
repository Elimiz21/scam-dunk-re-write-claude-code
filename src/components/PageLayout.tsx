"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ActivityTicker } from "./ActivityTicker";

export function PageLayout({
  children,
  dashboardShell = false,
}: {
  children: React.ReactNode;
  dashboardShell?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const showDashboardShell = dashboardShell || Boolean(session?.user);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onSidebarToggle={() => setSidebarOpen((open) => !open)} />
      <ActivityTicker />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-start">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((open) => !open)}
          onNewScan={() => router.push("/?focus=scan")}
          persistent={showDashboardShell}
        />
        <div className="min-w-0 flex-1">
          {children}
          <Footer />
        </div>
      </div>
    </div>
  );
}
