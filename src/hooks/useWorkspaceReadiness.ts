"use client";

import { useMemo } from "react";
import { useAtlasStore } from "@/store/useStore";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { evaluateWorkspaceReadiness, readinessOk } from "@/engines/complianceEngine";

// Readiness for the whole workspace, shared by the top bar, sidebar, banners
// and pages so every surface shows the same status.
export function useWorkspaceReadiness() {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const disclosures = useAtlasStore((s) => s.disclosures);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const fxConfirmation = useAtlasStore((s) => s.fxConfirmation);
  const { holdings } = useNormalizedHoldings();
  return useMemo(() => {
    const checks = evaluateWorkspaceReadiness({ client, advisor, accounts, holdings, recommendations, disclosures, fxRates, sourceDocuments, fxConfirmation });
    const failing = checks.filter((c) => !c.passed);
    return { checks, failing, ready: readinessOk(checks) };
  }, [client, advisor, accounts, holdings, recommendations, disclosures, fxRates, sourceDocuments, fxConfirmation]);
}
