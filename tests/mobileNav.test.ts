import * as React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// D5 (#92, #93): primary navigation below 768px and the skip link. The unit
// environment has no DOM, so this covers the rules (navFocus.ts) and the
// server-rendered markup contract; keyboard behaviour in a real browser is
// rehearsed and recorded in docs/roadmap/D5_MOBILE_NAV_SKIP_LINK.md.

let mockPath: string | null = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
}));

import AppShell from "@/components/layout/AppShell";
import { MobileNav, MobileNavPanel } from "@/components/layout/MobileNav";
import { NAV, NavLinks, Sidebar } from "@/components/layout/Sidebar";
import {
  FOCUSABLE_SELECTOR,
  MAIN_CONTENT_ID,
  NAV_BREAKPOINT_PX,
  NAV_DESKTOP_QUERY,
  closeFocusTarget,
  isActiveRoute,
  trapTarget,
  type DrawerCloseReason,
} from "@/components/layout/navFocus";

const SRC = join(process.cwd(), "src");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  mockPath = "/";
});

describe("navigation rules", () => {
  it("switches at the layout's md breakpoint, 768px", () => {
    expect(NAV_BREAKPOINT_PX).toBe(768);
    expect(NAV_DESKTOP_QUERY).toBe("(min-width: 768px)");
    // The sidebar is hidden below md and the menu button is hidden from md up.
    expect(render(React.createElement(Sidebar))).toContain("hidden md:flex");
    expect(render(React.createElement(MobileNav))).toContain("md:hidden");
  });

  it("returns focus to the menu button on a plain dismissal and to the main content when the user has moved on", () => {
    const table: Record<DrawerCloseReason, "trigger" | "main"> = {
      escape: "trigger",
      "close-button": "trigger",
      backdrop: "trigger",
      link: "main",
      route: "main",
      resize: "main",
    };
    for (const [reason, target] of Object.entries(table)) expect(closeFocusTarget(reason as DrawerCloseReason)).toBe(target);
  });

  it("wraps Tab and Shift+Tab inside the drawer and leaves ordinary steps to the browser", () => {
    expect(trapTarget(4, 3, false)).toBe(0); // Tab on the last wraps to the first
    expect(trapTarget(4, 0, true)).toBe(3); // Shift+Tab on the first wraps to the last
    expect(trapTarget(4, 1, false)).toBeNull();
    expect(trapTarget(4, 2, true)).toBeNull();
    expect(trapTarget(4, -1, false)).toBe(0); // focus outside the drawer is pulled in
    expect(trapTarget(4, -1, true)).toBe(3);
    expect(trapTarget(1, 0, false)).toBe(0); // a single stop stays put
    expect(trapTarget(1, 0, true)).toBe(0);
    expect(trapTarget(0, -1, false)).toBeNull(); // nothing to trap
  });

  it("finds links, buttons and fields but not disabled or tabindex -1 elements", () => {
    expect(FOCUSABLE_SELECTOR).toContain("a[href]");
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("marks the current page; the dashboard matches only itself", () => {
    expect(isActiveRoute("/", "/")).toBe(true);
    expect(isActiveRoute("/review", "/")).toBe(false);
    expect(isActiveRoute("/allocation-desk", "/allocation-desk")).toBe(true);
    expect(isActiveRoute("/copilot", "/allocation-desk")).toBe(false);
    expect(isActiveRoute(null, "/")).toBe(false);
  });
});

describe("one navigation definition for desktop and mobile", () => {
  it("lists every NAV page, in order, in the sidebar, the shared link list and the drawer", () => {
    const expected = NAV.map((n) => n.href);
    expect(expected.length).toBeGreaterThan(10);
    const sidebar = hrefs(render(React.createElement(Sidebar)));
    // The sidebar's brand link is "/" and so is the Dashboard entry.
    expect(sidebar).toEqual(["/", ...expected]);
    expect(hrefs(render(React.createElement(NavLinks)))).toEqual(expected);
    const drawer = render(React.createElement(MobileNavPanel, { onClose: () => undefined }));
    expect(hrefs(drawer)).toEqual(["/", ...expected]);
    for (const item of NAV) expect(drawer).toContain(item.label.replace(/&/g, "&amp;"));
  });

  it("the Sidebar and the drawer both render the shared link list rather than their own", () => {
    const sidebar = readFileSync(join(SRC, "components", "layout", "Sidebar.tsx"), "utf8");
    const drawer = readFileSync(join(SRC, "components", "layout", "MobileNav.tsx"), "utf8");
    expect(sidebar).toMatch(/<NavLinks \/>/);
    expect(drawer).toMatch(/<NavLinks onNavigate=/);
    expect(drawer).not.toMatch(/label: "/); // no second list of pages
  });

  it("labels the navigation landmark and marks the current page", () => {
    mockPath = "/allocation-desk";
    const html = render(React.createElement(NavLinks));
    expect(html).toContain('<nav aria-label="Primary"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>[\s\S]*?Allocation desk/);
  });
});

describe("mobile menu button and drawer markup", () => {
  it("renders a labelled, collapsed menu button and no dialog until opened", () => {
    const html = render(React.createElement(MobileNav));
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-controls"); // no controls reference while closed
    expect(html).toContain('type="button"');
  });

  it("renders the drawer as a labelled modal dialog with a Close button and the same links", () => {
    const html = render(React.createElement(MobileNavPanel, { id: "drawer", onClose: () => undefined }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('id="drawer"');
    expect(html).toContain('aria-label="Close navigation menu"');
    expect(html).toContain("md:hidden"); // never shown at desktop widths
    expect(html).toContain('<nav aria-label="Primary"');
  });

  it("puts the menu button in the top bar", () => {
    const topbar = readFileSync(join(SRC, "components", "layout", "Topbar.tsx"), "utf8");
    expect(topbar).toMatch(/<MobileNav \/>/);
  });
});

describe("skip link", () => {
  it("is the first focusable element in the workstation and targets the main landmark", () => {
    const html = render(React.createElement(AppShell, null, React.createElement("p", null, "page")));
    const skip = html.indexOf("Skip to main content");
    expect(skip).toBeGreaterThan(-1);
    expect(html).toContain(`href="#${MAIN_CONTENT_ID}"`);
    // Before the sidebar, the top bar and every nav link.
    expect(skip).toBeLessThan(html.indexOf("<aside"));
    expect(skip).toBeLessThan(html.indexOf("<header"));
    expect(html.indexOf("<a ")).toBe(html.lastIndexOf("<a ", skip));
    // Visually hidden until focused, then visible.
    expect(html).toMatch(/class="sr-only focus:not-sr-only focus:fixed/);
  });

  it("targets a focusable main landmark", () => {
    const html = render(React.createElement(AppShell, null, React.createElement("p", null, "page")));
    expect(html).toMatch(new RegExp(`<main id="${MAIN_CONTENT_ID}" tabindex="-1"`));
    expect(html.match(/<main /g)).toHaveLength(1);
  });

  it("keeps the standalone meeting, PDF and print routes free of workstation chrome", () => {
    for (const path of ["/meeting/ver_1", "/proposal-pdf/p1", "/proposal-print/p1"]) {
      mockPath = path;
      const html = render(React.createElement(AppShell, null, React.createElement("p", { id: "doc" }, "document")));
      expect(html).toBe('<p id="doc">document</p>');
      expect(html).not.toContain("Skip to main content");
      expect(html).not.toContain("navigation menu");
      expect(html).not.toContain("<aside");
    }
  });
});

describe("scope", () => {
  it("does not touch the meeting view or the PDF templates", () => {
    for (const rel of [join("app", "meeting"), "pdf"]) {
      const dir = join(SRC, rel);
      const walk = (d: string): string[] =>
        require("node:fs")
          .readdirSync(d, { withFileTypes: true })
          .flatMap((e: { isDirectory(): boolean; name: string }) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
      for (const f of walk(dir)) {
        if (/\.(tsx?|css)$/.test(f)) expect(readFileSync(f, "utf8")).not.toMatch(/MobileNav|navFocus|Skip to main content/);
      }
    }
  });
});
