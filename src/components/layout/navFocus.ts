// Behaviour rules for the primary navigation below the desktop breakpoint and
// the skip link. Kept free of React and the DOM so each rule is unit-tested
// (tests/mobileNav.test.ts); MobileNav.tsx and AppShell.tsx apply them.

/** Tailwind's `md` breakpoint: the sidebar is shown from this width up. */
export const NAV_BREAKPOINT_PX = 768;
export const NAV_DESKTOP_QUERY = `(min-width: ${NAV_BREAKPOINT_PX}px)`;

/** The main landmark: the skip link's target and where focus goes after a navigation. */
export const MAIN_CONTENT_ID = "main-content";

/** Elements a keyboard user can reach with Tab. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Why the drawer closed. */
export type DrawerCloseReason =
  | "escape" // Escape key
  | "close-button" // the drawer's own Close button
  | "backdrop" // a click outside the panel
  | "link" // a navigation link was chosen
  | "route" // the route changed (browser back, a link elsewhere)
  | "resize"; // the window grew to the desktop layout

/**
 * Where focus goes when the drawer closes.
 * - "trigger": the menu button the user opened it from (dismissed without going anywhere).
 * - "main": the main content (a page was chosen, or the menu button no longer
 *   exists because the desktop sidebar replaced it).
 */
export function closeFocusTarget(reason: DrawerCloseReason): "trigger" | "main" {
  switch (reason) {
    case "escape":
    case "close-button":
    case "backdrop":
      return "trigger";
    case "link":
    case "route":
    case "resize":
      return "main";
  }
}

/**
 * Focus trap: the index of the element to focus when Tab (or Shift+Tab) is
 * pressed inside a modal drawer with `count` focusable elements, or null when the
 * browser's own Tab order is right. `current` is the index of the focused
 * element, or -1 when focus is outside the list.
 */
export function trapTarget(count: number, current: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0) return shift ? count - 1 : 0;
  if (!shift && current === count - 1) return 0;
  if (shift && current === 0) return count - 1;
  return null;
}

/** Whether a nav item is the current page; the dashboard is "/" and matches only itself. */
export function isActiveRoute(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
