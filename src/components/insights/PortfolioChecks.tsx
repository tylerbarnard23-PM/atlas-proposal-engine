"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReasonPicker } from "@/components/ui/ReasonPicker";
import { DataTaskItem } from "@/components/insights/DataTaskItem";
import { insightKey } from "@/engines/insightEngine";
import type { Insight, InsightBasis } from "@/domain/types";
import { formatTimestampDate } from "@/utils/formatting";

// Portfolio checks (formerly Insights): calculated facts and data problems
// from built-in Stratovell rules, available without any model. A check never
// creates a recommendation. "Analyze this finding" only hands the finding and
// its basis to the AI analysis view as a question; nothing runs or is spent
// until the advisor runs it there.

const DISMISS_REASONS = ["Not relevant for this client", "Client preference", "Already addressed"];
const CATEGORY_LABEL: Record<string, string> = {
  data_quality: "Data to complete",
  concentration: "Concentration",
  currency: "Currency exposure",
  country: "Country exposure",
  liquidity: "Liquidity and cash",
  fees: "Fund costs",
  valuation: "Valuations",
};

export function PortfolioChecks({ onAnalyze }: { /** Called with the finding when the advisor asks to analyze it. */ onAnalyze?: (i: Insight) => void }) {
  const setInsights = useAtlasStore((s) => s.setInsights);
  const dismissed = useAtlasStore((s) => s.dismissedInsights);
  const dismissInsight = useAtlasStore((s) => s.dismissInsight);
  const restoreInsight = useAtlasStore((s) => s.restoreInsight);
  const dismissedKeys = React.useMemo(() => new Set(dismissed.map((d) => d.key)), [dismissed]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const [showDismissed, setShowDismissed] = React.useState(false);
  const { insights } = useNormalizedHoldings();

  React.useEffect(() => {
    setInsights(insights);
  }, [insights, setInsights]);

  function dismiss(i: Insight, reason?: string) {
    dismissInsight({ key: insightKey(i), title: i.title, reason, dismissedAt: new Date().toISOString() });
    setDismissing(null);
    setNotice(`Dismissed: ${i.title}`);
  }

  const active = insights.filter((i) => !dismissedKeys.has(insightKey(i)));
  // Only show dismissals that still match a current check; the rest are
  // about holdings that have since changed or gone.
  const currentKeys = new Set(insights.map(insightKey));
  const dismissedNow = dismissed.filter((d) => currentKeys.has(d.key));

  const grouped: Record<string, Insight[]> = {};
  for (const i of active) (grouped[i.category] ??= []).push(i);

  return (
    <div className="space-y-4" data-testid="portfolio-checks">
      <p className="text-[13px] text-ink-700 leading-relaxed max-w-3xl">
        Calculated facts and data problems from built-in Stratovell rules, with no model involved. Thresholds are product defaults, not regulatory limits or this client&apos;s investment policy. A check never becomes a recommendation by itself: analyze it with Stratovell AI, or write your own in Recommendations.
      </p>
      {notice && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-100 px-4 py-2.5 text-[13px]">
          <span className="text-ink-800">{notice}</span>
          <button className="ml-auto text-ink-500 hover:text-ink-800" onClick={() => setNotice(null)}>
            Close
          </button>
        </div>
      )}
      {active.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-ink-500">{insights.length === 0 ? "No checks flag anything with the current data." : "Every check has been dismissed."}</CardBody>
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <Card key={cat}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{CATEGORY_LABEL[cat] ?? cat.replace("_", " ")}</CardTitle>
                  <Badge tone="navy">{list.length}</Badge>
                </div>
              </CardHeader>
              <CardBody className="p-0!">
                <ul>
                  {list.map((i) => {
                    const key = insightKey(i);
                    if (i.task) {
                      return (
                        <li key={key} className="px-5 py-3 border-t border-ink-100 first:border-t-0">
                          <DataTaskItem insight={i} onDismiss={() => setDismissing(key)} />
                          {dismissing === key && (
                            <ReasonPicker className="mt-3" prompt="Why dismiss this? (optional)" reasons={DISMISS_REASONS} confirmLabel="Dismiss" onConfirm={(reason) => dismiss(i, reason)} onCancel={() => setDismissing(null)} />
                          )}
                        </li>
                      );
                    }
                    const isDataQuality = i.category === "data_quality";
                    return (
                      <li key={i.id} className="px-5 py-3 border-t border-ink-100 first:border-t-0" data-testid="portfolio-check">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[14px] font-medium text-ink-900">{i.title}</div>
                            <div className="text-sm text-ink-600 mt-1 leading-relaxed">{i.detail}</div>
                            {i.basis && <BasisList basis={i.basis} />}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge tone={i.severity === "critical" ? "negative" : i.severity === "warning" ? "warning" : "neutral"}>{i.severity}</Badge>
                            {isDataQuality ? (
                              // A data problem is fixed in the data, not proposed to the client.
                              <Link href="/accounts-assets?review=1">
                                <Button size="sm" variant="secondary">
                                  Open the value check
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="secondary" iconLeft={<Sparkles className="h-3.5 w-3.5" />} onClick={() => onAnalyze?.(i)} disabled={!onAnalyze} data-testid="analyze-finding">
                                Analyze this finding
                              </Button>
                            )}
                            {dismissing !== key && (
                              <button className="text-[12px] text-ink-500 hover:text-ink-800 hover:underline" onClick={() => setDismissing(key)}>
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                        {dismissing === key && (
                          <ReasonPicker className="mt-3" prompt="Why dismiss this check? (optional)" reasons={DISMISS_REASONS} confirmLabel="Dismiss check" onConfirm={(reason) => dismiss(i, reason)} onCancel={() => setDismissing(null)} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {dismissedNow.length > 0 && (
        <Card>
          <CardHeader>
            <button className="flex w-full items-center gap-2 text-left" aria-expanded={showDismissed} onClick={() => setShowDismissed((v) => !v)}>
              {showDismissed ? <ChevronDown className="h-4 w-4 text-ink-500" /> : <ChevronRight className="h-4 w-4 text-ink-500" />}
              <CardTitle>Dismissed ({dismissedNow.length})</CardTitle>
            </button>
          </CardHeader>
          {showDismissed && (
            <CardBody className="p-0!">
              <ul>
                {dismissedNow.map((d) => (
                  <li key={d.key} className="flex items-start justify-between gap-3 px-5 py-3 border-t border-ink-100 first:border-t-0">
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink-700">{d.title}</div>
                      <div className="text-[12px] text-ink-500 mt-0.5">
                        Dismissed {formatTimestampDate(d.dismissedAt)}
                        {d.reason ? ` · ${d.reason}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" iconLeft={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restoreInsight(d.key)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}

/** Prefills the analysis question with a Portfolio check and its basis. It runs nothing. */
export function findingQuestion(i: Pick<Insight, "title" | "detail" | "basis">): string {
  const b = i.basis;
  const facts = b
    ? [`Rule: ${b.rule}.`, b.observed && `Observed: ${b.observed}.`, b.threshold && `Threshold: ${b.threshold}.`, `Scope: ${b.scope}.`, b.valuationDates && `Valuation dates: ${b.valuationDates}.`, b.limitations.length ? `Limits: ${b.limitations.join(" ")}` : ""].filter(Boolean).join(" ")
    : i.detail;
  return `Analyze this portfolio check for this client: "${i.title}". ${facts} Is it relevant given the client brief? Compare feasible ways to address it, including leaving it as it is, and draft a recommendation only if the brief and the figures support one. Say what information is missing.`.slice(0, 2000);
}

/** The check's basis: where it comes from and what it can and can't see. */
function BasisList({ basis }: { basis: InsightBasis }) {
  const rows: [string, string | undefined][] = [
    ["Source", `${basis.source}: ${basis.rule}`],
    ["Observed", basis.observed],
    ["Threshold", basis.threshold],
    ["Scope", basis.scope],
    ["Valuation date", basis.valuationDates],
    ["Limits", basis.limitations.length ? basis.limitations.join(" ") : undefined],
  ];
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs text-ink-600" data-testid="check-basis">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-ink-400">{k}</dt>
            <dd className="text-ink-700">{v}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
}
