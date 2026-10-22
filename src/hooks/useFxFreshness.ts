"use client";

import { useMemo } from "react";
import { useAtlasStore } from "@/store/useStore";
import { fxFreshness, type FxFreshness } from "@/engines/fxPolicy";

// Age and confirmation of the exchange rates the workspace's calculations use
// (#26), shared by Market Data, notices, data tasks and readiness so every
// surface reports the same status. The clock is read when the inputs change.
export function useFxFreshness(): FxFreshness {
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  const confirmation = useAtlasStore((s) => s.fxConfirmation);
  return useMemo(
    () => fxFreshness({ holdings, accounts, recommendations, fxRates, reportingCurrency, confirmation, now: new Date() }),
    [holdings, accounts, recommendations, fxRates, reportingCurrency, confirmation]
  );
}
