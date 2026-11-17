"use client";

import * as React from "react";

// D5: the meeting view on small screens. The document is laid out at its
// printed width (8.5in, `.pdf-cover` / `.pdf-page` in pdfStyles), which is
// wider than a phone or a narrow tablet. On screen only, it is shown inside a
// region that either scales it to the available width ("Fit to screen", the
// default) or shows it at actual size and scrolls sideways. The document
// itself, the PDF route and print output are unchanged: the scale is a CSS
// variable read only by the `@media screen` rule below.

/** The document's printed width in CSS pixels (8.5in at 96px per inch). */
export const DOCUMENT_WIDTH_PX = 816;
/** Smallest scale used, so a very narrow window still shows readable shapes. */
export const MIN_FIT_SCALE = 0.3;

/** The scale that fits the document into `available` CSS pixels; 1 when it already fits. */
export function fitScale(available: number): number {
  if (!Number.isFinite(available) || available <= 0) return 1;
  if (available >= DOCUMENT_WIDTH_PX) return 1;
  return Math.max(MIN_FIT_SCALE, Math.floor((available / DOCUMENT_WIDTH_PX) * 1000) / 1000);
}

export type MeetingFitMode = "fit" | "actual";

/**
 * Screen-only rules. `zoom` (not a transform) so the scaled document also
 * takes less layout space: the page scrolls to its real end. Print ignores
 * all of this, so a printed meeting view is the document as it always was.
 */
export const MEETING_SCREEN_CSS = `
  @media screen {
    .meeting-doc-region { overflow-x: auto; max-width: 100%; }
    .meeting-doc-region:focus-visible { outline: 3px solid #D2B45A; outline-offset: -3px; }
    .meeting-doc { zoom: var(--meeting-scale, 1); width: ${DOCUMENT_WIDTH_PX}px; }
  }
`;

/**
 * Measures the region's available width and reports the fitting scale.
 * `mounted` re-runs the measurement once the region is rendered.
 */
export function useFitScale(region: React.RefObject<HTMLDivElement | null>, mounted: boolean): number {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const el = region.current;
    if (!mounted || !el) return;
    const update = () => setScale(fitScale(el.clientWidth));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [region, mounted]);
  return scale;
}

/**
 * The scrollable, focusable region around the document. Keyboard users can
 * focus it (Tab) and scroll it with the arrow keys at actual size.
 */
export const MeetingDocumentRegion = React.forwardRef<HTMLDivElement, { scale: number; mode: MeetingFitMode; children?: React.ReactNode }>(
  function MeetingDocumentRegion({ scale, mode, children }, ref) {
    const applied = mode === "fit" ? scale : 1;
    return (
      <div ref={ref} className="meeting-doc-region" role="region" aria-label="Approved version document" tabIndex={0}>
        <div className="meeting-doc" style={{ ["--meeting-scale" as string]: String(applied) } as React.CSSProperties}>
          {children}
        </div>
      </div>
    );
  }
);
