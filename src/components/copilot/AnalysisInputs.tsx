import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { clientBrief } from "@/engines/clientDiscovery";
import { scopeAccountIds } from "@/engines/allocationDesk";
import { scopeLabel } from "@/copilot/request";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { AssetClass } from "@/domain/types";

// #113: what the next analysis will be given, shown before anything runs. It
// reads the same workspace the request is built from (copilotRequest) and the
// same brief the model sees (modelBoundClientBrief through the tools), so it
// can't describe inputs the analysis doesn't get. Advisor-set targets are the
// advisor's own allocation goals, never Claude's recommendations.

/** The advisor's targets for the active alternative, largest first, as "Equity 60%". */
export function targetSummary(targets: Partial<Record<AssetClass, number>> | undefined): string[] {
  return Object.entries(targets ?? {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([k, v]) => `${ASSET_CLASS_LABELS[k as AssetClass] ?? k} ${Math.round((v as number) * 10) / 10}%`);
}

export function AnalysisInputs({ hostedOrLive }: { hostedOrLive: boolean }) {
  const client = useAtlasStore((s) => s.client);
  const accounts = useAtlasStore((s) => s.accounts);
  const holdings = useAtlasStore((s) => s.holdings);
  const draft = useAtlasStore((s) => s.workingDraft);
  const brief = clientBrief(client);
  const scope = scopeLabel(accounts, draft);
  const inScope = new Set(scopeAccountIds(accounts, draft));
  const scopedHoldings = holdings.filter((h) => inScope.has(h.accountId)).length;
  const targets = targetSummary(draft.targets);
  const unknown = brief.counts.total - brief.counts.answered;

  return (
    <section className="rounded-md bg-white ring-1 ring-inset ring-ink-100 px-3 py-2.5 text-[13px] text-ink-700" aria-labelledby="analysis-inputs-h" data-testid="analysis-inputs">
      <h3 id="analysis-inputs-h" className="font-semibold text-ink-900">
        Analysis inputs
      </h3>
      <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline text-ink-500">Client brief: </dt>
          <dd className="inline" data-testid="inputs-brief">
            {brief.counts.answered} of {brief.counts.total} answered · {brief.counts.reviewed} reviewed
            {brief.counts.stale ? ` · ${brief.counts.stale} changed since review` : ""}
            {unknown ? ` · ${unknown} not discussed (sent as unknown)` : ""}
            {brief.conflicts.length ? ` · ${brief.conflicts.length} possible conflict${brief.conflicts.length === 1 ? "" : "s"}` : ""}
            {brief.analysisNote ? " · with your note for the analysis" : ""}.{" "}
            <Link className="font-medium text-navy-700 hover:underline" href="/client-objectives#client-discovery">
              Edit client objectives
            </Link>
          </dd>
        </div>
        <div>
          <dt className="inline text-ink-500">Scope: </dt>
          <dd className="inline" data-testid="inputs-scope">
            {scope.short} · {scopedHoldings} recorded holding{scopedHoldings === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-ink-500">Advisor-set allocation targets: </dt>
          <dd className="inline" data-testid="inputs-targets">
            {targets.length ? targets.join(" · ") : "none set (optional)"}. Your own targets for this alternative, not Claude&apos;s recommendations; a target never creates a trade.{" "}
            <Link className="font-medium text-navy-700 hover:underline" href="/allocation-desk">
              {targets.length ? "Change on the allocation desk" : "Set on the allocation desk"}
            </Link>
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 text-2xs text-ink-500">
        Never sent: your private discovery notes.{" "}
        {hostedOrLive
          ? "Claude analysis sends your question, the client brief and the portfolio information Claude asks for to Anthropic. Nothing runs until you choose to run it; changing an input makes earlier previews out of date."
          : "Nothing runs until you choose to run it; changing an input makes earlier previews out of date."}
      </p>
    </section>
  );
}
