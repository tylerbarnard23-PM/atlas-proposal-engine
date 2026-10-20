"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserSquare,
  Inbox,
  FileSearch,
  ListTree,
  Activity,
  Lightbulb,
  Wand2,
  FileText,
  Eye,
  ScrollText,
  Settings,
  Bot,
} from "lucide-react";
import { cn } from "@/utils/cn";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  group?: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard className="h-4 w-4" />, group: "Overview" },
  { label: "Client Profile", href: "/client-profile", icon: <UserSquare className="h-4 w-4" />, group: "Overview" },
  { label: "Import Center", href: "/import-center", icon: <Inbox className="h-4 w-4" />, group: "Data" },
  { label: "Statement Workbench", href: "/statement-workbench", icon: <FileSearch className="h-4 w-4" />, group: "Data" },
  { label: "Accounts & Assets", href: "/accounts-assets", icon: <ListTree className="h-4 w-4" />, group: "Data" },
  { label: "Market Data", href: "/market-data", icon: <Activity className="h-4 w-4" />, group: "Data" },
  { label: "Insights", href: "/insights", icon: <Lightbulb className="h-4 w-4" />, group: "Advisory" },
  { label: "Recommendations", href: "/recommendations", icon: <Wand2 className="h-4 w-4" />, group: "Advisory" },
  { label: "Proposal Copilot", href: "/copilot", icon: <Bot className="h-4 w-4" />, group: "Advisory" },
  { label: "Proposal Builder", href: "/proposal-builder", icon: <FileText className="h-4 w-4" />, group: "Proposal" },
  { label: "PDF Preview", href: "/pdf-preview", icon: <Eye className="h-4 w-4" />, group: "Proposal" },
  { label: "Assumptions & Disclosures", href: "/assumptions-disclosures", icon: <ScrollText className="h-4 w-4" />, group: "Proposal" },
  { label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" />, group: "Workspace" },
];

export function Sidebar() {
  const pathname = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group ?? "")));

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-ink-100 bg-paper">
      <div className="px-5 pt-5 pb-4 border-b border-ink-100">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-md bg-navy-900 text-gold-300 flex items-center justify-center font-serif text-base shadow-card">
            A
          </div>
          <div>
            <div className="text-[15px] font-serif text-ink-900 leading-none">Atlas</div>
            <div className="text-2xs uppercase tracking-widest text-ink-500 mt-1">Proposal Engine</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g} className="px-3 pb-3">
            {g && (
              <div className="text-2xs uppercase tracking-widest text-ink-400 font-semibold px-2 pt-3 pb-1.5">{g}</div>
            )}
            <ul className="space-y-0.5">
              {NAV.filter((n) => (n.group ?? "") === g).map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 h-8 text-[13px] transition-colors",
                        active
                          ? "bg-navy-50 text-navy-800 font-medium"
                          : "text-ink-600 hover:bg-slatey-50 hover:text-ink-900"
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          active ? "text-navy-700" : "text-ink-400"
                        )}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-ink-100 text-2xs text-ink-500 leading-relaxed">
        Advisor-led platform · AI drafts, advisor decides · Advisor approval required.
      </div>
    </aside>
  );
}
