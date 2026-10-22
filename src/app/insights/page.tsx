"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReasonPicker } from "@/components/ui/ReasonPicker";
import { DataTaskItem } from "@/components/insights/DataTaskItem";
import { recommendationFromInsight } from "@/engines/recommendationEngine";
import { insightKey } from "@/engines/insightEngine";
import type { Insight } from "@/domain/types";
import { formatTimestampDate } from "@/utils/formatting";

const DISMISS_REASONS = ["Not relevant for this client", "Client preference", "Already addressed"];
const CATEGORY_LABEL: Record<string, string> = { data_quality: "Data to complete" };

export default function InsightsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const upsertRec = useAtlasStore((s) => s.upsertRecommendation);
  const setInsights = useAtlasStore((s) => s.setInsights);
  const recs = useAtlasStore((s) => s.recommendations);
  const dismissed = useAtlasStore((s) => s.dismissedInsights);
  const dismissInsight = useAtlasStore((s) => s.dismissInsight);
  const restoreInsight = useAtlasStore((s) => s.restoreInsight);
  const converted = React.useMemo(() => new Set(recs.map((r) => r.sourceInsightKey).filter(Boolean)), [recs]);
  const dismissedKeys = React.useMemo(() => new Set(dismissed.map((d) => d.key)), [dismissed]);
  const [notice, setNotice] = React.useState<{ text: string; link?: boolean } | null>(null);
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const [showDismissed, setShowDismissed] = React.useState(false);
  const { insights, reportingCurrency } = useNormalizedHoldings();

  React.useEffect(() => {
    setInsights(insights);
  }, [insights, setInsights]);

  function convert(i: Insight) {
    if (converted.has(insightKey(i))) return;
    const rec = recommendationFromInsight(i, reportingCurrency);
    upsertRec(rec);
    setNotice({ text: `Added a draft recommendation: ${rec.title}`, link: true });
  }

  function dismiss(i: Insight, reason?: string) {
    dismissInsight({ key: insightKey(i), title: i.title, reason, dismissedAt: new Date().toISOString() });
    setDismissing(null);
    setNotice({ text: `Dismissed: ${i.title}` });
  }

  const active = insights.filter((i) => !dismissedKeys.has(insightKey(i)));
  // Only show dismissals that still match a current insight; the rest are
  // about holdings that have since changed or gone.
  const currentKeys = new Set(insights.map(insightKey));
  const dismissedNow = dismissed.filter((d) => currentKeys.has(d.key));

  const grouped: Record<string, Insight[]> = {};
  for (const i of active) (grouped[i.category] ??= []).push(i);

  return (
    <>
      <PageHeader
        eyebrow="Advisor Review"
        title="Insights"
        description="Rules-based observations across the household. Insights surface review items — they are not financial advice, and only become recommendations when an advisor decides. Dismiss any that don't apply."
      />
      {notice && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-4 py-2.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-positive-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice.text}
          </span>
          {notice.link && (
            <Link href="/recommendations" className="font-medium text-navy-700 hover:underline">Review and approve it in Recommendations →</Link>
          )}
          <button className="ml-auto text-ink-500 hover:text-ink-800" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {active.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-ink-500">
            {insights.length === 0 ? "No insights detected with current data." : "Every insight has been converted or dismissed."}
          </CardBody>
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
                    const isDataQuality = i.category === "data_quality";
                    if (i.task) {
                      return (
                        <li key={key} className="px-5 py-3 border-t border-ink-100 first:border-t-0">
                          <DataTaskItem insight={i} onDismiss={() => setDismissing(key)} />
                          {dismissing === key && (
                            <ReasonPicker
                              className="mt-3"
                              prompt="Why dismiss this? (optional)"
                              reasons={DISMISS_REASONS}
                              confirmLabel="Dismiss"
                              onConfirm={(reason) => dismiss(i, reason)}
                              onCancel={() => setDismissing(null)}
                            />
                          )}
                        </li>
                      );
                    }
                    return (
                      <li key={i.id} className="px-5 py-3 border-t border-ink-100 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[14px] font-medium text-ink-900">{i.title}</div>
                            <div className="text-sm text-ink-600 mt-1 leading-relaxed">{i.detail}</div>
                            {i.context && i.context.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {i.context.map((c, idx) => (
                                  <span key={idx} className="text-2xs text-ink-500 border border-ink-100 rounded-full px-2 py-0.5">
                                    <span className="text-ink-400">{c.label}:</span> <span className="text-ink-700 ml-1">{c.value}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge tone={i.severity === "critical" ? "negative" : i.severity === "warning" ? "warning" : "neutral"}>
                              {i.severity}
                            </Badge>
                            {converted.has(key) ? (
                              <Link href="/recommendations" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-positive-600 hover:underline">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Added to recommendations
                              </Link>
                            ) : isDataQuality ? (
                              // A data problem is fixed in the data, not proposed to the client.
                              <Link href="/accounts-assets?review=1">
                                <Button size="sm" variant="secondary">Open the value check</Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => convert(i)}>
                                Convert to recommendation
                              </Button>
                            )}
                            {!converted.has(key) && dismissing !== key && (
                              <button className="text-[12px] text-ink-500 hover:text-ink-800 hover:underline" onClick={() => setDismissing(key)}>
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                        {dismissing === key && (
                          <ReasonPicker
                            className="mt-3"
                            prompt="Why dismiss this insight? (optional)"
                            reasons={DISMISS_REASONS}
                            confirmLabel="Dismiss insight"
                            onConfirm={(reason) => dismiss(i, reason)}
                            onCancel={() => setDismissing(null)}
                          />
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
        <Card className="mt-5">
          <CardHeader>
            <button
              className="flex w-full items-center gap-2 text-left"
              aria-expanded={showDismissed}
              onClick={() => setShowDismissed((v) => !v)}
            >
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
    </>
  );
}
