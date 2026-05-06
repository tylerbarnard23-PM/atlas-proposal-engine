import * as React from "react";
import type {
  Account,
  AdvisorProfile,
  ClientProfile,
  Disclosure,
  Holding,
  Proposal,
  ProposalSection,
  Recommendation,
} from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { PDF_BASE_CSS } from "../styles/pdfStyles";
import { formatCurrency, formatDate, formatPercent } from "@/utils/formatting";
import { sumBy, groupBy } from "@/utils/numbers";
import { applyRecommendationsToProposed, netWorth } from "@/engines/proposalEngine";
import { dataQualityScore } from "@/engines/dataQualityEngine";

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
function PdfPieChart({ data, size = 168 }: { data: AllocationSlice[]; size?: number }) {
  const slices = data.filter((d) => d.value > 0);
  if (slices.length === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 1;
  const total = slices.reduce((a, s) => a + s.value, 0);

  // 100% in a single slice can't be drawn as one arc path — render a circle.
  if (slices.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill={PIE_PALETTE[0]} stroke="#fff" strokeWidth={1.5} />
      </svg>
    );
  }

  let cursor = -Math.PI / 2; // start at 12 o'clock
  const paths = slices.map((slice, i) => {
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
    return <path key={`${slice.label}-${i}`} d={d} fill={PIE_PALETTE[i % PIE_PALETTE.length]} stroke="#fff" strokeWidth={1.25} />;
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
  variant: "draft" | "final";
}

function summarize(holdings: Holding[], group: (h: Holding) => string) {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    if (h.isLiability) continue;
    const key = group(h);
    totals.set(key, (totals.get(key) ?? 0) + (h.reportingMarketValue ?? h.nativeMarketValue));
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
  const { client, advisor, accounts, holdings, recommendations, sections, disclosures, proposal, variant } = props;
  const reportingCurrency = proposal.outputCurrency;
  const today = new Date().toLocaleDateString(client.locale ?? "en-US", { year: "numeric", month: "long", day: "numeric" });
  const isDraft = variant === "draft";

  const enabled = (key: string) => sections.find((s) => s.key === key)?.enabled !== false;
  const approvedRecs = recommendations.filter((r) => r.approvedByAdvisor && r.includeInPdf);
  const remainingRecs = recommendations.filter((r) => !r.approvedByAdvisor && r.includeInPdf);

  const nw = netWorth(holdings);
  const allocClass = summarize(holdings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other");
  const allocCurrency = summarize(holdings, (h) => h.currency);
  const allocCountry = summarize(holdings, (h) => h.country ?? "Unknown");
  const investible = holdings.filter((h) => !h.isLiability);
  const totalInvestible = sumBy(investible, (h) => h.reportingMarketValue ?? h.nativeMarketValue);

  // Proposed allocation reflects approved recommendations that specify a
  // proposedValue. Recommendations without a proposedValue leave the
  // corresponding holding unchanged in the proposed view.
  const proposedHoldings = applyRecommendationsToProposed(holdings, approvedRecs);
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
  const manualCount = holdings.filter((h) => h.valuationSource.kind === "manual_valuation").length;
  const enrichedCount = holdings.filter((h) => h.marketDataSource).length;

  let pageIdx = 1;
  const pages: React.ReactNode[] = [];

  // ---------- COVER ----------
  pages.push(
    <div className="pdf-cover" key="cover">
      <div>
        <div className="pdf-cover-eyebrow">Confidential Wealth Proposal</div>
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
          This proposal is prepared by {advisor.firmName} for the named client and household. It is advisor-led, advisor-reviewed, and advisor-approved. It does not constitute tax, legal, or accounting advice. All values, sources, and assumptions are disclosed in the body of this document.
        </div>
        <div className="pdf-cover-meta" style={{ marginTop: "0.35in" }}>
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
        {isDraft && <div className="pdf-watermark">DRAFT</div>}
        <div className="pdf-headerline">
          <div className="left">
            {eyebrow && <span className="pdf-eyebrow" style={{ marginRight: 12 }}>{eyebrow}</span>}
            {title}
          </div>
          <div className="right">{client.householdName ?? client.fullName}</div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
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
        <div className="pdf-grid-4" style={{ marginBottom: 18 }}>
          <Stat label="Net Worth" value={formatCurrency(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
          <Stat label="Investible Assets" value={formatCurrency(totalInvestible, reportingCurrency, { compact: true })} hint={`${investible.length} holdings`} />
          <Stat label="Liabilities" value={formatCurrency(nw.liabilities, reportingCurrency, { compact: true })} hint="Mortgage, debt" />
          <Stat label="Data Quality Score" value={`${dq}`} hint={`${approvedRecs.length} advisor recs included`} />
        </div>
        <div className="pdf-grid-2">
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Asset Class</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={allocClass.slice(0, 6)} currency={reportingCurrency} />
            </div>
          </div>
          <div className="pdf-card">
            <div className="pdf-stat-label">Allocation by Currency</div>
            <div style={{ marginTop: 8 }}>
              <AllocationList rows={allocCurrency.slice(0, 6)} currency={reportingCurrency} />
            </div>
          </div>
        </div>

        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "13pt", margin: "22pt 0 8pt" }}>Key Findings</h3>
        <ul style={{ paddingLeft: 18, fontSize: "10pt", lineHeight: 1.6 }}>
          <li>Reporting currency for this proposal is <strong>{reportingCurrency}</strong>; FX conversion uses ECB reference rates.</li>
          <li>{enrichedCount} of {holdings.length} holdings have public market data references; {manualCount} are manually valued.</li>
          {stale > 0 && <li>{stale} holding(s) have stale price labels and should be refreshed before finalization.</li>}
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
          <Stat label="Investible Assets" value={formatCurrency(totalInvestible, reportingCurrency, { compact: true })} hint={`${investible.length} holdings · ${accounts.length} accounts`} />
          <Stat label="Liabilities" value={formatCurrency(nw.liabilities, reportingCurrency, { compact: true })} hint="On schedule" />
          <Stat label="Net Worth" value={formatCurrency(nw.net, reportingCurrency, { compact: true })} hint="Reporting currency" />
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
            <div className="pdf-grid-3" style={{ marginTop: 6 }}>
              {r.clientBenefit && <KvBlock label="Client benefit" value={r.clientBenefit} />}
              {r.riskTradeoff && <KvBlock label="Risk / tradeoff" value={r.riskTradeoff} />}
              {r.taxNote && <KvBlock label="Tax note" value={r.taxNote} />}
            </div>
            <div className="meta">
              <span className="pdf-pill navy">{r.type.replace(/_/g, " ")}</span>
              <span style={{ marginLeft: 8 }}>Approved by advisor on {new Date(r.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </PageWrap>
    );
  }

  // ---------- BEFORE / AFTER ALLOCATION ----------
  if (enabled("before_after_allocation")) {
    const proposedTotal = sumBy(proposedHoldings.filter((h) => !h.isLiability), (h) => h.reportingMarketValue ?? h.nativeMarketValue);
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
        <p className="pdf-text">High-level allocation comparison. Detailed line-by-line changes appear in the Recommendations section.</p>
        <div className="pdf-grid-2" style={{ marginTop: 12 }}>
          <div className="pdf-card pdf-avoid-break">
            <div className="pdf-stat-label">Current</div>
            <div className="pdf-stat-value" style={{ fontSize: "16pt", marginTop: 2 }}>
              {formatCurrency(currentTotal, reportingCurrency, { compact: true })}
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
            <div className="pdf-stat-label">Proposed</div>
            <div className="pdf-stat-value" style={{ fontSize: "16pt", marginTop: 2 }}>
              {formatCurrency(proposedTotal, reportingCurrency, { compact: true })}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 10 }}>
              <PdfPieChart data={allocProposedClassOrdered} size={148} />
              <div style={{ flex: 1 }}>
                <PdfPieLegend data={allocProposedClassOrdered} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <AllocationList rows={allocProposedClassOrdered} currency={reportingCurrency} />
            </div>
            <div className="pdf-stat-hint" style={{ marginTop: 8 }}>
              {approvedRecs.some((r) => r.proposedValue != null)
                ? "Approved recommendations applied where a proposed value was specified."
                : "No approved recommendations carried explicit proposed values; the proposed view mirrors current. Add proposed values to recommendations to see allocation shifts."}
            </div>
          </div>
        </div>

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
              Percentage-point shift in asset-class weight from Current to Proposed.
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
          Currency exposure is computed from native-denominated holdings, converted to {reportingCurrency} using ECB reference rates. Hedging positions, if any, are presented separately in the appendix.
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
    const liquidityGroups = groupBy(investible, (h) => h.liquidity ?? "unspecified");
    const liqRows = Object.entries(liquidityGroups).map(([k, items]) => {
      const v = sumBy(items, (h) => h.reportingMarketValue ?? h.nativeMarketValue);
      return { label: k.replace("_", " "), value: v, pct: totalInvestible > 0 ? (v / totalInvestible) * 100 : 0 };
    }).sort((a, b) => b.value - a.value);
    const expenseRatioWeighted = totalInvestible > 0
      ? sumBy(investible, (h) => ((h.expenseRatioPct ?? 0) / 100) * (h.reportingMarketValue ?? 0)) / totalInvestible
      : 0;
    const incomeWeighted = totalInvestible > 0
      ? sumBy(investible, (h) => ((h.incomeYieldPct ?? 0) / 100) * (h.reportingMarketValue ?? 0))
      : 0;
    pages.push(
      <PageWrap key="risk" title="Risk, Liquidity, Fees & Income" eyebrow="09">
        <div className="pdf-grid-2">
          <div>
            <div className="pdf-eyebrow">Liquidity Profile</div>
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
              <dd>{investible.filter((h) => (h.reportingMarketValue ?? 0) / Math.max(1, totalInvestible) > 0.08).length}</dd>
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
              <th>Source kind</th>
              <th>Provider</th>
              <th>As of</th>
              <th className="right">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.assetName}</td>
                <td>{h.valuationSource.kind.replace(/_/g, " ")}</td>
                <td>{h.valuationSource.providerName ?? "—"}</td>
                <td>{formatDate(h.valuationSource.asOf ?? h.valuationDate)}</td>
                <td className="right" style={{ textTransform: "capitalize" }}>{h.valuationSource.confidence ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- MARKET DATA & VALUATION SOURCES ----------
  if (enabled("market_data_sources")) {
    pages.push(
      <PageWrap key="md" title="Market Data & Valuation Sources" eyebrow="12">
        <p className="pdf-text">
          Public market quotes used in this proposal are obtained from third-party providers and may be delayed, end-of-day, reference rates, or fallback values. Each holding's quote type is shown below. Privately held, illiquid, or alternative investments are valued using advisor-entered or sponsor-reported figures.
        </p>
        <table className="pdf-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Holding</th>
              <th>Identifier</th>
              <th>Quote type</th>
              <th>Currency</th>
              <th className="right">Reporting value</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.assetName}</td>
                <td>{h.identifier?.value ?? "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{(h.quoteType ?? "manual").replace("_", " ")}</td>
                <td>{h.currency}</td>
                <td className="right">{formatCurrency(h.reportingMarketValue ?? h.nativeMarketValue, reportingCurrency, { compact: true })}</td>
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
          <li>Reporting currency: <strong>{reportingCurrency}</strong>. FX rates are ECB reference rates (sourced via Frankfurter where applicable).</li>
          <li>Public market values reflect end-of-day or delayed quotes from configured providers; quote type is disclosed per holding.</li>
          <li>Manually valued or sponsor-reported values are advisor estimates and may not represent realizable values.</li>
          <li>Income and expense ratio figures are estimates derived from advisor-entered fields where available.</li>
          <li>The proposal does not model trading costs, custodian fees, market impact, taxes, or after-tax outcomes unless explicitly stated.</li>
        </ul>
      </PageWrap>
    );
  }

  // ---------- DISCLOSURES ----------
  if (enabled("disclosures")) {
    pages.push(
      <PageWrap key="disclosures" title="Disclosures" eyebrow="14">
        {disclosures.map((d) => (
          <div className="pdf-disclosure" key={d.id}>
            <h4>{d.title}</h4>
            <div>{d.body}</div>
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
                <td className="right">{formatCurrency(h.reportingMarketValue ?? h.nativeMarketValue, reportingCurrency, { compact: true })}</td>
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
              const value = sumBy(items, (h) => h.reportingMarketValue ?? h.nativeMarketValue);
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                  <td>{a.institution ?? "—"}</td>
                  <td>{a.country ?? "—"}</td>
                  <td>{a.baseCurrency}</td>
                  <td className="right">{items.length}</td>
                  <td className="right">{formatCurrency(value, reportingCurrency, { compact: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PageWrap>
    );
  }

  // ---------- APPENDIX MARKET DATA SOURCES ----------
  if (enabled("appendix_market_data")) {
    pages.push(
      <PageWrap key="apx_m" title="Appendix — Market Data Sources" eyebrow="A3">
        <p className="pdf-text">
          Configured market data providers and the role each plays. API keys, where required, are stored on the server and never exposed to the client deliverable.
        </p>
        <table className="pdf-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Type</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ECB / Frankfurter</td><td>Official</td><td>FX reference rates for currency conversion</td></tr>
            <tr><td>Alpha Vantage</td><td>Aggregator</td><td>Equities, ETFs, FX, commodities (key required)</td></tr>
            <tr><td>Finnhub</td><td>Aggregator</td><td>Equity quotes and company profiles (key required)</td></tr>
            <tr><td>Twelve Data</td><td>Aggregator</td><td>Global symbols, equities, FX (key required)</td></tr>
            <tr><td>SEC EDGAR</td><td>Official</td><td>US-listed company facts and filings (no key)</td></tr>
            <tr><td>FRED</td><td>Official</td><td>Macroeconomic series (key required)</td></tr>
            <tr><td>CoinGecko</td><td>Aggregator</td><td>Crypto market prices (no key)</td></tr>
            <tr><td>Manual valuation</td><td>Manual</td><td>Private equity, real estate, business interests</td></tr>
            <tr><td>Mock provider</td><td>Fallback</td><td>Used only when no provider returns data; clearly labeled</td></tr>
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
          <li>Public quotes labeled with source, type, and timestamp.</li>
          <li>Required disclosures included.</li>
          <li>Recommendations reviewed and approved.</li>
        </ul>
      </PageWrap>
    );
  }

  return <div className="pdf-document">{pages}</div>;
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
