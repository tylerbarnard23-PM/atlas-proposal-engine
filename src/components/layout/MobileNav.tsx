"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavLinks, SidebarBrand, SIDEBAR_FOOTER } from "./Sidebar";
import {
  FOCUSABLE_SELECTOR,
  MAIN_CONTENT_ID,
  NAV_DESKTOP_QUERY,
  closeFocusTarget,
  trapTarget,
  type DrawerCloseReason,
} from "./navFocus";

/**
 * Primary navigation below the desktop breakpoint (the sidebar is hidden under
 * 768px): a menu button in the top bar that opens a modal drawer listing the
 * same pages as the sidebar.
 *
 * Behaviour: focus moves into the drawer on open and is contained there (Tab
 * and Shift+Tab wrap); Escape, the Close button and the backdrop close it and
 * return focus to the menu button; choosing a page, a route change or the
 * window growing to the desktop layout close it and move focus to the main
 * content, because the menu button is no longer the right place. The page
 * behind does not scroll while it is open.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const openRef = React.useRef(false);
  const drawerId = React.useId();

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const close = React.useCallback((reason: DrawerCloseReason) => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const target = closeFocusTarget(reason);
    // Wait for the drawer to unmount, then place focus.
    requestAnimationFrame(() => {
      const el = target === "trigger" ? triggerRef.current : document.getElementById(MAIN_CONTENT_ID);
      el?.focus();
    });
  }, []);

  // A route change (browser back, a link elsewhere) closes the drawer.
  React.useEffect(() => {
    close("route");
  }, [pathname, close]);

  // Growing past the breakpoint swaps to the desktop sidebar: close the drawer.
  React.useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(NAV_DESKTOP_QUERY);
    const onChange = () => {
      if (mq.matches) close("resize");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, close]);

  // While open: move focus in, lock page scroll, handle Escape and the Tab trap.
  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close("escape");
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const target = trapTarget(focusables.length, focusables.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (target !== null) {
        e.preventDefault();
        focusables[target].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        className="md:hidden -ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-700 hover:bg-slatey-50"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      {mounted &&
        open &&
        createPortal(
          <MobileNavPanel id={drawerId} panelRef={panelRef} closeRef={closeRef} onClose={close} />,
          document.body
        )}
    </>
  );
}

/** The drawer itself: backdrop plus a labelled modal dialog. Presentational; MobileNav owns the behaviour. */
export function MobileNavPanel({
  id,
  panelRef,
  closeRef,
  onClose,
}: {
  id?: string;
  panelRef?: React.Ref<HTMLDivElement>;
  closeRef?: React.Ref<HTMLButtonElement>;
  onClose: (reason: DrawerCloseReason) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-ink-900/40" aria-hidden="true" onClick={() => onClose("backdrop")} />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-ink-100 bg-paper shadow-card"
      >
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 pt-5 pb-4">
          <SidebarBrand onNavigate={() => onClose("link")} />
          <button
            ref={closeRef}
            type="button"
            onClick={() => onClose("close-button")}
            aria-label="Close navigation menu"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-700 hover:bg-slatey-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <NavLinks onNavigate={() => onClose("link")} />
        <div className="border-t border-ink-100 px-5 py-3 text-2xs leading-relaxed text-ink-500">{SIDEBAR_FOOTER}</div>
      </div>
    </div>
  );
}
