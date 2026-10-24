"use client";

import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { FxRatesPanel } from "@/components/market-data/FxRatesPanel";

// Exchange rates (kept at /market-data so existing links work). Atlas doesn't
// fetch or show security quotes (R18, #51): holding values come from
// statements, advisor entry and approved values, and this page holds only the
// reference rates that convert them into the reporting currency.
export default function ExchangeRatesPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Exchange rates"
        description="The reference rates that convert holdings into the reporting currency. Refresh them from Frankfurter (ECB reference rates), add a rate by hand, or confirm older rates you want to keep. No key or account is needed."
      />

      <FxRatesPanel />

      <p className="text-2xs text-ink-500 mt-3 leading-relaxed">
        Reporting currency: {reportingCurrency}. Holding values aren&apos;t repriced here: each keeps the statement, advisor-entered or approved value it was given, with its own date.
      </p>
    </>
  );
}
