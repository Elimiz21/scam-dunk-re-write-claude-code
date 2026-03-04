"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useRouter } from "next/navigation";

export function PageLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const router = useRouter();

    return (
        <>
            <Sidebar
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
                onNewScan={() => router.push("/")}
            />
            <div className="flex flex-col min-h-screen">
                <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
                {children}
            </div>
        </>
    );
}
