import type { AssetClass } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { formatCurrency } from "@/utils/formatting";
import type { CopilotResult } from "./agent";
import type { CopilotSnapshot } from "./snapshot";
import { CopilotContext, executeTool, type ToolCallRecord } from "./tools";

// Demo mode runs when no ANTHROPIC_API_KEY is configured, so the public
// deployment works for anyone at no cost. It calls the exact same tools as the
// live agent through a fixed plan; only the planning and the prose are
// scripted. Useful as a regression baseline for the tool layer too.

const CONCENTRATION_TARGET = 0.075; // trim single positions to ~7.5% of investible assets
const MAX_DEMO_DRAFTS = 3;
// Only positions that can actually be sold on short notice get a trim draft.
const TRADEABLE = new Set(["cash", "daily", "weekly"]);

type Intent = "readiness" | "draft" | "summary";

export function classifyIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(ready|readiness|compliance|checklist|pdf|block)/.test(q)) return "readiness";
  if (/(draft|recommend|suggest|propose|what should)/.test(q)) return "draft";
  return "summary";
}

export function runDemoCopilot(snapshot: CopilotSnapshot, question: string): CopilotResult {
  const ctx = new CopilotContext(snapshot);
  const trace: ToolCallRecord[] = [];
  const call = <T,>(name: string, input: Record<string, unknown> = {}): T | null => {
    const { content, isError } = executeTool(ctx, name, input);
    trace.push({ name, input, ok: !isError, summary: isError ? content : `${content.length.toLocaleString()} chars of engine output` });
    return isError ? null : (JSON.parse(content) as T);
  };
  const money = (n: number) => formatCurrency(n, ctx.reportingCurrency, { compact: true });

  const overview = call<Overview>("get_portfolio_overview");
  if (!overview || overview.counts.holdings === 0) {
    return result(ctx, trace, "There are no holdings in this workspace yet. Import a statement or reset to the sample client in Settings, then ask again.");
  }
  const intent = classifyIntent(question);
  const lines: string[] = [];

  if (intent === "readiness") {
    const r = call<Readiness>("check_proposal_readiness");
    const failing = r?.checks.filter((c) => !c.passed) ?? [];
    lines.push(
      r?.ready
        ? "**The proposal passes every readiness check** and can go to PDF."
        : `**${failing.length} readiness check${failing.length === 1 ? "" : "s"} block the PDF:**`
    );
    for (const c of failing) lines.push(`- ${c.check}${c.detail ? ` (${c.detail})` : ""}`);
    const dq = call<InsightList>("list_insights", { category: "data_quality", min_severity: "warning" });
    if (dq && dq.count > 0) {
      lines.push("", `**Data quality:** ${dq.count} warning${dq.count === 1 ? "" : "s"} worth clearing first, for example:`);
      for (const i of dq.insights.slice(0, 3)) lines.push(`- ${i.title}`);
    }
    return result(ctx, trace, lines.join("\n"));
  }

  const insights = call<InsightList>("list_insights", { min_severity: "warning" });
  const v = overview.valuation;
  const imports = overview.completeness;
  if (!imports.imports_complete) {
    // An import that doesn't account for its whole document: the workspace
    // may be missing positions, so no figure below is the whole portfolio.
    lines.push(
      `**Import incomplete:** ${imports.import_issues.join("; ")}. The figures below cover what was imported and may not be the whole portfolio; trade-sizing drafts are paused until the import is complete.`,
      ""
    );
  }
  if (v.complete) {
    lines.push(
      `**${overview.client.name}**: net worth ${money(overview.net_worth.net!)} across ${overview.counts.accounts} accounts and ${overview.counts.holdings} holdings, reported in ${overview.reporting_currency}.`,
      `Largest asset classes: ${overview.allocation_by_asset_class.slice(0, 3).map((a) => `${ASSET_CLASS_LABELS[a.label as AssetClass] ?? a.label} ${a.pct}%`).join(", ")}.`,
      ""
    );
  } else {
    // Never a partial figure presented as the whole: say what's missing first.
    const names = v.unvalued.map((u) => `${u.name} (${u.currency})`).join(", ");
    lines.push(
      `**${overview.client.name}: valuation is incomplete.** ${v.unvalued.length} of ${v.holdings_total} holdings can't be valued in ${overview.reporting_currency} because the ${v.missing_rates.join(", ")} exchange rate is missing: ${names}.`,
      overview.net_worth.net == null
        ? "No total is available until they're valued."
        : `Valued holdings only (${v.holdings_valued} of ${v.holdings_total}) come to ${money(overview.net_worth.net)} net; that is not the household's full net worth.`,
      "Portfolio-wide checks (concentration, currency, country, liquidity and cash) and allocation-changing drafts are paused until the rate is added in Market Data.",
      ""
    );
  }

  if (intent === "summary") {
    lines.push(`**${insights?.count ?? 0} warning-level findings** from the insight engine:`);
    for (const i of insights?.insights.slice(0, 6) ?? []) lines.push(`- ${i.title}`);
    lines.push("", "Ask me to *draft recommendations* and I'll turn the top findings into reviewable drafts.");
    return result(ctx, trace, lines.join("\n"));
  }

  // intent === "draft"
  const total = overview.allocation_by_asset_class.reduce((s, a) => s + a.value, 0);
  const illiquidConcentrations: string[] = [];
  const covered = new Set(overview.existing_recommendations.map((r) => r.holding_id).filter(Boolean));
  let skippedCovered = 0;
  for (const i of insights?.insights ?? []) {
    if (ctx.drafts.length >= MAX_DEMO_DRAFTS) break;
    const holdingId = i.related_holding_ids[0];
    if (holdingId && covered.has(holdingId)) {
      skippedCovered++;
      continue;
    }
    if (i.category === "concentration" && holdingId) {
      const h = call<HoldingDetail>("get_holding", { holding_id: holdingId });
      // A trim is sized against the whole portfolio: only with every holding valued.
      if (!h || !v.complete || !imports.imports_complete || h.reporting_value == null) continue;
      if (!h.liquidity || !TRADEABLE.has(h.liquidity)) {
        illiquidConcentrations.push(`${h.name} (${h.pct_of_investible}%, ${h.liquidity ?? "liquidity unknown"})`);
        continue;
      }
      const trim = Math.round((h.reporting_value - total * CONCENTRATION_TARGET) / 1000) * 1000;
      if (trim <= 0) continue;
      const sim = call<Simulation>("simulate_recommendation", { holding_id: holdingId, type: "reduce_concentration", action_amount: trim });
      if (!sim || sim.before == null || sim.after == null) continue;
      call("draft_recommendation", {
        holding_id: holdingId,
        type: "reduce_concentration",
        action_amount: trim,
        priority: i.severity === "critical" ? "high" : "medium",
        title: `Trim ${h.name} to reduce single-issuer concentration`,
        rationale: `${h.name} is ${sim.pct_of_investible_before}% of investible assets. Trimming ${money(trim)} brings it to ${sim.pct_of_investible_after}% (${money(sim.before)} to ${money(sim.after)}), with proceeds held as cash in the same account.`,
        risk_tradeoff: "Realizes gains on a long-held position and gives up some upside if it keeps outperforming.",
        tax_note: h.cost_basis != null ? `Cost basis on file: ${money(h.cost_basis)}. Review realized-gain impact and lot selection.` : "Cost basis missing; confirm before sizing the sale.",
        implementation_step: "Confirm lots and timing with the client, then stage the sale across tax years if appropriate.",
      });
    } else if (i.category === "fees" && holdingId) {
      call("draft_recommendation", {
        holding_id: holdingId,
        type: "replace_high_fee_fund",
        priority: "medium",
        title: `Review lower-cost alternative to ${i.title.split(" has ")[0]}`,
        rationale: `${i.title}. ${i.detail}`,
        client_benefit: "Lower ongoing cost for the same exposure.",
        implementation_step: "Identify a comparable lower-cost vehicle and check for exit fees or tax consequences.",
      });
    } else if (i.category === "data_quality" && i.severity === "critical" && holdingId) {
      call("draft_recommendation", {
        holding_id: holdingId,
        type: "review_source_data",
        priority: "high",
        title: `Resolve data issue: ${i.title}`.slice(0, 160),
        rationale: `The data-quality engine flagged ${i.title}. Figures for this holding should not go to the client until it is resolved.`,
      });
    }
  }

  if (illiquidConcentrations.length > 0) {
    lines.push(
      "**Concentrated but not tradeable**, so I didn't draft a sale. Worth a planning conversation instead:",
      ...illiquidConcentrations.map((c) => `- ${c}`),
      ""
    );
  }
  if (skippedCovered > 0) {
    lines.push(`Skipped ${skippedCovered} finding${skippedCovered === 1 ? "" : "s"} on holdings that already have a recommendation on file.`, "");
  }
  if (ctx.drafts.length === 0 && !v.complete) {
    lines.push("I didn't draft any trades: they can't be sized against the portfolio while holdings are unvalued. Add the missing rate, then ask again.");
  } else if (ctx.drafts.length === 0) {
    lines.push(
      skippedCovered > 0
        ? "Every tradeable finding already has a recommendation on file, so I didn't draft new ones. Review the existing drafts in Recommendations."
        : "No warning-level findings map to a standard recommendation, so I didn't draft any. The portfolio looks clean on the rules Atlas checks."
    );
  } else {
    lines.push(`**I saved ${ctx.drafts.length} draft recommendation${ctx.drafts.length === 1 ? "" : "s"}**, sized with the proposal engine:`);
    for (const d of ctx.drafts) lines.push(`- ${d.title}`);
    lines.push("", "Each draft is marked *needs review*, is not approved, and is excluded from the client PDF. Add them to Recommendations, then edit and approve the ones you agree with.");
  }
  return result(ctx, trace, lines.join("\n"));
}

function result(ctx: CopilotContext, trace: ToolCallRecord[], answer: string): CopilotResult {
  return { mode: "demo", answer, drafts: ctx.drafts, trace };
}

// Shapes of the tool outputs this file reads (see tools.ts).
interface Overview {
  reporting_currency: string;
  client: { name: string };
  net_worth: { status: "complete" | "partial" | "unavailable"; net: number | null };
  valuation: {
    complete: boolean;
    holdings_valued: number;
    holdings_total: number;
    unvalued: { name: string; currency: string }[];
    missing_rates: string[];
  };
  completeness: { valuation_complete: boolean; imports_complete: boolean; import_issues: string[] };
  counts: { accounts: number; holdings: number };
  allocation_by_asset_class: { label: string; value: number; pct: number | null }[];
  existing_recommendations: { holding_id: string | null }[];
}
interface InsightList {
  count: number;
  insights: { category: string; severity: string; title: string; detail: string; related_holding_ids: string[] }[];
}
interface HoldingDetail {
  name: string;
  liquidity: string | null;
  pct_of_investible: number | null;
  reporting_value: number | null;
  cost_basis: number | null;
}
interface Simulation {
  before: number | null;
  after: number | null;
  pct_of_investible_before: number | null;
  pct_of_investible_after: number | null;
}
interface Readiness {
  ready: boolean;
  checks: { check: string; passed: boolean; detail: string | null }[];
}
