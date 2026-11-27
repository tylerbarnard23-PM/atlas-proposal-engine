// #116: the one advisor workflow the welcome page guides through. Each step names where it happens.

/** The advisor workflow, in order. Each step names where it happens. */
export const WORKFLOW_STEPS: { title: string; detail: string; href: string; place: string }[] = [
  { title: "Create a client or explore the fictional sample", detail: "Both start with no recommendations.", href: "/client-profile", place: "Client Profile" },
  { title: "Import a statement", detail: "Statement PDFs, spreadsheets and CSV files are read on this computer.", href: "/import-center", place: "Import Center" },
  { title: "Review positions", detail: "Check the imported holdings, sources, currencies and dates.", href: "/statement-workbench", place: "Statement Workbench" },
  { title: "Review the client's objectives", detail: "Record and review the brief. This makes no model request.", href: "/client-objectives", place: "Client objectives" },
  { title: "Connect Claude", detail: "Paste your own Anthropic API key. Saving it makes no model request.", href: "/copilot", place: "Stratovell AI · AI connection" },
  { title: "Analyze", detail: "Start a limited session and run an analysis. Only now are the displayed analysis inputs sent to Anthropic.", href: "/copilot", place: "Stratovell AI" },
  { title: "Inspect the drafts and Add the ones you choose", detail: "Drafts are previews; adding never approves anything.", href: "/copilot", place: "Stratovell AI" },
  { title: "Approve explicitly", detail: "Approve each recommendation you stand behind.", href: "/recommendations", place: "Recommendations" },
  { title: "Approve a version", detail: "An approved version freezes the proposal, its brief and its fingerprint.", href: "/review", place: "Review & present" },
  { title: "Issue the proposal PDF", detail: "The meeting view and the PDF show the same approved version.", href: "/review", place: "Review & present" },
];

export type WelcomeChoice = "new-client" | "sample";

/** What Getting started asks before replacing a workspace that holds entered work. */
export const WELCOME_CONFIRMATIONS: Record<WelcomeChoice, string> = {
  "new-client": "Start a new client?\n\nThis clears the current client, accounts, holdings, recommendations, source documents and PDF history. Your firm & branding are kept.",
  sample: "Open the fictional sample?\n\nThis replaces the current workspace with the fictional Blackwell Family Office sample. It starts with no recommendations.",
};

/**
 * Codex finding D: whether a Getting started choice may go ahead. It goes ahead
 * without a question only while the workspace is still the untouched fictional
 * starting point (by content, see isUntouchedSample in src/store/useStore.ts),
 * never because of the launch-time first-run flag; otherwise the advisor confirms.
 */
export function confirmWelcomeChoice(choice: WelcomeChoice, workspaceUntouched: boolean, confirm: (message: string) => boolean): boolean {
  return workspaceUntouched || confirm(WELCOME_CONFIRMATIONS[choice]);
}
