// The narrow Copilot panel is a modal dialog (the wide column is not). These
// two pieces carry the behaviour that isn't markup: shutting the rest of the
// page off while the dialog is open, and keeping Tab inside it.

/**
 * Makes everything outside `keep` inert: at each level from `keep` up to
 * `root`, every sibling. Returns a function that puts back exactly what was
 * there, so an element that was already inert stays inert.
 */
export function isolateBackground(keep: HTMLElement, root: HTMLElement = document.body): () => void {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = keep; node && node !== root; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children) as HTMLElement[]) {
      if (sibling === node || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return () => {
    for (const el of changed) el.inert = false;
  };
}

/**
 * Where Tab (or Shift+Tab) should go to stay inside the dialog: past the last
 * element back to the first, before the first round to the last, and from
 * anywhere outside to the edge the key points to. Null leaves the browser's
 * own move alone.
 */
export function wrapFocus<T>(focusables: T[], active: T | null, shift: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (active == null || !focusables.includes(active)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The elements Tab can reach inside `container`, in order. */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
  return (Array.from(container.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => el.offsetParent !== null || el === document.activeElement);
}
