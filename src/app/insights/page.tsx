"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { recommendationFromInsight } from "@/engines/recommendationEngine";

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
  const { insights } = useNormalizedHoldings();

  React.useEffect(() => {
    setInsights(insights);
  }, [insights, setInsights]);

  const grouped: Record<string, typeof insights> = {};
  for (const i of insights) (grouped[i.category] ??= []).push(i);

  return (
    <>
      <PageHeader
        eyebrow="Advisor Review"
        title="Insights"
        description="Rules-based observations across the household. Insights surface review items — they are not financial advice, and only become recommendations when an advisor decides."
      />
      {insights.length === 0 ? (
        <Card><CardBody className="text-sm text-ink-500">No insights detected with current data.</CardBody></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <Card key={cat}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{cat.replace("_", " ")}</CardTitle>
                  <Badge tone="navy">{list.length}</Badge>
                </div>
              </CardHeader>
              <CardBody className="!p-0">
                <ul>
                  {list.map((i) => (
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
                        <div className="flex flex-col items-end gap-2">
                          <Badge tone={i.severity === "critical" ? "negative" : i.severity === "warning" ? "warning" : "neutral"}>
                            {i.severity}
                          </Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => upsertRec(recommendationFromInsight(i))}
                          >
                            Convert to recommendation
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
