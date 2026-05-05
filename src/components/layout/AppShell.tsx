"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // PDF preview / print routes bypass the workstation chrome so Puppeteer and the
  // iframe preview see only the proposal document.
  if (pathname?.startsWith("/proposal-pdf") || pathname?.startsWith("/proposal-print")) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen bg-canvas text-ink-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 px-6 py-6 lg:px-10 lg:py-8 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
