"use client";

import * as React from "react";
import { X } from "lucide-react";
import { CopilotWorkspace } from "./CopilotWorkspace";

// The Copilot beside the allocation desk. Wide screens show it as a column
// next to the desk; narrower ones as a full-height panel over it. Opening it
// fills in a question but runs nothing. Closing it (Close or Escape) drops an
// answer that wasn't added: nothing unadded is kept.

export function CopilotPanel({ question, onClose, onAdded }: { question: string; onClose: () => void; onAdded?: (ids: string[]) => void }) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-950/40 xl:hidden" onClick={onClose} aria-hidden />
      <aside
        id="copilot-panel"
        aria-labelledby="copilot-panel-title"
        data-testid="copilot-panel"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-ink-100 bg-paper shadow-elevated xl:sticky xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-auto xl:max-w-none xl:rounded-lg xl:border xl:shadow-none"
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
          <CopilotWorkspace variant="panel" initialQuestion={question} onAdded={onAdded} />
          <p className="mt-3 text-2xs text-ink-500">Closing the panel discards an answer you haven&apos;t added. Anything added stays in the working draft.</p>
        </div>
      </aside>
    </>
  );
}
