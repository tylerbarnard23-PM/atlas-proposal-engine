import { redirect } from "next/navigation";

// Insights became Portfolio checks inside Stratovell AI (PR #110). The old
// address keeps working: it goes to that view, and a #fragment survives the
// redirect in the browser.
export default function InsightsPage() {
  redirect("/copilot?view=checks");
}
