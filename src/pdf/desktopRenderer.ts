// #116: in the Stratovell desktop application the local service prints PDFs
// with Electron's own Chromium. desktop/server-entry.ts installs this function
// before the server loads; the route calls it with the same self-contained HTML
// it would give an installed Chrome, after the same readiness and approval
// gates. Outside the desktop application there is no such function.

export type DesktopPdfRenderer = (html: string) => Promise<Uint8Array>;

/** The desktop application's PDF printer, or null outside it. */
export function desktopPdfRenderer(env: Record<string, string | undefined> = process.env): DesktopPdfRenderer | null {
  if (env.STRATOVELL_DESKTOP !== "1") return null;
  const f = (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf;
  return typeof f === "function" ? (f as DesktopPdfRenderer) : null;
}

/** True when this server runs inside the desktop application, whose PDFs must come from its own printer. */
export const isDesktopServer = (env: Record<string, string | undefined> = process.env) => env.STRATOVELL_DESKTOP === "1";
