"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MAIN_CONTENT_ID } from "./navFocus";
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
      {/* First Tab stop: appears on focus, then moves focus past the navigation. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        onClick={(e) => {
          // Focus the landmark directly so it works with client-side routing too.
          const main = document.getElementById(MAIN_CONTENT_ID);
          if (main) {
            e.preventDefault();
            main.focus();
            main.scrollIntoView();
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-card focus:outline-none focus:ring-2 focus:ring-gold-300"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex-1 px-6 py-6 lg:px-10 lg:py-8 max-w-[1500px] w-full mx-auto focus:outline-none"
        >
          {children}
        </main>
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
