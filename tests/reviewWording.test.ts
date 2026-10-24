import { describe, expect, it } from "vitest";
import type { DataQualityIssue, Holding, Recommendation, SourceDocument } from "@/domain/types";
import { dataQualityScore, evaluateHoldingQuality } from "@/engines/dataQualityEngine";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { dataTasks, isStaleValue } from "@/engines/dataTasks";
import { generateInsights } from "@/engines/insightEngine";
import { valueProvenance } from "@/engines/valuationProvenance";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// R18 slice 2 / R11 (#51, #46): identifiers help identify and match an
// investment but aren't needed to value it, so a missing one costs no
// quality points; value review is worded as reviewing a recorded value, not
// repricing a security. Readiness codes, applicability and results are unchanged.

const NOW = new Date("2026-10-24T12:00:00Z");
const issue = (code: DataQualityIssue["code"], severity: DataQualityIssue["severity"], message: string = code): DataQualityIssue => ({ code, severity, message });
const approveAll = (recs: Recommendation[]) => recs.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true, status: "approved" as const }));
const readiness = (patch: Partial<Parameters<typeof evaluateWorkspaceReadiness>[0]> = {}) =>
  evaluateWorkspaceReadiness({
    client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: SEED_HOLDINGS, recommendations: approveAll(SEED_RECOMMENDATIONS),
    disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES, sourceDocuments: [], now: NOW, ...patch,
  });
const gates = (checks: { code: string; passed: boolean }[]) => checks.map((c) => [c.code, c.passed]);

describe("a missing identifier costs no quality points", () => {
  it("alone, it causes no deduction", () => {
    expect(dataQualityScore([issue("MISSING_IDENTIFIER", "warning")])).toBe(100);
    const equity = SEED_HOLDINGS.find((h) => h.id === "h_aapl")!;
    const fresh = { ...equity, valuationDate: "2026-10-20", valuationSource: { ...equity.valuationSource, asOf: "2026-10-20" }, advisorVerification: "advisor_reviewed" as const, dataQuality: [] };
    const withoutId = evaluateHoldingQuality({ ...fresh, identifier: undefined });
    expect(withoutId.map((i) => i.code)).toContain("MISSING_IDENTIFIER"); // still reported, as information
    expect(dataQualityScore(withoutId)).toBe(dataQualityScore(evaluateHoldingQuality(fresh)));
  });

  it("every other issue keeps its penalty", () => {
    const others = [issue("MISSING_CURRENCY", "critical"), issue("STALE_VALUATION", "warning"), issue("MOCK_PRICE_USED", "warning"), issue("QUANTITY_VALUE_MISMATCH", "warning"), issue("MISSING_COST_BASIS", "info")];
    expect(dataQualityScore(others)).toBe(100 - 12 - 6 - 6 - 6 - 2);
    expect(dataQualityScore([...others, issue("MISSING_IDENTIFIER", "warning")])).toBe(dataQualityScore(others));
    expect(dataQualityScore([...others, issue("MISSING_IDENTIFIER", "critical")])).toBe(dataQualityScore(others));
  });

  it("legacy saved identifier warnings don't count either, and saved holdings aren't rewritten", () => {
    const saved: Holding = {
      ...SEED_HOLDINGS[0],
      identifier: undefined,
      dataQuality: [
        issue("MISSING_IDENTIFIER", "warning", "Holding has no ticker/CUSIP/ISIN identifier."),
        issue("MISSING_IDENTIFIER", "warning", "No symbol or identifier extracted."),
        issue("STALE_VALUATION", "warning", "Valuation older than 35 days."),
      ],
    };
    const before = structuredClone(saved);
    const [n] = normalizeHoldings([saved], SEED_FX_RATES, "USD");
    expect(n.dataQuality).toEqual(saved.dataQuality);
    expect(dataQualityScore(n.dataQuality)).toBe(94);
    expect(saved).toEqual(before);
  });
});

describe("readiness is reworded, not changed", () => {
  it("the value-review checks keep their codes and results with the new wording", () => {
    const hs = SEED_HOLDINGS.map((h) => (h.id === "h_qqqm" ? { ...h, valuationSource: { kind: "mock" as const }, advisorVerification: "unverified" as const } : h));
    const checks = readiness({ holdings: hs });
    expect(checks.find((c) => c.code === "stale_valuations")).toEqual({ code: "stale_valuations", label: "Out-of-date values reviewed", passed: false, detail: "1 out-of-date value(s) not yet reviewed" });
    expect(checks.find((c) => c.code === "market_data")).toEqual({ code: "market_data", label: "Placeholder values reviewed", passed: false, detail: "1 placeholder value(s) not yet reviewed" });
    expect(checks.map((c) => c.label).join(" ")).not.toMatch(/price/i);
  });

  it("codes and pass/fail results are those of the previous release", () => {
    // Recorded from main at 7d5999f before this change.
    expect(gates(readiness())).toEqual([
      ["client_profile", true], ["advisor_profile", true], ["accounts_present", true], ["holdings_present", true], ["output_currency", true],
      ["holdings_valued", true], ["imports_complete", true], ["unverified_holdings", false], ["stale_valuations", false], ["market_data", true],
      ["approved_recs", true], ["recommendation_currency", true], ["recommendation_links", true], ["trades_funded", true], ["funding_reserves", true], ["approved_alternative", true], ["fx_current", false], // D2 adds funding_reserves and approved_alternative
      ["fx_available", true], ["disclosures_included", true],
    ]);
    const reviewed = SEED_HOLDINGS.map((h) => ({ ...h, advisorVerification: "advisor_reviewed" as const }));
    const fresh = SEED_FX_RATES.map((r) => ({ ...r, asOf: "2026-10-23" }));
    expect(readiness({ holdings: reviewed, fxRates: fresh }).every((c) => c.passed)).toBe(true);
  });

  it("an unreviewed placeholder, a missing rate, an incomplete import and a funding shortfall still fail", () => {
    const reviewed = SEED_HOLDINGS.map((h) => ({ ...h, advisorVerification: "advisor_reviewed" as const }));
    const fresh = SEED_FX_RATES.map((r) => ({ ...r, asOf: "2026-10-23" }));
    const failing = (patch: Partial<Parameters<typeof evaluateWorkspaceReadiness>[0]>) => readiness({ holdings: reviewed, fxRates: fresh, ...patch }).filter((c) => !c.passed).map((c) => c.code);

    const mock = reviewed.map((h) => (h.id === "h_qqqm" ? { ...h, valuationSource: { kind: "mock" as const }, advisorVerification: "unverified" as const } : h));
    expect(failing({ holdings: mock })).toEqual(["unverified_holdings", "market_data"]);

    const nok = reviewed.map((h) => (h.id === "h_mortgage" ? { ...h, currency: "NOK" as Holding["currency"] } : h));
    expect(failing({ holdings: nok })).toContain("holdings_valued");

    const doc = { id: "sd_qa", fileName: "qa.pdf", sourceType: "pdf_text", importCompleteness: { status: "incomplete", reason: "total_mismatch", stated: 9_000_000, extracted: 8_300_000, currency: "USD", unreadableRows: 0 } } as SourceDocument;
    const imported = { ...reviewed[0], id: "h_qa", sourceTrace: { sourceDocumentId: "sd_qa" } } as Holding;
    expect(failing({ holdings: [...reviewed, imported], sourceDocuments: [doc] })).toEqual(["imports_complete"]);

    const big: Recommendation = { id: "r_big", title: "Buy more VTI", type: "buy", relatedHoldingId: "h_vti", actionAmount: 2_000_000, currency: "USD", rationale: "Test", priority: "medium", status: "approved", includeInPdf: true, approvedByAdvisor: true, createdAt: "2026-10-24", updatedAt: "2026-10-24" };
    expect(failing({ recommendations: [...approveAll(SEED_RECOMMENDATIONS), big] })).toEqual(["trades_funded"]);
  });
});

describe("keeping a recorded date is an acknowledgement, not a refresh", () => {
  it("settles only the out-of-date task; the date, the staleness and every gate stay as they were", () => {
    const h = SEED_HOLDINGS.find((x) => x.id === "h_re_cambridge")!;
    const old = { ...h, valuationDate: "2025-01-31", valuationSource: { ...h.valuationSource, asOf: "2025-01-31" }, advisorVerification: "unverified" as const };
    const kept = { ...old, dataAcks: { acceptedValuationDate: old.valuationDate } };
    expect(isStaleValue(old)).toBe(true);
    const task = (x: Holding) => dataTasks(normalizeHoldings([x], SEED_FX_RATES, "USD"), { now: NOW }).find((t) => t.kind === "stale_value");
    expect(task(old)).toMatchObject({ openIds: [h.id], doneIds: [] });
    expect(task(kept)).toBeUndefined(); // no longer an open task
    expect(kept.valuationDate).toBe("2025-01-31");
    expect(isStaleValue(kept)).toBe(true);
    expect(valueProvenance(kept).date).toBe("2025-01-31");
    const withHolding = (x: Holding) => SEED_HOLDINGS.map((s) => (s.id === h.id ? x : s));
    expect(readiness({ holdings: withHolding(kept) })).toEqual(readiness({ holdings: withHolding(old) }));
    expect(readiness({ holdings: withHolding(kept) }).find((c) => c.code === "unverified_holdings")!.passed).toBe(false);
  });
});

describe("identifier and value-review wording", () => {
  it("explains identifiers as optional matching evidence, never as needed for prices", () => {
    const noId = SEED_HOLDINGS.map((h) => (h.id === "h_aapl" ? { ...h, identifier: undefined } : h));
    const text = generateInsights({ holdings: normalizeHoldings(noId, SEED_FX_RATES, "USD"), reportingCurrency: "USD" })
      .filter((i) => /ticker|CUSIP/.test(i.title))
      .map((i) => `${i.title} ${i.detail}`)
      .join(" ");
    expect(text).toMatch(/identify|match/);
    expect(text).toMatch(/isn't needed|not needed/);
    expect(text).not.toMatch(/refresh|price/i);
  });

  it("out-of-date and manual-valuation text asks for a review or update, not a repricing", () => {
    const ins = generateInsights({ holdings: normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD"), reportingCurrency: "USD" });
    const stale = ins.find((i) => /out of date/.test(i.title))!;
    expect(stale.detail).toMatch(/doesn't make the value current/);
    expect(stale.detail).not.toMatch(/refresh/i);
    for (const i of ins.filter((x) => /manually valued/.test(x.title))) expect(i.detail).not.toMatch(/Refresh/);
  });
});
