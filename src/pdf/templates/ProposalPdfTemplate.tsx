import * as React from "react";
import type {
  FxConfirmation,
  Account,
  AdvisorProfile,
  ClientProfile,
  ComplianceCheck,
  Disclosure,
  DraftInputBasis,
  Holding,
  ModelRevision,
  Proposal,
  ProposalSection,
  Recommendation,
  FxRate,
  StrategyRevision,
} from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { PDF_BASE_CSS } from "../styles/pdfStyles";
import { formatCalendarDate, formatCurrency, formatDateTime, formatPercent, formatTimestampDate } from "@/utils/formatting";
import { applyRecommendationsToProposed, cashShortfallsOf, reserveStatus, sectionLabel } from "@/engines/proposalEngine";
import { accountBasis, exposureView, feeCoverage, findRevision, label as strategyLabel, minimumStatus, sleevePlan, sleeveRefs } from "@/engines/strategyProposals";
import { costIncomeCoverage, describeCoverage } from "@/engines/costIncome";
import { evaluateDesk } from "@/engines/allocationDesk";
import { basisBreakdown, describeBasisCounts, describeDateRange, describeValueDates, provenanceCounts, valueDateSummary, valueProvenance } from "@/engines/valuationProvenance";
import { currentDisclosure } from "@/domain/disclosureLibrary";
import { describeAmounts } from "@/engines/recommendationAmounts";
import { resolveFxRate } from "@/engines/currencyEngine";
import { STALE_FX_DAYS, describeFxSources, fxFreshness, utcDate, utcMinute, type FxFreshness } from "@/engines/fxPolicy";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { coverageLabel, describeUnvalued, formatTotal, reportingValue, valuationSummary, valuationTotal } from "@/engines/valuationTotals";
import { dataQualityScore } from "@/engines/dataQualityEngine";
import { PDF_SAMPLE_NOTICE } from "@/domain/legal";
import { accentTint, checkLogoDataUrl, isValidAccentColor, resolveFirmPlaceholder } from "@/domain/branding";

// Print-safe palette used by both the pie chart and the allocation list. Order
// is significant — pie slices and bar rows pick by index so colors match.
const PIE_PALETTE = [
  "#172F52", // navy-700
  "#456FAE", // navy-400
  "#947629", // gold-500
  "#D2B45A", // gold-300
  "#3E4659", // ink-600
  "#647088", // slatey-500
  "#226039", // positive
  "#7A2222", // negative
  "#7B5B0F", // warning
  "#1F3F6E", // navy-600
];

interface AllocationSlice {
  label: string;
  value: number;
  pct: number;
}

// Static SVG pie chart sized for the PDF print layout. No JS, no measurement
// dependencies — works under React's renderToStaticMarkup + Puppeteer.
//
// Slices preserve their original index from the input array as their color
// index, so a slice's color matches its position in the legend even when
// other slices in the same dataset have zero value (e.g. the proposed view
// where Equity drops to 0% and Cash absorbs everything — Cash should still
// be drawn in its legend color, not in palette[0]).
function PdfPieChart({ data, size = 168 }: { data: AllocationSlice[]; size?: number }) {
  const indexed = data.map((slice, originalIndex) => ({ ...slice, originalIndex }));
  const slices = indexed.filter((d) => d.value > 0);
  if (slices.length === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 1;
  const total = slices.reduce((a, s) => a + s.value, 0);

  // 100% in a single slice can't be drawn as one arc path — render a circle
  // using the surviving slice's legend color.
  if (slices.length === 1) {
    const only = slices[0];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={PIE_PALETTE[only.originalIndex % PIE_PALETTE.length]}
          stroke="#fff"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  let cursor = -Math.PI / 2; // start at 12 o'clock
  const paths = slices.map((slice) => {
    const angle = (slice.value / total) * Math.PI * 2;
    const a1 = cursor;
    const a2 = cursor + angle;
    cursor = a2;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${cx.toFixed(3)},${cy.toFixed(3)} L ${x1.toFixed(3)},${y1.toFixed(3)} A ${r},${r} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
    return (
      <path
        key={slice.label}
        d={d}
        fill={PIE_PALETTE[slice.originalIndex % PIE_PALETTE.length]}
        stroke="#fff"
        strokeWidth={1.25}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {paths}
    </svg>
  );
}

function PdfPieLegend({ data }: { data: AllocationSlice[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "8.5pt" }}>
      {data.slice(0, 10).map((slice, i) => (
        <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: PIE_PALETTE[i % PIE_PALETTE.length],
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--ink-700)", flex: 1 }}>{slice.label}</span>
          <span style={{ color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
            {formatPercent(slice.pct, 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ProposalPdfTemplateProps {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  recommendations: Recommendation[];
  sections: ProposalSection[];
  disclosures: Disclosure[];
  proposal: Proposal;
  /** Rates for expressing proposed trades in each holding's own currency. */
  fxRates: FxRate[];
  variant: "draft" | "final";
  /** The advisor's confirmation of stale rates in use (#26). */
  fxConfirmation?: FxConfirmation | null;
  /** When the document is produced (ISO); the rate ages are computed against it. */
  now?: string;
  /** The advisor's time zone, for timestamps such as the prepared date (#28). Calendar dates don't depend on it. Defaults to the runtime's. */
  timeZone?: string;
  /** D2a: the strategy revisions the sleeves use and the pinned model revision, for the sleeves section. */
  strategies?: StrategyRevision[];
  models?: ModelRevision[];
  modelPin?: { id: string; revision: number } | null;
  /** D3: the approved version this document presents, when it presents one. */
  snapshot?: SnapshotMeta;
}

/**
 * How a version is being shown: the read-only meeting view (viewing, not
 * issuing), a final document issued from it, or a watermarked draft copy.
 */
export type SnapshotPresentation = "meeting" | "issued" | "draft_copy";

export interface SnapshotMeta {
  id: string;
  version: number;
  approvedAt: string;
  approvedBy: { advisorId: string; name: string };
  note?: string;
  fingerprint: string;
  alternativeName: string;
  scopeAccountIds: string[] | null;
  inputBasis: DraftInputBasis;
  /** The shared readiness on the version's inputs at its approval time. */
  readiness: ComplianceCheck[];
  presentation: SnapshotPresentation;
  /** When a document was issued from the version (issued and draft copies). */
  issuedAt?: string;
}

/** The one line that says which version this is and how it is being shown. */
export function snapshotMarker(m: SnapshotMeta, timeZone?: string): string {
  const approved = `approved ${formatDateTime(m.approvedAt, { timeZone })} by ${m.approvedBy.name || "the advisor"}`;
  if (m.presentation === "meeting") return `Viewing approved version ${m.version} (${approved}). Read-only meeting view: not an issued document.`;
  const issued = m.issuedAt ? formatDateTime(m.issuedAt, { timeZone }) : "";
  if (m.presentation === "draft_copy") return `Draft copy of approved version ${m.version} (${approved}), generated ${issued}. Not a final document.`;
  return `Issued ${issued} from approved version ${m.version} (${approved}). Figures are as approved; nothing was refreshed.`;
}

function summarize(holdings: Holding[], group: (h: Holding) => string) {
  const totals = new Map<string, number>();
  // Valued holdings only; the document labels this when valuation is partial.
  for (const h of holdings) {
    const v = reportingValue(h);
    if (h.isLiability || v == null) continue;
    const key = group(h);
    totals.set(key, (totals.get(key) ?? 0) + v);
  }
  const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function pageNumber(idx: number) {
  return `Page ${idx}`;
}

export function ProposalPdfTemplate(props: ProposalPdfTemplateProps) {
  const { client, advisor, accounts, recommendations, sections, disclosures, proposal, fxRates, variant } = props;
  // The client's output currency is the only reporting currency: holdings are
  // normalized into it and readiness uses it. The proposal keeps no copy.
  const reportingCurrency = client.proposalOutputCurrency;
  // Value every holding here from its amount and the current rates, whatever
  // reporting value it arrived with, so the PDF route and the preview can't
  // render a cached figure for a holding that has lost its rate.
  const holdings = normalizeHoldings(props.holdings, fxRates, reportingCurrency);
  // When it was prepared: a timestamp, shown in the advisor's time zone so the
  // server-rendered PDF and the in-app preview agree (#28).
  const today = formatTimestampDate(props.now ?? new Date().toISOString(), { timeZone: props.timeZone, month: "long", locale: client.locale ?? "en-US" });
  const isDraft = variant === "draft";
  const snap = props.snapshot;
  // Branding is re-validated here so an invalid value can never reach the
  // document, whichever caller rendered it.
  const logo = advisor.logoDataUrl && checkLogoDataUrl(advisor.logoDataUrl).ok ? advisor.logoDataUrl : undefined;
  const accent = isValidAccentColor(advisor.accentColor) ? advisor.accentColor : undefined;

  const enabled = (key: string) => sections.find((s) => s.key === key)?.enabled !== false;
  // Page titles come from the section key, as the builder's labels do.
  const titleOf = (key: string) => sectionLabel({ key, label: key, enabled: true });
  // Any advisor-approved rec drives the Proposed view's math. The
  // Include-in-PDF toggle only controls whether the rec's prose appears in
  // the Recommendations section — it should not silently zero out the
  // before/after analysis.
  const proposedRecs = recommendations.filter((r) => r.approvedByAdvisor);
  const approvedRecs = recommendations.filter((r) => r.approvedByAdvisor && r.includeInPdf);
  const remainingRecs = recommendations.filter((r) => !r.approvedByAdvisor && r.includeInPdf);

  // Proposed allocation reflects every advisor-approved recommendation,
  // independent of whether it's included in the PDF prose. Each rec's
  // intent is interpreted by applyRecommendationsToProposed (sell zeroes,
  // reduce subtracts, increase/buy adds, with offsetting cash flow).
  const now = props.now ? new Date(props.now) : new Date();
  const fx = { reportingCurrency, rates: fxRates, now };
  // The rates the calculations below actually use, with their age (#26).
  const fxStatus = fxFreshness({ holdings: props.holdings, accounts, recommendations, fxRates, reportingCurrency, confirmation: props.fxConfirmation ?? null, now });
  // Each rate's own source, not a blanket "ECB" (sources can be mixed).
  const fxSources = describeFxSources(fxStatus.inUse);
  const proposed = applyRecommendationsToProposed(holdings, proposedRecs, accounts, fx);
  const proposedHoldings = proposed.holdings;
  const cashShortfalls = cashShortfallsOf(proposedHoldings, accounts, fx);
  // Approved recommendations left out of the proposed view for lack of an FX rate.
  const unconverted = proposed.unresolved;

  // D3: a version presents its investment scope. Its amounts, weights and
  // exposure come from the shared evaluator over that scope (the desk's
  // approved view, as the version's results do); assets outside the scope and
  // every liability are household context, kept out of the denominators.
  // Readiness, valuation and FX warnings stay household-wide. A document with
  // no version keeps its household-wide figures.
  const desk = snap
    ? evaluateDesk({
        holdings,
        accounts,
        recommendations: proposedRecs,
        draft: { id: snap.id, name: snap.alternativeName, scopeAccountIds: snap.scopeAccountIds, memberIds: proposedRecs.map((r) => r.id), targets: {}, inputBasis: snap.inputBasis, model: props.modelPin ?? null, createdAt: snap.approvedAt, updatedAt: snap.approvedAt },
        fx,
        view: "approved",
      })
    : null;
  const inScope = desk ? new Set(desk.scope.accountIds) : null;
  const scoped = <T extends Holding>(hs: T[]): T[] => (inScope ? hs.filter((h) => inScope.has(h.accountId) && !h.isLiability && h.assetClass !== "liability") : hs);
  const scopeTag = desk ? " (investment scope)" : "";
  const scopeHoldings = scoped(holdings);
  const scopeProposed = scoped(proposedHoldings);
  const deskSlices = (k: "current" | "proposed") =>
    desk!.rows
      .filter((r) => Math.abs(r[k]) > 1e-9)
      .map((r) => ({ label: r.label, value: r[k], pct: (k === "current" ? r.currentPct : r.proposedPct) ?? 0 }))
      .sort((a, b) => b.value - a.value);

  const nw = valuationSummary(holdings);
  // Partial or unavailable totals are labeled; charts describe valued holdings only.
  const valuedOnly = nw.complete ? "" : " (valued holdings only)";
  const unvaluedNote = describeUnvalued(nw, reportingCurrency);
  const allocClass = desk ? deskSlices("current") : summarize(holdings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other");
  const allocCurrency = summarize(scopeHoldings, (h) => h.currency);
  const allocCountry = summarize(scopeHoldings, (h) => h.country ?? "Unknown");
  const investible = scopeHoldings.filter((h) => !h.isLiability);
  const investibleTotal = valuationTotal(investible);
  // Denominator for the valued subset's percentages (see `valuedOnly`).
  const totalInvestible = investibleTotal.value ?? 0;
  const valuedInvestible = investible.filter((h) => reportingValue(h) != null);
  const liabilitiesLabel = nw.liabilities.value == null ? "Unavailable" : formatCurrency(Math.abs(nw.liabilities.value), reportingCurrency, { compact: true });
  const noConversion = !fxSources && nw.complete && unconverted.length === 0;
  const netWorthLabel = desk ? "Household net worth" : "Net Worth";
  const investibleLabel = desk ? "Investment scope" : "Investible Assets";
  const liabilitiesTitle = desk ? "Household liabilities" : "Liabilities";
  const scopeNote = desk ? " Figures cover the investment scope only; assets outside it and liabilities are household context, listed under Reviewed Package." : "";
  const allocProposedClass = desk ? deskSlices("proposed") : summarize(proposedHoldings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other");
  // D2a: proposed manager/strategy sleeves in this result, shown in their own
  // section: target (from the pinned model) against funded (the evaluator's
  // result, in the sleeve's currency), minimum, fees and look-through exposure.
  const strategies = props.strategies ?? [];
  const sleeveRefsById = sleeveRefs(proposedRecs);
  const sleeveHoldings = proposedHoldings.filter((h) => sleeveRefsById.has(h.id));
  const sleeveNames = sleeveHoldings.map((h) => strategyLabel(sleeveRefsById.get(h.id)!));
  const pinnedModel = props.modelPin ? findRevision(props.models ?? [], props.modelPin.id, props.modelPin.revision) ?? null : null;
  const sleeveRows = [...new Map(proposedRecs.filter((r) => r.destination?.strategy && !r.relatedHoldingId).map((r) => [r.destination!.id, r] as const)).values()].map((r) => {
    const d = r.destination!;
    const ref = d.strategy!;
    const def = findRevision(strategies, ref.id, ref.revision);
    const left = proposed.blocked.find((b) => b.recommendationIds.includes(r.id));
    const position = proposedHoldings.find((h) => h.id === d.id);
    const funded = left || !position ? 0 : position.nativeMarketValue;
    const plan = pinnedModel?.kind === "strategy" ? sleevePlan({ model: pinnedModel, strategies, basis: accountBasis({ account: accounts.find((a) => a.id === d.accountId), holdings, fx }) }) : null;
    const target = plan?.basis.ok ? plan.rows.find((x) => x.strategy.id === ref.id && x.strategy.revision === ref.revision) : undefined;
    return {
      id: d.id,
      label: strategyLabel(ref),
      account: accounts.find((a) => a.id === d.accountId)?.name ?? d.accountId,
      currency: d.currency,
      target: target ? { amount: target.target, weight: target.weight } : null,
      funded,
      blocked: left?.reason ?? null,
      minimum: minimumStatus(ref.minimum, funded, !!ref.review),
      review: ref.review?.note ?? null,
      fees: def ? feeCoverage(def.fees) : "Strategy revision not included",
    };
  });
  // A version's exposure is the desk's, over its scope's positions.
  const exposure = exposureView({
    positions: desk ? desk.positions : proposedHoldings.filter((h) => !h.isLiability).map((h) => ({ id: h.id, assetClass: h.assetClass, proposed: reportingValue(h), accountId: h.accountId })),
    recommendations: proposedRecs,
    strategies,
  });

  // Align legend ordering with the current allocation so colors stay stable
  // across the Current → Proposed pair (a label keeps the same color even if
  // its rank changes between the two pies).
  const orderIndex = new Map(allocClass.map((s, i) => [s.label, i] as const));
  const allocProposedClassOrdered = [...allocProposedClass].sort(
    (a, b) => (orderIndex.get(a.label) ?? 99) - (orderIndex.get(b.label) ?? 99)
  );

  const dq = dataQualityScore(holdings.flatMap((h) => h.dataQuality));
  const stale = holdings.filter((h) => h.priceFreshness === "stale").length;
  const mockCount = holdings.filter((h) => h.valuationSource.kind === "mock").length;
  // What each value is based on: the valuation the resolver uses, with its own date (R18).
  const provenance = new Map(holdings.map((h) => [h.id, valueProvenance(h)]));
  const basisCounts = provenanceCounts(holdings);
  const manualCount = basisCounts.manual;
  const valueDates = describeValueDates(valueDateSummary(holdings));

  let pageIdx = 1;
  const pages: React.ReactNode[] = [];

  // ---------- COVER ----------
  pages.push(
    <div className="pdf-cover" key="cover">
      <div>
        <div className="pdf-cover-eyebrow">Confidential Wealth Proposal</div>
        {logo && (
          <div style={{ display: "inline-flex", background: "white", borderRadius: 6, padding: "6pt 9pt", marginTop: "0.2in" }}>
            <img src={logo} alt={`${advisor.firmName} logo`} style={{ maxHeight: "0.45in", maxWidth: "2.2in", objectFit: "contain" }} />
          </div>
        )}
        <div className="pdf-cover-firm" style={{ marginTop: "0.25in" }}>{advisor.firmName}</div>
      </div>
      <div>
        <h1 className="pdf-title" style={{ color: "white" }}>{client.householdName ?? client.fullName}</h1>
        <div style={{ marginTop: "0.18in", fontSize: "11pt", color: "rgba(255,255,255,0.85)" }}>{proposal.title}</div>
        <div style={{ marginTop: "0.4in", display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "8pt", columnGap: "0.5in", maxWidth: "5in" }}>
          <div className="pdf-cover-meta">
            <div className="pdf-cover-eyebrow" style={{ marginBottom: 2 }}>Advisor</div>
            <div>{advisor.name}</div>
            <div>{advisor.email}</div>
          </div>
          <div className="pdf-cover-meta">
            <div className="pdf-cover-eyebrow" style={{ marginBottom: 2 }}>Date</div>
            <div>{today}</div>
            <div className="pdf-cover-eyebrow" style={{ marginBottom: 2, marginTop: 8 }}>Reporting</div>
            <div>{client.reportingCountry} · {reportingCurrency}</div>
          </div>
        </div>
      </div>
      <div>
        <div className="pdf-disclaimer">
          <strong>{PDF_SAMPLE_NOTICE}</strong> The names, firm, holdings and figures in this document are fictional and were produced to demonstrate software. Values, sources, and assumptions are disclosed in the body of this document.
        </div>
        <div className="pdf-cover-meta" style={{ marginTop: "0.35in" }}>
          <span className="pdf-pill warn" style={{ background: "rgba(255,255,255,0.12)", color: "#F1E7C7", borderColor: "rgba(255,255,255,0.25)", marginRight: 8 }}>SAMPLE — demonstration only</span>
          {isDraft && (
            <span className="pdf-pill warn" style={{ background: "rgba(255,255,255,0.12)", color: "#F1E7C7", borderColor: "rgba(255,255,255,0.25)" }}>DRAFT — for advisor review</span>
          )}
        </div>
        {snap && (
          <div className="pdf-cover-meta pdf-snapshot-marker" style={{ marginTop: "0.2in" }}>
            {snapshotMarker(snap, props.timeZone)} Fingerprint {snap.fingerprint}.
          </div>
        )}
      </div>
    </div>
  );

  function PageWrap({ title, children, eyebrow }: { title: string; children: React.ReactNode; eyebrow?: string }) {
    pageIdx += 1;
    const num = pageIdx - 1;
    return (
      <div className="pdf-page" key={`p${pageIdx}`}>
        {/* Every page carries a watermark: DRAFT for working copies, SAMPLE for
            "final" output, since this demo never produces a real deliverable. */}
        <div className="pdf-watermark">{isDraft ? "DRAFT" : "SAMPLE"}</div>
        <div className="pdf-headerline">
          <div className="left">
            {eyebrow && <span className="pdf-eyebrow" style={{ marginRight: 12 }}>{eyebrow}</span>}
            {title}
          </div>
          <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {logo && <img src={logo} alt="" style={{ maxHeight: "12pt", maxWidth: "0.9in", objectFit: "contain" }} />}
            {client.householdName ?? client.fullName}
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
        <div className="pdf-sample-notice">{PDF_SAMPLE_NOTICE}</div>
        <div className="pdf-footer">
          <span>{advisor.firmName} · Prepared {today}{snap ? ` · Approved version ${snap.version}` : ""}</span>
          <span>{pageNumber(num)}</span>
        </div>
      </div>
    );
  }

  // ---------- REVIEWED PACKAGE (D3: an approved version) ----------
  // Always present for a version, whatever the section toggles: the version's
  // identity and basis, and every approved action that changes the numbers,
  // in saved order, even one whose prose is left out.
  if (snap) {
    const scopeNames = snap.scopeAccountIds == null ? "Every investment account" : snap.scopeAccountIds.map((id) => accounts.find((a) => a.id === id)?.name ?? id).join(", ") || "None";
    const reserves = reserveStatus(proposedHoldings, accounts);
    // An approved action on an account outside the scope changes household context, not the scoped figures.
    const actionAccount = (r: Recommendation) => r.destination?.accountId ?? holdings.find((h) => h.id === r.relatedHoldingId)?.accountId ?? r.relatedAccountId;
    const notApplied = (r: Recommendation) =>
      proposed.blocked.find((b) => b.recommendationIds.includes(r.id))?.reason ??
      (unconverted.some((u) => u.recommendationId === r.id) ? "Not applied: exchange rate missing" : null) ??
      (inScope && actionAccount(r) && !inScope.has(actionAccount(r)!) ? "Applied outside the investment scope (household context; not in the scoped figures)" : null);
    const money = (v: number | null) => (v == null ? `Not valued in ${reportingCurrency}` : formatCurrency(v, reportingCurrency, { compact: true }));
    const passed = snap.readiness.filter((c) => c.passed).length;
    pages.push(
      <PageWrap key="package" title="Reviewed Package" eyebrow="00">
        <p className="pdf-text">{snapshotMarker(snap, props.timeZone)}</p>
        <div className="pdf-grid-2" style={{ marginTop: 10 }}>
          <div className="pdf-card">
            <div className="pdf-stat-label">Approved version</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Version</dt><dd>{snap.version}</dd>
              <dt>Approved</dt><dd>{formatDateTime(snap.approvedAt, { timeZone: props.timeZone })}</dd>
              <dt>Approved by</dt><dd>{snap.approvedBy.name || "—"}</dd>
              {snap.note && (<><dt>Note</dt><dd>{snap.note}</dd></>)}
              <dt>Fingerprint</dt><dd>{snap.fingerprint}</dd>
            </dl>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Scope and basis</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Alternative</dt><dd>{snap.alternativeName}</dd>
              <dt>Scope</dt><dd>{scopeNames}</dd>
              <dt>Model</dt><dd>{pinnedModel ? `${pinnedModel.name} (rev ${pinnedModel.revision})` : props.modelPin ? `${props.modelPin.id} (rev ${props.modelPin.revision})` : "None pinned"}</dd>
              <dt>Values</dt><dd>{snap.inputBasis.values.length} accepted value{snap.inputBasis.values.length === 1 ? "" : "s"} in {snap.inputBasis.reportingCurrency}; input basis {snap.inputBasis.fingerprint}</dd>
              <dt>Exchange rates</dt>
              <dd>{snap.inputBasis.rates.length === 0 ? "None used" : snap.inputBasis.rates.map((r) => `${r.base}/${r.quote} ${r.rate} (${r.source}, ${utcDate(r.asOf)})`).join("; ")}</dd>
            </dl>
          </div>
        </div>
        {desk && (
          <>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "18pt 0 6pt" }}>Investment scope and household context</h3>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Account or line</th>
                  <th className="right">Current value</th>
                  <th>Role in this document</th>
                </tr>
              </thead>
              <tbody>
                {desk.scope.accounts.map((a) => (
                  <tr key={`s_${a.id}`}>
                    <td>{a.name}</td>
                    <td className="right">{money(a.current)}</td>
                    <td>Investment scope: in every allocation, exposure, cost and income figure</td>
                  </tr>
                ))}
                {desk.context.accounts.map((a) => (
                  <tr key={`c_${a.id}`}>
                    <td>{a.name}</td>
                    <td className="right">{money(a.value)}</td>
                    <td>Household context outside the investment scope</td>
                  </tr>
                ))}
                {desk.liabilities.lines.map((l) => (
                  <tr key={`l_${l.id}`}>
                    <td>{l.name}</td>
                    <td className="right">{money(l.value)}</td>
                    <td>Liability ({l.accountName}): household context</td>
                  </tr>
                ))}
                {desk.unvaluedOutside.filter((u) => !u.liability).map((u) => (
                  <tr key={`u_${u.id}`}>
                    <td>{u.name}</td>
                    <td className="right">{money(null)}</td>
                    <td>Household context ({u.accountName}); left out of the context total</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pdf-text" style={{ marginTop: 8 }}>
              Household context outside the investment scope: {money(desk.context.total)} of other assets and {money(desk.liabilities.total)} of liabilities (valued items only). They are shown for context and are not included in any allocation weight, exposure, cost or income figure in this document. Readiness, valuation and exchange-rate checks cover the whole household.
            </p>
          </>
        )}
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "18pt 0 6pt" }}>Approved actions, in order</h3>
        {proposedRecs.length === 0 ? (
          <p className="pdf-text">No approved actions.</p>
        ) : (
          <table className="pdf-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Action</th>
                <th>Amount</th>
                <th>Effect</th>
                <th>Prose in document</th>
              </tr>
            </thead>
            <tbody>
              {proposedRecs.map((r, idx) => (
                <tr key={r.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div>{r.title}</div>
                    <div className="pdf-source-tag">{r.rationale}</div>
                  </td>
                  <td>{describeAmounts(r, fx) ?? (r.actionAmount != null ? (r.actionAmountUnit === "percent" ? `${r.actionAmount}%` : formatCurrency(r.actionAmount, r.currency)) : "Advisory (no amount)")}</td>
                  <td>{notApplied(r) ?? "Applied"}</td>
                  <td>{r.includeInPdf ? "Included" : "Not included (listed here only)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "18pt 0 6pt" }}>Funding and reserves</h3>
        {reserves.length === 0 ? (
          <p className="pdf-text">No account has an eligible-cash rule.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: "9.5pt", lineHeight: 1.6 }}>
            {reserves.map((r) => (
              <li key={r.accountId}>
                {r.accountName}: eligible cash {r.cashName ?? r.cashHoldingId}, reserve {r.reserveCurrency ? formatCurrency(r.reserve, r.reserveCurrency) : `${r.reserve} (currency unknown)`};
                {" "}after the approved actions {r.available == null || !r.currency ? "unknown" : formatCurrency(r.available, r.currency)}{r.breached ? " (below the reserve)" : ""}.
              </li>
            ))}
          </ul>
        )}
        <p className="pdf-text" style={{ marginTop: 10 }}>
          Readiness at approval: {passed} of {snap.readiness.length} checks passed{passed === snap.readiness.length ? "." : `; not passed: ${snap.readiness.filter((c) => !c.passed).map((c) => c.label).join("; ")}.`}
        </p>
        <p className="pdf-text">
          This version is a local Atlas record: later edits to the workspace or library don&apos;t change it, and a changed proposal needs a new approved version. It is not a tamper-proof record, and it records no client acknowledgement or implementation.
        </p>
      </PageWrap>
    );
  }

  // ---------- EXECUTIVE SUMMARY ----------
  if (enabled("executive_summary")) {
    pages.push(
      <PageWrap key="exec" title="Executive Summary" eyebrow="01">
        {proposal.notes && (
          <div className="pdf-summary-box">{proposal.notes}</div>
        )}
        {unvaluedNote && (
          <div className="pdf-card pdf-avoid-break" style={{ marginBottom: 14, borderColor: "#9B2C2C" }}>
            <div className="pdf-stat-label" style={{ color: "#7A2222" }}>Valuation incomplete: {coverageLabel(nw)}</div>
            <p className="pdf-text" style={{ marginTop: 6 }}>
              {unvaluedNote} Totals, charts and percentages in this proposal cover valued holdings only, and no portfolio-wide
              conclusions are drawn until every holding is valued.
            </p>
          </div>
        )}
        <div className="pdf-grid-4" style={{ marginBottom: 18 }}>
          <Stat label={`${netWorthLabel}${valuedOnly}`} value={formatTotal(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
          <Stat label={`${investibleLabel}${valuedOnly}`} value={formatTotal(investibleTotal, reportingCurrency, { compact: true })} hint={nw.complete ? `${investible.length} holdings` : `${investibleTotal.valuedCount} of ${investible.length} holdings valued`} />
          <Stat label={liabilitiesTitle} value={liabilitiesLabel} hint="Mortgage, debt" />
          <Stat label="Data Quality Score" value={`${dq}`} hint={`${approvedRecs.length} advisor recs included`} />
        </div>
        <div className="pdf-grid-2">
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Asset Class{scopeTag}{valuedOnly}</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={allocClass.slice(0, 6)} currency={reportingCurrency} />
            </div>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Currency{scopeTag}{valuedOnly}</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={allocCurrency.slice(0, 6)} currency={reportingCurrency} />
            </div>
          </div>
        </div>

        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "22pt 0 8pt" }}>Key Findings</h3>
        <ul style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.6 }}>
          <li>
            Reporting currency for this proposal is <strong>{reportingCurrency}</strong>;{" "}
            {fxSources ? `FX conversion uses ${fxSources}.` : noConversion ? "no currency conversion was needed." : "no usable exchange rate is stored for the conversion needed."}
          </li>
          <li>Values used: {describeBasisCounts(basisCounts)}. Each value&apos;s source and recorded date are listed under {titleOf("market_data_sources")}.</li>
          {valueDates && <li>{valueDates}</li>}
          {stale > 0 && <li>{stale} holding(s) have values labelled out of date; update or review them before finalization.</li>}
          {mockCount > 0 && <li>{mockCount} holding(s) currently use mock/fallback values — review before final delivery.</li>}
          <li>{approvedRecs.length} advisor-approved recommendation(s) are included in this proposal.</li>
        </ul>
      </PageWrap>
    );
  }

  // ---------- CLIENT PROFILE ----------
  if (enabled("client_profile")) {
    pages.push(
      <PageWrap key="profile" title="Client Profile" eyebrow="02">
        <div className="pdf-grid-2">
          <div className="pdf-card">
            <div className="pdf-stat-label">Client</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Full name</dt><dd>{client.fullName}</dd>
              <dt>Household</dt><dd>{client.householdName ?? "—"}</dd>
              <dt>Country of residence</dt><dd>{client.countryOfResidence}</dd>
              <dt>Tax residency</dt><dd>{client.taxResidency}</dd>
              <dt>Base currency</dt><dd>{client.baseCurrency}</dd>
              <dt>Reporting currency</dt><dd>{client.proposalOutputCurrency}</dd>
              <dt>Risk tolerance</dt><dd style={{ textTransform: "capitalize" }}>{client.riskTolerance}</dd>
              <dt>Time horizon</dt><dd>{client.timeHorizonYears} years</dd>
              <dt>Liquidity needs</dt><dd style={{ textTransform: "capitalize" }}>{client.liquidityNeeds}</dd>
              <dt>Income needs</dt><dd style={{ textTransform: "capitalize" }}>{client.incomeNeeds}</dd>
              <dt>Tax sensitivity</dt><dd style={{ textTransform: "capitalize" }}>{client.taxSensitivity}</dd>
            </dl>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Advisor of Record</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Advisor</dt><dd>{advisor.name}</dd>
              <dt>Firm</dt><dd>{advisor.firmName}</dd>
              <dt>Email</dt><dd>{advisor.email}</dd>
              {advisor.phone && (<><dt>Phone</dt><dd>{advisor.phone}</dd></>)}
              {advisor.jurisdictions && advisor.jurisdictions.length > 0 && (<><dt>Jurisdictions</dt><dd>{advisor.jurisdictions.join(", ")}</dd></>)}
            </dl>
          </div>
        </div>
        {client.investmentObjective && (
          <>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "22pt 0 6pt" }}>Investment Objective</h3>
            <p className="pdf-text">{client.investmentObjective}</p>
          </>
        )}
        {client.specialInstructions && (
          <>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "16pt 0 6pt" }}>Special Instructions</h3>
            <p className="pdf-text">{client.specialInstructions}</p>
          </>
        )}
      </PageWrap>
    );
  }

  // ---------- CURRENT PORTFOLIO ----------
  if (enabled("current_portfolio")) {
    pages.push(
      <PageWrap key="current" title="Current Portfolio" eyebrow="03">
        <div className="pdf-grid-3" style={{ marginBottom: 14 }}>
          <Stat label={`${investibleLabel}${valuedOnly}`} value={formatTotal(investibleTotal, reportingCurrency, { compact: true })} hint={`${investible.length} holdings · ${desk ? `${desk.scope.accountIds.length} of ${accounts.length}` : accounts.length} accounts`} />
          <Stat label={liabilitiesTitle} value={liabilitiesLabel} hint="On schedule" />
          <Stat label={`${netWorthLabel}${valuedOnly}`} value={formatTotal(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
        </div>
        <div className="pdf-grid-2">
          <div>
            <div className="pdf-section-eyebrow"><span className="pdf-eyebrow">By Asset Class{scopeTag}</span></div>
            <AllocationList rows={allocClass} currency={reportingCurrency} />
          </div>
          <div>
            <div className="pdf-section-eyebrow"><span className="pdf-eyebrow">By Country{scopeTag}</span></div>
            <AllocationList rows={allocCountry} currency={reportingCurrency} />
          </div>
        </div>
      </PageWrap>
    );
  }

  // ---------- PROPOSED PORTFOLIO ----------
  if (enabled("proposed_portfolio")) {
    pages.push(
      <PageWrap key="proposed" title="Proposed Portfolio" eyebrow="04">
        <p className="pdf-text">
          The proposed portfolio reflects the advisor-approved recommendations included in this document. Values shown apply the proposed action amounts to the corresponding current positions; all other holdings are presented unchanged. Implementation timing, tax considerations, and execution remain at the advisor's discretion.
        </p>
        {sleeveNames.length > 0 && (
          <p className="pdf-text">
            Includes {sleeveNames.length} proposed manager/strategy sleeve{sleeveNames.length === 1 ? "" : "s"} ({sleeveNames.join("; ")}). In the allocation charts each is shown at its proposed balance as Other / unclassified; its look-through exposure, where a mix was supplied, and its target, funding, minimum and fees are under Manager and Strategy Sleeves. Manager, strategy, minimum and fee details are advisor-entered and are not a verified offering, appointment or eligibility determination.
          </p>
        )}
        <div className="pdf-grid-2" style={{ marginTop: 12 }}>
          <div className="pdf-card">
            <div className="pdf-stat-label">Recommendations included</div>
            <div className="pdf-stat-value">{approvedRecs.length}</div>
            <div className="pdf-stat-hint">Approved for client deliverable</div>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Pending advisor review</div>
            <div className="pdf-stat-value">{remainingRecs.length}</div>
            <div className="pdf-stat-hint">Marked for inclusion but not yet approved</div>
          </div>
        </div>
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "22pt 0 6pt" }}>Implementation considerations</h3>
        <ul style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.6 }}>
          <li>Coordinate trade execution with custodian-specific fee, tax-lot, and settlement constraints.</li>
          <li>Where applicable, sequence taxable events to align with the household's tax-loss harvesting calendar.</li>
          <li>Confirm cross-border tax and reporting implications for non-US holdings.</li>
        </ul>
      </PageWrap>
    );
  }

  // ---------- MANAGER AND STRATEGY SLEEVES (D2a) ----------
  if (enabled("proposed_portfolio") && sleeveRows.length > 0) {
    pages.push(
      <PageWrap key="sleeves" title="Manager and Strategy Sleeves" eyebrow="04b">
        <p className="pdf-text">
          {pinnedModel
            ? `Pinned model: ${pinnedModel.name} (rev ${pinnedModel.revision}). Targets are the model's weights on the account's value before any action; funded amounts are what the approved actions commit.`
            : "No model is pinned, so no sleeve has a model target; funded amounts are what the approved actions commit."}{" "}
          Amounts are in each sleeve&apos;s own currency.
        </p>
        <table className="pdf-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Sleeve</th>
              <th className="right">Target</th>
              <th className="right">Funded</th>
              <th>Minimum</th>
              <th>Fees (supplied)</th>
            </tr>
          </thead>
          <tbody>
            {sleeveRows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div>{r.label}</div>
                  <div className="pdf-source-tag">{r.account}</div>
                </td>
                <td className="right">{r.target ? `${formatCurrency(r.target.amount, r.currency)} (${formatPercent(r.target.weight, 1)})` : "No model target"}</td>
                <td className="right">{r.blocked ? `Not funded: ${r.blocked}` : formatCurrency(r.funded, r.currency)}</td>
                <td>
                  {r.minimum.kind === "met"
                    ? `Met (${formatCurrency(r.minimum.minimum, r.currency)})`
                    : r.minimum.kind === "below"
                    ? `Below (${formatCurrency(r.minimum.minimum, r.currency)})`
                    : r.review
                    ? `Not supplied; advisor review recorded: ${r.review}`
                    : "Not supplied; not reviewed"}
                </td>
                <td>{r.fees}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "18pt 0 6pt" }}>Look-through exposure of the proposed assets{scopeTag}</h3>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Asset class</th>
              <th className="right">Share</th>
              <th className="right">{reportingCurrency}</th>
            </tr>
          </thead>
          <tbody>
            {exposure.rows.map((r) => (
              <tr key={r.assetClass}>
                <td>{ASSET_CLASS_LABELS[r.assetClass] ?? r.assetClass}</td>
                <td className="right">{formatPercent(r.pct, 1)}</td>
                <td className="right">{formatCurrency(r.value, reportingCurrency, { compact: true })}</td>
              </tr>
            ))}
            {exposure.unknown.value > 0 && (
              <tr>
                <td>Unknown ({exposure.unknown.sleeves} sleeve{exposure.unknown.sleeves === 1 ? "" : "s"} with no supplied mix)</td>
                <td className="right">{formatPercent(exposure.unknown.pct, 1)}</td>
                <td className="right">{formatCurrency(exposure.unknown.value, reportingCurrency, { compact: true })}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="pdf-text" style={{ marginTop: 8 }}>
          Coverage: {formatPercent(100 - exposure.unknown.pct, 1)} of the proposed {desk ? "investment-scope " : ""}value has a known asset class (direct holdings, or a sleeve&apos;s supplied mix); the rest is shown as Unknown and is not spread across the known classes. Mixes are advisor-entered as of their stated dates, not verified holdings, and fees are listed as supplied, not added together or compared.
        </p>
      </PageWrap>
    );
  }

  // ---------- RECOMMENDATIONS ----------
  if (enabled("recommendations")) {
    pages.push(
      <PageWrap key="recs" title="Advisor Recommendations" eyebrow="05">
        {approvedRecs.length === 0 && (
          <p className="pdf-text">No advisor-approved recommendations are included in this proposal.</p>
        )}
        {approvedRecs.map((r, idx) => (
          <div className="pdf-rec" key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h4>{idx + 1}. {r.title}</h4>
              <span className={`pdf-pill ${r.priority === "high" ? "warn" : r.priority === "medium" ? "navy" : "neutral"}`}>{r.priority} priority</span>
            </div>
            <p className="pdf-text">{r.rationale}</p>
            {/* Entered in another currency: the amount, its converted value and the rate used. */}
            {(() => {
              const amounts = describeAmounts(r, fx);
              return amounts ? <p className="pdf-text" style={{ marginTop: 4 }}>Amount: {amounts}.</p> : null;
            })()}
            <div className="pdf-grid-3" style={{ marginTop: 6 }}>
              {r.clientBenefit && <KvBlock label="Client benefit" value={r.clientBenefit} />}
              {r.riskTradeoff && <KvBlock label="Risk / tradeoff" value={r.riskTradeoff} />}
              {r.taxNote && <KvBlock label="Tax note" value={r.taxNote} />}
            </div>
            <div className="meta">
              <span className="pdf-pill navy">{r.type.replace(/_/g, " ")}</span>
              <span style={{ marginLeft: 8 }}>Approved by advisor on {formatTimestampDate(r.updatedAt, { timeZone: props.timeZone, month: "numeric" })}</span>
            </div>
          </div>
        ))}
      </PageWrap>
    );
  }

  // ---------- BEFORE / AFTER ALLOCATION ----------
  if (enabled("before_after_allocation")) {
    const proposedTotal = valuationTotal(scopeProposed.filter((h) => !h.isLiability));
    // Compute per-asset-class percentage-point shifts between current and proposed.
    const currentByLabel = new Map(allocClass.map((s) => [s.label, s.pct]));
    const proposedByLabel = new Map(allocProposedClass.map((s) => [s.label, s.pct]));
    const allLabels = new Set<string>([...currentByLabel.keys(), ...proposedByLabel.keys()]);
    const deltas = Array.from(allLabels)
      .map((label) => {
        const cur = currentByLabel.get(label) ?? 0;
        const prop = proposedByLabel.get(label) ?? 0;
        return { label, current: cur, proposed: prop, delta: prop - cur };
      })
      .filter((d) => Math.abs(d.delta) >= 0.05) // ignore sub-5bps noise
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    pages.push(
      <PageWrap key="ba" title="Before / After Allocation" eyebrow="06">
        <p className="pdf-text">
          <strong>Before</strong> is the portfolio today; <strong>After</strong> is the portfolio once the recommendations in
          this proposal are carried out. Line-by-line changes appear in the Recommendations section.
        </p>
        <div className="pdf-grid-2" style={{ marginTop: 12 }}>
          <div className="pdf-card pdf-avoid-break">
            <div className="pdf-ba-head">
              <span className="pdf-ba-tag">Before</span>
              <span className="pdf-ba-title">Current portfolio{scopeTag}</span>
            </div>
            <div className="pdf-stat-value" style={{ fontSize: "16pt", marginTop: 2 }}>
              {formatTotal(investibleTotal, reportingCurrency, { compact: true })}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 10 }}>
              <PdfPieChart data={allocClass} size={148} />
              <div style={{ flex: 1 }}>
                <PdfPieLegend data={allocClass} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <AllocationList rows={allocClass} currency={reportingCurrency} />
            </div>
          </div>
          <div className="pdf-card pdf-avoid-break">
            <div className="pdf-ba-head after">
              <span className="pdf-ba-tag">After</span>
              <span className="pdf-ba-title">Proposed portfolio{scopeTag}</span>
            </div>
            <div className="pdf-stat-value" style={{ fontSize: "16pt", marginTop: 2 }}>
              {formatTotal(proposedTotal, reportingCurrency, { compact: true })}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 10 }}>
              {/* PdfPieChart skips non-positive slices; an unfunded purchase is called out below instead. */}
              <PdfPieChart data={allocProposedClassOrdered} size={148} />
              <div style={{ flex: 1 }}>
                <PdfPieLegend data={allocProposedClassOrdered} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <AllocationList rows={allocProposedClassOrdered} currency={reportingCurrency} />
            </div>
            <div className="pdf-stat-hint" style={{ marginTop: 8 }}>
              {(() => {
                const notApplied = new Set(unconverted.map((u) => u.recommendationId)).size;
                const applied = proposedRecs.length - notApplied;
                const skipped = notApplied > 0 ? ` ${notApplied} not applied: exchange rate missing (see below).` : "";
                if (proposedRecs.length === 0) return "Approve a recommendation with a linked holding to see its effect on the proposed allocation.";
                if (applied === 0) return `No approved recommendation could be applied.${skipped}`;
                if (deltas.length > 0)
                  return `${applied} approved recommendation${applied === 1 ? "" : "s"} applied. Sales credit cash; purchases debit it.${skipped}`;
                return `Approved recommendations had no allocation impact (advisory-only or net-flat actions).${skipped}`;
              })()}
            </div>
          </div>
        </div>

        {unconverted.length > 0 && (
          <div className="pdf-card pdf-avoid-break" style={{ marginTop: 14, borderColor: "#9B2C2C" }}>
            <div className="pdf-stat-label" style={{ color: "#7A2222" }}>Proposed actions not applied</div>
            <p className="pdf-text" style={{ marginTop: 6 }}>
              {unconverted.length} approved recommendation{unconverted.length === 1 ? " is" : "s are"} not reflected in the
              proposed allocation because no exchange rate is available for{" "}
              {[...new Set(unconverted.map((u) => `${u.currency}/${u.reportingCurrency}`))].join(", ")}.
            </p>
          </div>
        )}

        {cashShortfalls.length > 0 && (
          <div className="pdf-card pdf-avoid-break" style={{ marginTop: 14, borderColor: "#9B2C2C" }}>
            <div className="pdf-stat-label" style={{ color: "#7A2222" }}>Unfunded proposed purchases</div>
            <p className="pdf-text" style={{ marginTop: 6 }}>
              Approved purchases exceed the cash available in{" "}
              {cashShortfalls
                .map((c) => `${c.accountName} (short ${formatCurrency(c.shortfall, reportingCurrency, { compact: true })})`)
                .join(", ")}
              . The proposed cash shown is negative until a funding source is added.
            </p>
          </div>
        )}

        {deltas.length > 0 && (
          <div className="pdf-card pdf-avoid-break" style={{ marginTop: 14 }}>
            <div className="pdf-stat-label">Top allocation shifts</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6pt", marginTop: 8 }}>
              {deltas.slice(0, 8).map((d) => {
                const positive = d.delta > 0;
                return (
                  <span
                    key={d.label}
                    className={`pdf-pill ${positive ? "pos" : "neg"}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    {positive ? "▲" : "▼"} {d.label} {positive ? "+" : "−"}{Math.abs(d.delta).toFixed(1)} pts
                  </span>
                );
              })}
            </div>
            <div className="pdf-stat-hint" style={{ marginTop: 6 }}>
              Percentage-point shift in asset-class weight from Before (current) to After (proposed).
            </div>
          </div>
        )}
      </PageWrap>
    );
  }

  // ---------- CURRENCY EXPOSURE ----------
  if (enabled("currency_exposure")) {
    pages.push(
      <PageWrap key="ccy" title="Currency Exposure" eyebrow="07">
        <div className="pdf-grid-2 pdf-avoid-break" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PdfPieChart data={allocCurrency} size={200} />
          </div>
          <div>
            <PdfPieLegend data={allocCurrency} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <AllocationList rows={allocCurrency} currency={reportingCurrency} />
        </div>
        <p className="pdf-text" style={{ marginTop: 14 }}>
          Currency exposure is computed from native-denominated holdings,{" "}
          {fxSources
            ? `converted to ${reportingCurrency} using ${fxSources}.`
            : noConversion
            ? `all already in ${reportingCurrency}, so no currency conversion was needed.`
            : `but no usable exchange rate is stored to convert them to ${reportingCurrency}.`}{" "}
          Hedging positions, if any, are presented separately in the appendix.{scopeNote}
        </p>
      </PageWrap>
    );
  }

  // ---------- COUNTRY EXPOSURE ----------
  if (enabled("country_exposure")) {
    pages.push(
      <PageWrap key="country" title="Country Exposure" eyebrow="08">
        <div className="pdf-grid-2 pdf-avoid-break" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PdfPieChart data={allocCountry} size={200} />
          </div>
          <div>
            <PdfPieLegend data={allocCountry} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <AllocationList rows={allocCountry} currency={reportingCurrency} />
        </div>
        <p className="pdf-text" style={{ marginTop: 14 }}>
          Country exposure reflects each holding's primary country of issuance, not the underlying revenue or operational footprint. Cross-border tax, reporting, and succession considerations may apply.{scopeNote}
        </p>
      </PageWrap>
    );
  }

  // ---------- RISK / LIQUIDITY / FEE / INCOME ----------
  if (enabled("risk_review") || enabled("liquidity") || enabled("fee_analysis") || enabled("income_analysis")) {
    const liqRows = summarize(investible, (h) => (h.liquidity ?? "unspecified").replace("_", " "));
    // Only supplied data counts: a holding without an expense ratio or yield
    // isn't treated as zero, and the coverage says how much is described.
    const costNow = costIncomeCoverage(scopeHoldings);
    const costProposed = costIncomeCoverage(scopeProposed);
    const pctText = (v: number) => formatPercent(v, 2);
    const moneyText = (v: number) => formatCurrency(v, reportingCurrency, { compact: true });
    pages.push(
      <PageWrap key="risk" title="Risk, Liquidity, Fees & Income" eyebrow="09">
        <div className="pdf-grid-2">
          <div>
            <div className="pdf-eyebrow">Liquidity Profile{scopeTag}{valuedOnly}</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={liqRows} currency={reportingCurrency} />
            </div>
          </div>
          <div>
            <div className="pdf-eyebrow">Headline Estimates</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Weighted expense ratio, current{scopeTag}</dt>
              <dd>{describeCoverage(costNow.expense, pctText)}</dd>
              <dt>Weighted expense ratio, proposed{scopeTag}</dt>
              <dd>{describeCoverage(costProposed.expense, pctText)}</dd>
              <dt>Estimated annual income, current{scopeTag}</dt>
              <dd>{describeCoverage(costNow.income, moneyText)}</dd>
              <dt>Estimated annual income, proposed{scopeTag}</dt>
              <dd>{describeCoverage(costProposed.income, moneyText)}</dd>
              <dt>Concentration risk count{scopeTag}</dt>
              <dd>{nw.complete ? valuedInvestible.filter((h) => reportingValue(h)! / Math.max(1, totalInvestible) > 0.08).length : "Not assessed (valuation incomplete)"}</dd>
              <dt>Manually valued holdings</dt>
              <dd>{manualCount}</dd>
            </dl>
          </div>
        </div>
        <p className="pdf-text" style={{ marginTop: 14 }}>
          Expense ratios and income use only the yields and expense ratios supplied for each holding, over the share of value stated; holdings without them are not counted as zero, and nothing is extrapolated to them. They are estimates, not realized cash flows, and no saving or forecast is derived.{scopeNote}{costProposed.sleevesExcluded > 0 ? ` The ${costProposed.sleevesExcluded} proposed manager/strategy sleeve${costProposed.sleevesExcluded === 1 ? " is" : "s are"} excluded: their supplied fees are listed under Manager and Strategy Sleeves and are not combined with holding expense ratios.` : ""}
        </p>
      </PageWrap>
    );
  }

  // ---------- TAX & IMPLEMENTATION ----------
  if (enabled("tax_considerations") || enabled("implementation")) {
    pages.push(
      <PageWrap key="tax" title="Tax Considerations & Implementation" eyebrow="10">
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "0 0 6pt" }}>Tax considerations</h3>
        <p className="pdf-text">
          No tax analysis is included in this proposal: it calculates no realized gains, tax costs or after-tax results. The advisor will coordinate implementation with the client's CPA and tax counsel. Items with potential tax impact include realization of capital gains in taxable accounts, asset location reviews between taxable and tax-advantaged accounts, and cross-border tax considerations for non-US holdings.
        </p>
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "18pt 0 6pt" }}>Implementation plan</h3>
        <ol style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.6 }}>
          <li>Advisor confirms engagement scope and obtains written client consent for each in-scope action.</li>
          <li>Trade tickets are placed by the advisor through the client's existing custodian relationships.</li>
          <li>Manually valued holdings are refreshed in coordination with sponsors and counsel.</li>
          <li>Cross-border items reviewed with the household's tax counsel prior to execution.</li>
          <li>Post-implementation reconciliation: 30, 60, 90 days; annual proposal refresh thereafter.</li>
        </ol>
      </PageWrap>
    );
  }

  // ---------- DATA SOURCES & QUALITY ----------
  if (enabled("data_sources")) {
    pages.push(
      <PageWrap key="data" title="Data Sources & Quality" eyebrow="11">
        <div className="pdf-grid-3" style={{ marginBottom: 14 }}>
          <Stat label="Data Quality Score" value={`${dq}`} hint="Portfolio aggregate" />
          <Stat label="Manually Valued" value={String(manualCount)} hint="Of total holdings" />
          <Stat label="Mock / Fallback" value={String(mockCount)} hint="Should be replaced before delivery" />
        </div>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Value used</th>
              <th>Recorded source</th>
              <th>Date</th>
              <th className="right">Review</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const v = provenance.get(h.id)!;
              return (
                <tr key={h.id}>
                  <td>{h.assetName}</td>
                  <td>{v.label}</td>
                  <td>{[v.detail, v.holdingSource && `holding shows ${v.holdingSource}`].filter(Boolean).join("; ") || "—"}</td>
                  <td>
                    {v.date ? formatCalendarDate(v.date) : "Not recorded"}
                    {v.approvedAt ? `; approved ${formatTimestampDate(v.approvedAt, { timeZone: props.timeZone })}` : ""}
                  </td>
                  <td className="right">{v.review}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- VALUATION SOURCES & DATES (key market_data_sources) ----------
  if (enabled("market_data_sources")) {
    pages.push(
      <PageWrap key="md" title={titleOf("market_data_sources")} eyebrow="12">
        <p className="pdf-text">
          Each value is the one used in this proposal: an advisor-approved value where one was locked, otherwise an advisor override, otherwise the holding&apos;s statement, advisor-entered or manual value. Atlas does not reprice securities from market data. A value carried over from an earlier market-data record is shown with the provider and date recorded at the time. Privately held, illiquid, or alternative investments are valued using advisor-entered or sponsor-reported figures.
        </p>
        {valueDates && <p className="pdf-text">{valueDates}</p>}
        <table className="pdf-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Holding</th>
              <th>Identifier</th>
              <th>Value basis</th>
              <th>Date</th>
              <th>Currency</th>
              <th className="right">Reporting value</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.assetName}</td>
                <td>{h.identifier?.value ?? "—"}</td>
                <td>{provenance.get(h.id)!.label}</td>
                <td>{provenance.get(h.id)!.date ? formatCalendarDate(provenance.get(h.id)!.date!) : "Not recorded"}</td>
                <td>{h.currency}</td>
                <td className="right">{reportingValue(h) == null ? `Not valued in ${reportingCurrency}` : formatCurrency(reportingValue(h), reportingCurrency, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- ASSUMPTIONS ----------
  if (enabled("assumptions")) {
    pages.push(
      <PageWrap key="assumptions" title="Assumptions" eyebrow="13">
        <ul style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.7 }}>
          <li>
            Reporting currency: <strong>{reportingCurrency}</strong>.{" "}
            {fxSources
              ? `Exchange rates used: ${fxSources}, each listed with its date below.`
              : noConversion
              ? "No currency conversion was needed."
              : "No usable exchange rate is stored for the conversion needed; the holdings affected are not valued."}
          </li>
          <li>Holding values are the statement, advisor-entered, override or approved values listed with their recorded dates under {titleOf("market_data_sources")}; they are not live market prices.</li>
          <li>Manually valued or sponsor-reported values are advisor estimates and may not represent realizable values.</li>
          <li>Income and expense ratio figures use only the advisor-entered yields and expense ratios supplied, with their coverage stated; missing values are not treated as zero.</li>
          <li>The proposal does not model trading costs, custodian fees, market impact, taxes, or after-tax outcomes unless explicitly stated.</li>
        </ul>
        <FxRatesUsed status={fxStatus} reportingCurrency={reportingCurrency} rates={fxRates} holdings={props.holdings} recommendations={recommendations} />
      </PageWrap>
    );
  }

  // ---------- DISCLOSURES ----------
  if (enabled("disclosures")) {
    pages.push(
      <PageWrap key="disclosures" title="Disclosures" eyebrow="14">
        {/* A version's disclosures are frozen with their text; the live preview shows the library's current text. */}
        {(snap ? disclosures : disclosures.map(currentDisclosure)).map((d) => (
          <div className="pdf-disclosure" key={d.id}>
            <h4>{d.title}</h4>
            <div>{resolveFirmPlaceholder(d.body, advisor)}</div>
          </div>
        ))}
      </PageWrap>
    );
  }

  // ---------- APPENDIX HOLDINGS ----------
  if (enabled("appendix_holdings")) {
    pages.push(
      <PageWrap key="apx_h" title="Appendix — Holdings" eyebrow="A1">
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Account</th>
              <th>Asset class</th>
              <th>Currency</th>
              <th className="right">Native value</th>
              <th className="right">{reportingCurrency}</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>
                  <div>{h.assetName}</div>
                  <div className="pdf-source-tag">{h.identifier?.value ?? "—"}</div>
                </td>
                <td>{accounts.find((a) => a.id === h.accountId)?.name ?? "—"}</td>
                <td>{ASSET_CLASS_LABELS[h.assetClass] ?? "—"}</td>
                <td>{h.currency}</td>
                <td className="right">{formatCurrency(h.nativeMarketValue, h.currency, { compact: true })}</td>
                <td className="right">{reportingValue(h) == null ? `Not valued in ${reportingCurrency}` : formatCurrency(reportingValue(h), reportingCurrency, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- APPENDIX ACCOUNTS ----------
  if (enabled("appendix_accounts")) {
    pages.push(
      <PageWrap key="apx_a" title="Appendix — Accounts" eyebrow="A2">
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th>Institution</th>
              <th>Country</th>
              <th>Currency</th>
              <th className="right">Holdings</th>
              <th className="right">Reporting value</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const items = holdings.filter((h) => h.accountId === a.id);
              const total = valuationTotal(items);
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                  <td>{a.institution ?? "—"}</td>
                  <td>{a.country ?? "—"}</td>
                  <td>{a.baseCurrency}</td>
                  <td className="right">{items.length}</td>
                  <td className="right">
                    {formatTotal(total, reportingCurrency, { compact: true })}
                    {total.status === "partial" && ` (${total.unvaluedCount} not valued)`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- APPENDIX: VALUATION & EXCHANGE-RATE SOURCES (key appendix_market_data) ----------
  if (enabled("appendix_market_data")) {
    pages.push(
      <PageWrap key="apx_m" title={titleOf("appendix_market_data")} eyebrow="A3">
        <p className="pdf-text">
          The sources of the values and exchange rates this proposal uses. Atlas does not use a security-price feed: values come from statements, advisor entry or advisor-approved values, and exchange rates are reference rates.
        </p>
        <table className="pdf-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Source</th>
              <th className="right">Count</th>
              <th>Recorded dates</th>
            </tr>
          </thead>
          <tbody>
            {basisBreakdown(holdings).map((r) => (
              <tr key={r.basis}>
                <td>{r.label}</td>
                <td className="right">{r.count}</td>
                <td>{describeDateRange(r.summary) || "Not recorded"}</td>
              </tr>
            ))}
            <tr>
              <td>Exchange rates</td>
              <td className="right">{fxStatus.inUse.length}</td>
              <td>
                {fxSources
                  ? `${fxSources}; each rate and its date are listed under Assumptions`
                  : noConversion
                  ? "No currency conversion was needed"
                  : "No usable exchange rate is stored for the conversion needed"}
              </td>
            </tr>
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- APPENDIX COMPLIANCE ----------
  if (enabled("appendix_compliance")) {
    pages.push(
      <PageWrap key="apx_c" title="Appendix — Compliance Checklist" eyebrow="A4">
        <ul style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.7 }}>
          <li>Advisor profile complete and on record.</li>
          <li>Client profile complete with risk tolerance, tax sensitivity, and time horizon.</li>
          <li>All holdings advisor-reviewed; manual valuations reviewed for staleness.</li>
          <li>Each value labeled with its source and recorded date.</li>
          <li>Required disclosures included.</li>
          <li>Recommendations reviewed and approved.</li>
        </ul>
      </PageWrap>
    );
  }

  return (
    <div className="pdf-document">
      {/* Accent is a validated #RRGGBB, so interpolating it into CSS is safe. */}
      {accent && <style>{`:root{--gold-500:${accent};--gold-300:${accentTint(accent)}}`}</style>}
      {pages}
    </div>
  );
}

// Wraps rendered body markup into a complete print-ready HTML document.
// Used by the server-side PDF generation route which feeds the result
// straight into Puppeteer's setContent().
export function buildPrintableHtml(props: ProposalPdfTemplateProps, body: string): string {
  const safe = (s: string) => s.replace(/[<>"]/g, "");
  return `<!doctype html>
<html lang="${safe(props.client.locale ?? "en")}">
<head>
<meta charset="utf-8"/>
<title>${safe(props.client.householdName ?? props.client.fullName)} — Wealth Proposal</title>
<meta name="author" content="${safe(props.advisor.name)}"/>
<style>${PDF_BASE_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="pdf-card">
      <div className="pdf-stat-label">{label}</div>
      <div className="pdf-stat-value">{value}</div>
      {hint && <div className="pdf-stat-hint">{hint}</div>}
    </div>
  );
}

function KvBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="pdf-eyebrow" style={{ fontSize: "7pt" }}>{label}</div>
      <div style={{ fontSize: "9pt", color: "var(--ink-700)", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function AllocationList({ rows, currency }: { rows: { label: string; value: number; pct: number }[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="pdf-allocation-row" key={r.label}>
          <div className="label">{r.label}</div>
          <div className="bar"><div className="bar-fill" style={{ width: `${(r.pct / max) * 100}%` }} /></div>
          <div className="pct">{formatPercent(r.pct, 1)}</div>
          <div className="val">{formatCurrency(r.value, currency, { compact: true })}</div>
        </div>
      ))}
    </div>
  );
}

// The exchange rates the proposal's figures actually use: each stored rate
// (in the orientation it's stored), its own date, source and age, any cross
// rates through USD, and the advisor's confirmation of rates older than the
// policy (#26). Rates that are stored but unused aren't listed.
function FxRatesUsed({
  status,
  reportingCurrency,
  rates,
  holdings,
  recommendations,
}: {
  status: FxFreshness;
  reportingCurrency: string;
  rates: FxRate[];
  holdings: Holding[];
  recommendations: Recommendation[];
}) {
  const rateText = (r: number) => (r >= 0.1 ? r.toFixed(4) : r.toPrecision(4));
  const crosses = [
    ...new Set([...holdings.map((h) => h.proposalApprovedValue?.currency ?? h.currency), ...recommendations.filter((r) => r.approvedByAdvisor).map((r) => r.currency)]),
  ]
    .filter((c) => c !== reportingCurrency)
    .map((c) => ({ from: c, r: resolveFxRate(rates, c, reportingCurrency) }))
    .filter((x) => x.r?.path === "cross");
  const c = status.confirmation;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="pdf-stat-label">Exchange rates used in this proposal</div>
      {status.inUse.length === 0 ? (
        <p className="pdf-text" style={{ marginTop: 6 }}>No currency conversion was needed: every value is already in {reportingCurrency}.</p>
      ) : (
        <table className="pdf-table" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th>Rate</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th>As of</th>
              <th>Source</th>
              <th>Age</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {status.inUse.map((l) => (
              <tr key={l.key}>
                <td>{l.base}/{l.quote}</td>
                <td style={{ textAlign: "right" }}>{rateText(l.rate)}</td>
                <td>{utcDate(l.asOf)}</td>
                <td>{l.source}</td>
                <td>{l.ageDays} day{l.ageDays === 1 ? "" : "s"}</td>
                <td>
                  {l.unverified ? "unverified (fallback data)" : l.stale ? "stale" : "current"}
                  {l.notInLastRefresh ? "; not in last refresh" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {crosses.map(({ from, r }) => (
        <p key={from} className="pdf-text" style={{ marginTop: 4 }}>
          {from} → {reportingCurrency} is a cross rate through USD ({r!.legs.map((leg) => `${leg.base}/${leg.quote}`).join(" and ")}).
        </p>
      ))}
      <p className="pdf-text" style={{ marginTop: 4 }}>
        Reference rates, not transaction rates. A rate is treated as current for {STALE_FX_DAYS} days after its date, an initial product policy rather than
        an industry or regulatory standard.
      </p>
      {status.attention.length > 0 &&
        (c.state === "valid" ? (
          <p className="pdf-text" style={{ marginTop: 4 }}>
            Rates older than {STALE_FX_DAYS} days ({c.record!.pairs.join(", ")}, oldest {c.record!.oldestRateDate}) were confirmed by the advisor on{" "}
            {utcMinute(c.record!.confirmedAt)}; the confirmation expires {utcMinute(c.expiresAt!)}.
          </p>
        ) : (
          <p className="pdf-text" style={{ marginTop: 4 }}>
            Not confirmed: {status.attention.map((l) => `${l.base}/${l.quote}`).join(", ")} {status.attention.length === 1 ? "is" : "are"} older than {STALE_FX_DAYS} days
            or unverified, and the advisor hasn&apos;t confirmed {status.attention.length === 1 ? "it" : "them"}
            {c.state === "expired" ? " (an earlier confirmation expired)" : c.state === "changed" ? " (an earlier confirmation no longer applies: the rates or their use changed)" : c.state === "invalid" ? " (the stored confirmation isn't valid)" : ""}.
          </p>
        ))}
    </div>
  );
}
