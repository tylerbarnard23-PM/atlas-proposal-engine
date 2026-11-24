import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { originLabel } from "@/engines/recommendationOrigin";
import type { Recommendation } from "@/domain/types";

// #113: examples (prewritten samples, scripted or test-provider examples) are
// listed apart from Claude and advisor recommendations. An approved example
// still shapes the proposal wherever its card is listed, so this notice says
// so whenever one is approved, shows them on request, and can take selected
// ones out of the working proposal after explaining the effect.

export function ActiveExamplesNotice({ examples, onShow, onWithdraw }: { examples: Recommendation[]; onShow: () => void; onWithdraw: (ids: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<Set<string>>(() => new Set(examples.map((r) => r.id)));
  // A newly approved example is selected too; one no longer approved drops out.
  const ids = examples.map((r) => r.id).join("|");
  React.useEffect(() => setChosen(new Set(examples.map((r) => r.id))), [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = examples.length;
  const k = examples.filter((r) => chosen.has(r.id)).length;

  function confirmWithdraw() {
    const picked = examples.filter((r) => chosen.has(r.id));
    if (picked.length === 0) return;
    const ok = confirm(
      `Remove ${picked.length} example${picked.length === 1 ? "" : "s"} from the working proposal?\n\n` +
        "Each one's approval and PDF inclusion are withdrawn and it leaves the working draft, so it no longer changes the Before / After allocation or appears in the final PDF.\n\n" +
        "The records are kept (you can approve one again), and versions you already approved don't change."
    );
    if (ok) {
      onWithdraw(picked.map((r) => r.id));
      setOpen(false);
    }
  }

  return (
    <div role="alert" className="mb-4 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-4 py-3 text-[13px] text-ink-800" data-testid="approved-examples-notice">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
        <div className="space-y-2 min-w-0">
          <p>
            <strong>
              {n} approved example{n === 1 ? " still affects" : "s still affect"} this proposal.
            </strong>{" "}
            {n === 1 ? "It reshapes" : "They reshape"} the Before / After allocation and {n === 1 ? "appears" : "appear"} in the final PDF, wherever {n === 1 ? "its card is" : "their cards are"} listed. Examples are prewritten, scripted or test records, not Claude&apos;s analysis of this client.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onShow} data-testid="show-approved-examples">
              Show {n === 1 ? "it" : "them"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="withdraw-examples-open">
              Remove from the working proposal…
            </Button>
          </div>
          {open && (
            <div className="rounded-md bg-white ring-1 ring-inset ring-ink-200 px-3 py-2 space-y-2" data-testid="withdraw-examples-panel">
              <p className="text-ink-700">
                Removing an example withdraws its approval and PDF inclusion and takes it out of the working draft. The record is kept, and approved versions don&apos;t change.
              </p>
              <ul className="space-y-1">
                {examples.map((r) => (
                  <li key={r.id}>
                    <label className="inline-flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={chosen.has(r.id)}
                        data-testid="withdraw-example-checkbox"
                        onChange={(e) =>
                          setChosen((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                      <span>
                        {r.title || "Untitled recommendation"} <span className="text-ink-500">({originLabel(r).label})</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="danger" disabled={k === 0} onClick={confirmWithdraw} data-testid="withdraw-examples-confirm">
                Remove {k} from the working proposal
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
