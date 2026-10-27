"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useAtlasStore } from "@/store/useStore";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { useFxNow } from "@/hooks/useFxNow";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { reviewedAlternative } from "@/engines/approvedSnapshot";

// Live preview that mirrors the print template using the in-browser store.
// Used inside the PDF Preview iframe. Server-side Puppeteer renders use /proposal-print/[jobId].

export default function ProposalPdfPage() {
  return (
    <ClientOnly fallback={<div style={{ padding: 24, fontFamily: "ui-sans-serif" }}>Loading proposal preview…</div>}>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const params = useSearchParams();
  const variant = (params?.get("variant") as "draft" | "final") ?? "draft";
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const proposal = useAtlasStore((s) => s.proposal);
  const sections = useAtlasStore((s) => s.proposalSections);
  const disclosures = useAtlasStore((s) => s.disclosures);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const fxConfirmation = useAtlasStore((s) => s.fxConfirmation);
  const strategies = useAtlasStore((s) => s.strategies);
  const models = useAtlasStore((s) => s.models);
  const recs = useAtlasStore((s) => s.recommendations);
  const workingDraft = useAtlasStore((s) => s.workingDraft);
  const alternatives = useAtlasStore((s) => s.alternatives);
  // D2a: the pin of the alternative whose approved actions the document shows.
  const modelPin = React.useMemo(() => reviewedAlternative({ recommendations: recs, workingDraft, alternatives }).model ?? null, [recs, workingDraft, alternatives]);
  const now = useFxNow();
  const { holdings } = useNormalizedHoldings();

  return (
    <ProposalPdfTemplate
      client={client}
      advisor={advisor}
      accounts={accounts}
      holdings={holdings}
      recommendations={recommendations}
      proposal={proposal}
      sections={sections}
      disclosures={disclosures.filter((d) => proposal.disclosureIds.includes(d.id) || d.required)}
      fxRates={fxRates}
      fxConfirmation={fxConfirmation}
      strategies={strategies}
      models={models}
      modelPin={modelPin}
      now={now.toISOString()}
      variant={variant}
    />
  );
}
