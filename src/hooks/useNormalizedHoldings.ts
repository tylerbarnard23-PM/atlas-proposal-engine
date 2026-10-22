"use client";

import { useMemo } from "react";
import { useAtlasStore } from "@/store/useStore";
import { normalizeHoldings, type NormalizedHolding } from "@/engines/normalizationEngine";
import { generateInsights } from "@/engines/insightEngine";
import { useFxFreshness } from "@/hooks/useFxFreshness";

export function useNormalizedHoldings(): {
  holdings: NormalizedHolding[];
  insights: ReturnType<typeof generateInsights>;
  reportingCurrency: string;
} {
  const holdings = useAtlasStore((s) => s.holdings);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const client = useAtlasStore((s) => s.client);
  const fx = useFxFreshness();
  const fxConfirmed = fx.confirmation.state === "valid";

  return useMemo(() => {
    const normalized = normalizeHoldings(holdings, fxRates, client.proposalOutputCurrency);
    const insights = generateInsights({ holdings: normalized, reportingCurrency: client.proposalOutputCurrency, fx: { now: new Date(), confirmed: fxConfirmed } });
    return { holdings: normalized, insights, reportingCurrency: client.proposalOutputCurrency };
  }, [holdings, fxRates, client.proposalOutputCurrency, fxConfirmed]);
}
