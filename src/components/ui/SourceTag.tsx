import * as React from "react";
import { Badge } from "./Badge";
import type { QuoteType, ValuationSource } from "@/domain/types";
import { cn } from "@/utils/cn";
import { formatCalendarDate } from "@/utils/formatting";

const QUOTE_TONE: Record<QuoteType, "positive" | "navy" | "warning" | "neutral" | "info" | "negative"> = {
  real_time: "positive",
  delayed: "navy",
  eod: "navy",
  reference: "info",
  manual: "warning",
  ocr_extracted: "warning",
  advisor_entered: "warning",
  mock: "negative",
};

const QUOTE_LABEL: Record<QuoteType, string> = {
  real_time: "Real-time",
  delayed: "Delayed",
  eod: "EOD",
  reference: "Reference",
  manual: "Manual",
  ocr_extracted: "OCR",
  advisor_entered: "Advisor",
  mock: "Fallback",
};

export function QuoteTypeBadge({ type, className }: { type: QuoteType; className?: string }) {
  return (
    <Badge tone={QUOTE_TONE[type]} className={cn(className)}>
      {QUOTE_LABEL[type]}
    </Badge>
  );
}

export function ValuationSourceLine({ source }: { source: ValuationSource }) {
  const label =
    source.kind === "statement"
      ? "Statement"
      : source.kind === "advisor_entered"
      ? "Advisor entered"
      : source.kind === "advisor_override"
      ? "Advisor override"
      : source.kind === "market_data"
      ? source.providerName ?? "Market data"
      : source.kind === "manual_valuation"
      ? "Manual valuation"
      : "Mock";
  return (
    <span className="text-xs text-ink-500">
      {label}
      {source.providerName && source.kind !== "market_data" ? ` · ${source.providerName}` : ""}
      {source.asOf ? ` · ${formatCalendarDate(source.asOf)}` : ""}
    </span>
  );
}
