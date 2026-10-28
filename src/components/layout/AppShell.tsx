"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DEMO_DISCLAIMER } from "@/domain/legal";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // PDF preview / print routes bypass the workstation chrome so Puppeteer and the
  // iframe preview see only the proposal document; so does the D3 meeting view.
  if (pathname?.startsWith("/proposal-pdf") || pathname?.startsWith("/proposal-print") || pathname?.startsWith("/meeting/")) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen bg-canvas text-ink-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 px-6 py-6 lg:px-10 lg:py-8 max-w-[1500px] w-full mx-auto">{children}</main>
        <footer
          role="contentinfo"
          className="border-t border-ink-100 bg-paper px-6 lg:px-10 py-3 text-2xs leading-relaxed text-ink-500"
        >
          <p className="max-w-[1500px] mx-auto">{DEMO_DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}
