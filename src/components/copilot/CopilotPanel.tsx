"use client";

import * as React from "react";
import { X } from "lucide-react";
import { CopilotWorkspace } from "./CopilotWorkspace";
import { focusablesIn, isolateBackground, wrapFocus } from "./modal";

// The Copilot beside the allocation desk. Opening it fills in a question but
// runs nothing. At the desk's wide breakpoint (Tailwind xl, 80rem) it is a
// nonmodal column next to the desk: the desk stays usable and Escape closes
// it only from inside. Narrower, it covers the desk, so it is a modal dialog:
// the rest of the page is inert, Tab and Shift+Tab stay inside, and Escape or
// the backdrop closes it. Both modes are the same element tree, so resizing
// between them keeps the conversation; isolation is undone whenever the panel
// stops being modal or closes. Closing drops an answer that wasn't added.

const WIDE = "(min-width: 80rem)";

function useWide() {
  const [wide, setWide] = React.useState(() => window.matchMedia(WIDE).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function CopilotPanel({
  question,
  onClose,
  onAdded,
  onReveal,
}: {
  question: string;
  /** Close and hand focus back to whatever opened the panel. */
  onClose: () => void;
  onAdded?: (ids: string[]) => void;
  /** Close and show these actions on the desk (the desk moves focus to them). */
  onReveal?: (ids: string[]) => void;
}) {
  const modal = !useWide();
  const root = React.useRef<HTMLDivElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);

  // Opening moves focus into the panel.
  React.useEffect(() => {
    heading.current?.focus();
  }, []);

  // Escape: anywhere while modal; from inside only while it's a side column.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal || root.current?.contains(document.activeElement)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  // Modal only: isolate the page, keep Tab inside, stop the page scrolling behind.
  React.useEffect(() => {
    if (!modal || !root.current || !panel.current) return;
    const dialog = panel.current;
    const restore = isolateBackground(root.current);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.contains(document.activeElement)) heading.current?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const target = wrapFocus(focusablesIn(dialog), document.activeElement as HTMLElement | null, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("keydown", onTab, true);
    return () => {
      document.removeEventListener("keydown", onTab, true);
      document.body.style.overflow = overflow;
      restore();
    };
  }, [modal]);

  return (
    <div ref={root} id="copilot-panel" data-testid="copilot-panel" data-mode={modal ? "modal" : "column"} className={modal ? "fixed inset-0 z-50" : "sticky top-4 self-start"}>
      {modal && <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} aria-hidden="true" />}
      <div
        ref={panel}
        role={modal ? "dialog" : "complementary"}
        aria-modal={modal ? true : undefined}
        aria-labelledby="copilot-panel-title"
        className={
          modal
            ? "absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto border-l border-ink-100 bg-paper shadow-elevated"
            : "max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-ink-100 bg-paper"
        }
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink-100 bg-paper px-4 h-12">
          <h2 id="copilot-panel-title" ref={heading} tabIndex={-1} className="font-serif text-lg text-ink-900 focus:outline-hidden">
            Copilot
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-600 hover:bg-slatey-100 hover:text-ink-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>
        <div className="p-4">
          <CopilotWorkspace variant="panel" initialQuestion={question} onAdded={onAdded} onReveal={onReveal} />
          <p className="mt-3 text-2xs text-ink-500">Closing the panel discards an answer you haven&apos;t added. Anything added stays in the working draft.</p>
        </div>
      </div>
    </div>
  );
}
