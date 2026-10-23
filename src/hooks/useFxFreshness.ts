"use client";

import { useEffect, useId, useMemo } from "react";
import { useAtlasStore } from "@/store/useStore";
import { fxDeadline, fxFreshness, type FxFreshness } from "@/engines/fxPolicy";
import { fxClock } from "@/engines/fxClock";
import { useFxNow } from "@/hooks/useFxNow";

// Age and confirmation of the exchange rates the workspace's calculations use
// (#26), shared by Exchange rates, notices, data tasks and readiness so every
// surface reports the same status. It's evaluated at the shared FX clock,
// which also ticks when this confirmation expires (or a confirmation given
// slightly ahead of this clock comes into range).
export function useFxFreshness(): FxFreshness {
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  const confirmation = useAtlasStore((s) => s.fxConfirmation);
  const now = useFxNow();
  const f = useMemo(
    () => fxFreshness({ holdings, accounts, recommendations, fxRates, reportingCurrency, confirmation, now }),
    [holdings, accounts, recommendations, fxRates, reportingCurrency, confirmation, now]
  );

  const key = `confirmation:${useId()}`;
  const deadline = fxDeadline(f);
  useEffect(() => {
    fxClock.setDeadline(key, deadline);
    return () => fxClock.setDeadline(key, null);
  }, [key, deadline]);
  return f;
}
