import * as React from "react";
import type {
  FxConfirmation,
  Account,
  AdvisorProfile,
  ClientProfile,
  Disclosure,
  Holding,
  Proposal,
  ProposalSection,
  Recommendation,
  FxRate,
} from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { PDF_BASE_CSS } from "../styles/pdfStyles";
import { formatCalendarDate, formatCurrency, formatPercent, formatTimestampDate } from "@/utils/formatting";
import { sumBy, groupBy } from "@/utils/numbers";
import { applyRecommendationsToProposed, cashShortfallsOf, sectionLabel } from "@/engines/proposalEngine";
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

  const nw = valuationSummary(holdings);
  // Partial or unavailable totals are labeled; charts describe valued holdings only.
  const valuedOnly = nw.complete ? "" : " (valued holdings only)";
  const unvaluedNote = describeUnvalued(nw, reportingCurrency);
  const allocClass = summarize(holdings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other");
  const allocCurrency = summarize(holdings, (h) => h.currency);
  const allocCountry = summarize(holdings, (h) => h.country ?? "Unknown");
  const investible = holdings.filter((h) => !h.isLiability);
  const investibleTotal = valuationTotal(investible);
  // Denominator for the valued subset's percentages (see `valuedOnly`).
  const totalInvestible = investibleTotal.value ?? 0;
  const valuedInvestible = investible.filter((h) => reportingValue(h) != null);
  const liabilitiesLabel = nw.liabilities.value == null ? "Unavailable" : formatCurrency(Math.abs(nw.liabilities.value), reportingCurrency, { compact: true });

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
  const noConversion = !fxSources && nw.complete && unconverted.length === 0;
  const allocProposedClass = summarize(proposedHoldings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other");

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
          <span>{advisor.firmName} · Prepared {today}</span>
          <span>{pageNumber(num)}</span>
        </div>
      </div>
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
          <Stat label={`Net Worth${valuedOnly}`} value={formatTotal(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
          <Stat label={`Investible Assets${valuedOnly}`} value={formatTotal(investibleTotal, reportingCurrency, { compact: true })} hint={nw.complete ? `${investible.length} holdings` : `${investibleTotal.valuedCount} of ${investible.length} holdings valued`} />
          <Stat label="Liabilities" value={liabilitiesLabel} hint="Mortgage, debt" />
          <Stat label="Data Quality Score" value={`${dq}`} hint={`${approvedRecs.length} advisor recs included`} />
        </div>
        <div className="pdf-grid-2">
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Asset Class{valuedOnly}</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={allocClass.slice(0, 6)} currency={reportingCurrency} />
            </div>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Currency{valuedOnly}</div>
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
          <Stat label={`Investible Assets${valuedOnly}`} value={formatTotal(investibleTotal, reportingCurrency, { compact: true })} hint={`${investible.length} holdings · ${accounts.length} accounts`} />
          <Stat label="Liabilities" value={liabilitiesLabel} hint="On schedule" />
          <Stat label={`Net Worth${valuedOnly}`} value={formatTotal(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
        </div>
        <div className="pdf-grid-2">
          <div>
            <div className="pdf-section-eyebrow"><span className="pdf-eyebrow">By Asset Class</span></div>
            <AllocationList rows={allocClass} currency={reportingCurrency} />
          </div>
          <div>
            <div className="pdf-section-eyebrow"><span className="pdf-eyebrow">By Country</span></div>
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
    const proposedTotal = valuationTotal(proposedHoldings.filter((h) => !h.isLiability));
    const currentTotal = totalInvestible;
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
              <span className="pdf-ba-title">Current portfolio</span>
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
              <span className="pdf-ba-title">Proposed portfolio</span>
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
          Hedging positions, if any, are presented separately in the appendix.
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
          Country exposure reflects each holding's primary country of issuance, not the underlying revenue or operational footprint. Cross-border tax, reporting, and succession considerations may apply.
        </p>
      </PageWrap>
    );
  }

  // ---------- RISK / LIQUIDITY / FEE / INCOME ----------
  if (enabled("risk_review") || enabled("liquidity") || enabled("fee_analysis") || enabled("income_analysis")) {
    const liqRows = summarize(investible, (h) => (h.liquidity ?? "unspecified").replace("_", " "));
    const expenseRatioWeighted = totalInvestible > 0
      ? sumBy(valuedInvestible, (h) => ((h.expenseRatioPct ?? 0) / 100) * reportingValue(h)!) / totalInvestible
      : 0;
    const incomeWeighted = totalInvestible > 0
      ? sumBy(valuedInvestible, (h) => ((h.incomeYieldPct ?? 0) / 100) * reportingValue(h)!)
      : 0;
    pages.push(
      <PageWrap key="risk" title="Risk, Liquidity, Fees & Income" eyebrow="09">
        <div className="pdf-grid-2">
          <div>
            <div className="pdf-eyebrow">Liquidity Profile{valuedOnly}</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={liqRows} currency={reportingCurrency} />
            </div>
          </div>
          <div>
            <div className="pdf-eyebrow">Headline Estimates</div>
            <dl className="pdf-kv" style={{ marginTop: 8 }}>
              <dt>Estimated weighted expense ratio</dt>
              <dd>{formatPercent(expenseRatioWeighted * 100, 2)}</dd>
              <dt>Estimated annual income</dt>
              <dd>{formatCurrency(incomeWeighted, reportingCurrency, { compact: true })}</dd>
              <dt>Concentration risk count</dt>
              <dd>{nw.complete ? valuedInvestible.filter((h) => reportingValue(h)! / Math.max(1, totalInvestible) > 0.08).length : "Not assessed (valuation incomplete)"}</dd>
              <dt>Manually valued holdings</dt>
              <dd>{manualCount}</dd>
            </dl>
          </div>
        </div>
        <p className="pdf-text" style={{ marginTop: 14 }}>
          Income and expense estimates are derived from advisor-entered yields and expense ratios where available. They are estimates only and do not reflect actual realized cash flows.
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
          The advisor will coordinate implementation with the client's CPA and tax counsel. Items with potential tax impact include realization of capital gains in taxable accounts, asset location reviews between taxable and tax-advantaged accounts, and cross-border tax considerations for non-US holdings.
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
                    {v.approvedOn ? `; approved ${formatCalendarDate(v.approvedOn)}` : ""}
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
          <li>Income and expense ratio figures are estimates derived from advisor-entered fields where available.</li>
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
        {disclosures.map(currentDisclosure).map((d) => (
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
