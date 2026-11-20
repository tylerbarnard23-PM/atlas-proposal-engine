import type { ClientDiscovery, ClientProfile, DiscoveryAnswerState, DiscoveryLevel, DiscoveryObjective, DiscoveryQuestionId } from "@/domain/types";
import { contentHash } from "./snapshotRecord";

// #109 — client discovery. The advisor records what was discussed with the
// client; nothing here is inferred. A question with no recorded state is "Not
// discussed yet", whatever an older field or a default says. Existing profile
// fields keep the value where their meaning is the same (time horizon, tax
// sensitivity, restricted investments: one source of truth); `client.discovery`
// holds the rest, each question's status and its review. An older field's
// value is never adopted as an answer: the advisor records it explicitly.
// A review stores the answer's content hash, so editing the answer makes it stale.
// The same brief is shown to the advisor and given to Stratovell AI.

export const OBJECTIVES: { id: DiscoveryObjective; label: string }[] = [
  { id: "preserve_wealth", label: "Preserve wealth" },
  { id: "generate_income", label: "Generate income" },
  { id: "grow_wealth", label: "Grow wealth" },
  { id: "reduce_concentration", label: "Reduce concentration" },
  { id: "fund_spending", label: "Fund upcoming spending" },
];
export const objectiveLabel = (o: DiscoveryObjective) => OBJECTIVES.find((x) => x.id === o)?.label ?? o;

export const QUESTIONS: { id: DiscoveryQuestionId; label: string }[] = [
  { id: "objectives", label: "Objectives" },
  { id: "timeHorizon", label: "Time horizon" },
  { id: "liquidity", label: "Liquidity needs" },
  { id: "income", label: "Income needs" },
  { id: "lossWillingness", label: "Willingness to accept losses" },
  { id: "lossAbility", label: "Ability to absorb losses" },
  { id: "taxSensitivity", label: "Tax sensitivity" },
  { id: "securitiesToRetain", label: "Securities to retain" },
  { id: "restrictedInvestments", label: "Restricted investments" },
  { id: "otherConstraints", label: "Other constraints" },
];
export const questionLabel = (q: DiscoveryQuestionId) => QUESTIONS.find((x) => x.id === q)!.label;

export const TIMING_LABEL = { within_1_year: "within 1 year", "1_to_3_years": "in 1 to 3 years", over_3_years: "in more than 3 years" } as const;
export const FREQUENCY_LABEL = { monthly: "per month", quarterly: "per quarter", annually: "per year" } as const;

/** Each question's answer, as recorded (wherever it is stored). */
export interface DiscoveryValues {
  objectives: { primary: DiscoveryObjective; secondary: DiscoveryObjective[] };
  timeHorizon: { years: number };
  liquidity: NonNullable<ClientDiscovery["liquidity"]>;
  income: NonNullable<ClientDiscovery["income"]>;
  lossWillingness: { level: DiscoveryLevel };
  lossAbility: { level: DiscoveryLevel };
  taxSensitivity: { level: DiscoveryLevel };
  securitiesToRetain: { securities: string[] };
  restrictedInvestments: { securities: string[] };
  otherConstraints: { text: string };
}

const stateOf = (c: ClientProfile, q: DiscoveryQuestionId): DiscoveryAnswerState | undefined => c.discovery?.answers[q];
const answered = (c: ClientProfile, q: DiscoveryQuestionId) => stateOf(c, q)?.status === "answered";

/** The recorded answer, or null when the question isn't answered (not discussed, or no state). */
export function answerValue<Q extends DiscoveryQuestionId>(c: ClientProfile, q: Q): DiscoveryValues[Q] | null {
  if (!answered(c, q)) return null;
  const d = c.discovery!;
  const v: { [K in DiscoveryQuestionId]: () => DiscoveryValues[K] | null } = {
    objectives: () => (d.objectives ? { primary: d.objectives.primary, secondary: d.objectives.secondary } : null),
    timeHorizon: () => (Number.isFinite(c.timeHorizonYears) ? { years: c.timeHorizonYears } : null),
    liquidity: () => d.liquidity ?? null,
    income: () => d.income ?? null,
    lossWillingness: () => (d.lossWillingness ? { level: d.lossWillingness } : null),
    lossAbility: () => (d.lossAbility ? { level: d.lossAbility } : null),
    taxSensitivity: () => ({ level: c.taxSensitivity }),
    securitiesToRetain: () => ({ securities: d.securitiesToRetain ?? [] }),
    restrictedInvestments: () => ({ securities: c.restrictedSecurities ?? [] }),
    otherConstraints: () => ({ text: d.otherConstraints ?? "" }),
  };
  return v[q]() as DiscoveryValues[Q] | null;
}

/** The answer's content hash (value and clarification): what a review confirms. */
export function answerHash(c: ClientProfile, q: DiscoveryQuestionId): string {
  return contentHash({ q, value: answerValue(c, q), note: stateOf(c, q)?.note ?? null });
}

export type QuestionStatus = "not_discussed" | "recorded" | "reviewed" | "review_stale";

export function questionStatus(c: ClientProfile, q: DiscoveryQuestionId): QuestionStatus {
  if (answerValue(c, q) == null) return "not_discussed";
  const review = stateOf(c, q)?.review;
  if (!review) return "recorded";
  return review.answerHash === answerHash(c, q) ? "reviewed" : "review_stale";
}

const emptyDiscovery = (): ClientDiscovery => ({ answers: {} });

function withState(c: ClientProfile, q: DiscoveryQuestionId, patch: Partial<DiscoveryAnswerState> & { status: DiscoveryAnswerState["status"] }, now: string, discovery: Partial<ClientDiscovery> = {}): ClientProfile {
  const d = c.discovery ?? emptyDiscovery();
  const prev = d.answers[q];
  // A review is kept (it may become stale); "Not discussed yet" has nothing to review.
  const next: DiscoveryAnswerState = { ...(prev ?? {}), ...patch, updatedAt: now };
  if (next.status === "not_discussed") delete next.review;
  if (next.note !== undefined && next.note.trim() === "") delete next.note;
  return { ...c, discovery: { ...d, ...discovery, answers: { ...d.answers, [q]: next } } };
}

/**
 * Records an answer. Values with an existing profile field are written there;
 * the rest in `discovery`. Changing an answer leaves its review stale.
 */
export function recordAnswer<Q extends DiscoveryQuestionId>(c: ClientProfile, q: Q, value: DiscoveryValues[Q], now: string): ClientProfile {
  const v = value as DiscoveryValues[DiscoveryQuestionId];
  const s = { status: "answered" as const };
  switch (q) {
    case "objectives": {
      const o = v as DiscoveryValues["objectives"];
      const secondary = [...new Set(o.secondary)].filter((x) => x !== o.primary);
      return withState(c, q, s, now, { objectives: { primary: o.primary, secondary } });
    }
    case "timeHorizon":
      return withState({ ...c, timeHorizonYears: (v as DiscoveryValues["timeHorizon"]).years }, q, s, now);
    case "liquidity":
      return withState(c, q, s, now, { liquidity: cleanMoney(v as DiscoveryValues["liquidity"], "planned") });
    case "income":
      return withState(c, q, s, now, { income: cleanMoney(v as DiscoveryValues["income"], "needed") });
    case "lossWillingness":
      return withState(c, q, s, now, { lossWillingness: (v as DiscoveryValues["lossWillingness"]).level });
    case "lossAbility":
      return withState(c, q, s, now, { lossAbility: (v as DiscoveryValues["lossAbility"]).level });
    case "taxSensitivity":
      return withState({ ...c, taxSensitivity: (v as DiscoveryValues["taxSensitivity"]).level }, q, s, now);
    case "securitiesToRetain":
      return withState(c, q, s, now, { securitiesToRetain: cleanList((v as DiscoveryValues["securitiesToRetain"]).securities) });
    case "restrictedInvestments":
      return withState({ ...c, restrictedSecurities: cleanList((v as DiscoveryValues["restrictedInvestments"]).securities) }, q, s, now);
    case "otherConstraints":
      return withState(c, q, s, now, { otherConstraints: (v as DiscoveryValues["otherConstraints"]).text });
  }
}

// "No need" carries no amount; a need keeps only what was stated (an amount without a currency is reported as missing, never defaulted).
function cleanMoney<T extends { need: string; amount?: number; currency?: string }>(m: T, needed: string): T {
  if (m.need !== needed) return { need: m.need } as T;
  const out = { ...m };
  if (out.amount == null || !Number.isFinite(out.amount) || out.amount < 0) delete out.amount;
  if (!out.currency) delete out.currency;
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k];
  return out;
}
const cleanList = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * "Not discussed yet". Values held only by the questionnaire are cleared; an
 * existing profile field (shown elsewhere, e.g. the PDF) keeps its value but
 * is no longer read as the client's answer.
 */
export function markNotDiscussed(c: ClientProfile, q: DiscoveryQuestionId, now: string): ClientProfile {
  const own: Partial<Record<DiscoveryQuestionId, keyof ClientDiscovery>> = {
    objectives: "objectives",
    liquidity: "liquidity",
    income: "income",
    lossWillingness: "lossWillingness",
    lossAbility: "lossAbility",
    securitiesToRetain: "securitiesToRetain",
    otherConstraints: "otherConstraints",
  };
  const next = withState(c, q, { status: "not_discussed" }, now);
  const key = own[q];
  if (key && next.discovery) {
    const d = { ...next.discovery };
    delete d[key];
    return { ...next, discovery: d };
  }
  return next;
}

/** The clarification recorded with an answer (other constraints are free text already). */
export function setClarification(c: ClientProfile, q: Exclude<DiscoveryQuestionId, "otherConstraints">, note: string, now: string): ClientProfile {
  const prev = stateOf(c, q);
  if (!prev || prev.status !== "answered") return c;
  return withState(c, q, { status: "answered", note }, now);
}

/** The advisor's review of every answered question, at `now` (unanswered ones have nothing to review). */
export function recordReview(c: ClientProfile, now: string, questions: DiscoveryQuestionId[] = QUESTIONS.map((x) => x.id)): ClientProfile {
  if (!c.discovery) return c;
  const answers = { ...c.discovery.answers };
  for (const q of questions) {
    const s = answers[q];
    if (s?.status === "answered" && answerValue(c, q) != null) answers[q] = { ...s, review: { reviewedAt: now, answerHash: answerHash(c, q) } };
  }
  return { ...c, discovery: { ...c.discovery, answers } };
}

export function setAnalysisNote(c: ClientProfile, note: string): ClientProfile {
  const d = { ...(c.discovery ?? emptyDiscovery()) };
  if (note.trim()) d.analysisNote = note;
  else delete d.analysisNote;
  return { ...c, discovery: d };
}

// ---------------------------------------------------------------------------
// The client brief: recorded answers, unknowns, conflicts and missing details.
// ---------------------------------------------------------------------------

const money = (amount: number | undefined, currency: string | undefined) =>
  amount == null ? "amount not recorded" : `${currency ?? "[currency not recorded]"} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** One answer in words, as the advisor and the model read it. */
export function describeAnswer(c: ClientProfile, q: DiscoveryQuestionId): string | null {
  const v = answerValue(c, q);
  if (v == null) return null;
  switch (q) {
    case "objectives": {
      const o = v as DiscoveryValues["objectives"];
      return `Primary: ${objectiveLabel(o.primary)}` + (o.secondary.length ? `; also: ${o.secondary.map(objectiveLabel).join(", ")}` : "");
    }
    case "timeHorizon":
      return `${(v as DiscoveryValues["timeHorizon"]).years} years`;
    case "liquidity": {
      const l = v as DiscoveryValues["liquidity"];
      return l.need === "none" ? "No planned withdrawals" : `Planned withdrawal: ${money(l.amount, l.currency)}, ${l.timing ? TIMING_LABEL[l.timing] : "timing not recorded"}`;
    }
    case "income": {
      const i = v as DiscoveryValues["income"];
      return i.need === "none" ? "No income needed from the portfolio" : `Income needed: ${money(i.amount, i.currency)} ${i.frequency ? FREQUENCY_LABEL[i.frequency] : "(frequency not recorded)"}`;
    }
    case "lossWillingness":
    case "lossAbility":
    case "taxSensitivity":
      return cap((v as { level: DiscoveryLevel }).level);
    case "securitiesToRetain":
    case "restrictedInvestments": {
      const s = (v as { securities: string[] }).securities;
      return s.length ? s.join(", ") : "None";
    }
    case "otherConstraints": {
      const t = (v as DiscoveryValues["otherConstraints"]).text.trim();
      return t || "None";
    }
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface ClientBrief {
  answers: { question: DiscoveryQuestionId; label: string; status: Exclude<QuestionStatus, "not_discussed">; answer: string; clarification?: string; reviewedAt?: string }[];
  notDiscussed: { question: DiscoveryQuestionId; label: string }[];
  conflicts: string[];
  missingDetails: string[];
  analysisNote: string | null;
  /** Restricted investments on file that discovery hasn't confirmed: still a constraint. */
  restrictionsOnFile: string[];
  counts: { answered: number; reviewed: number; stale: number; total: number };
  lastReviewedAt: string | null;
}

export function clientBrief(c: ClientProfile): ClientBrief {
  const answers: ClientBrief["answers"] = [];
  const notDiscussed: ClientBrief["notDiscussed"] = [];
  for (const { id, label } of QUESTIONS) {
    const status = questionStatus(c, id);
    if (status === "not_discussed") {
      notDiscussed.push({ question: id, label });
      continue;
    }
    const st = stateOf(c, id)!;
    const clarification = st.note?.trim() || undefined;
    answers.push({ question: id, label, status, answer: describeAnswer(c, id)!, ...(clarification ? { clarification } : {}), ...(status === "reviewed" ? { reviewedAt: st.review!.reviewedAt } : {}) });
  }
  const reviewedTimes = answers.filter((a) => a.reviewedAt).map((a) => a.reviewedAt!).sort();
  return {
    answers,
    notDiscussed,
    conflicts: conflictsOf(c),
    missingDetails: missingDetailsOf(c),
    analysisNote: c.discovery?.analysisNote?.trim() || null,
    restrictionsOnFile: answerValue(c, "restrictedInvestments") == null ? cleanList(c.restrictedSecurities ?? []) : [],
    counts: {
      answered: answers.length,
      reviewed: answers.filter((a) => a.status === "reviewed").length,
      stale: answers.filter((a) => a.status === "review_stale").length,
      total: QUESTIONS.length,
    },
    lastReviewedAt: reviewedTimes.length ? reviewedTimes[reviewedTimes.length - 1] : null,
  };
}

const priorities = (c: ClientProfile): Set<DiscoveryObjective> => {
  const o = answerValue(c, "objectives");
  return new Set(o ? [o.primary, ...o.secondary] : []);
};

/** Recorded answers that pull against each other: stated for the advisor to resolve, never resolved here. */
export function conflictsOf(c: ClientProfile): string[] {
  const out: string[] = [];
  const p = priorities(c);
  const will = answerValue(c, "lossWillingness")?.level;
  const able = answerValue(c, "lossAbility")?.level;
  const income = answerValue(c, "income");
  const liquidity = answerValue(c, "liquidity");
  const retain = answerValue(c, "securitiesToRetain")?.securities ?? [];
  if (p.has("grow_wealth") && (will === "low" || able === "low")) {
    out.push(`Growing wealth is a stated priority, but the client's ${will === "low" ? "willingness to accept losses" : "ability to absorb losses"} is recorded as low.`);
  }
  if (will === "high" && able === "low") out.push("The client is willing to accept large losses but recorded as able to absorb only small ones.");
  if (p.has("preserve_wealth") && p.has("grow_wealth")) out.push("Preserving wealth and growing it are both priorities; which comes first decides how much risk is acceptable.");
  if (p.has("reduce_concentration") && retain.length > 0) out.push(`Reducing concentration is a priority, but the client wants to retain ${retain.join(", ")}; confirm whether a retained security is the concentrated one.`);
  if (p.has("generate_income") && income?.need === "none") out.push("Generating income is a priority, but no income is needed from the portfolio.");
  if (p.has("fund_spending") && liquidity?.need === "none") out.push("Funding upcoming spending is a priority, but no withdrawal is planned.");
  return out;
}

/** Details an answer leaves open, or questions an objective depends on that weren't discussed. */
export function missingDetailsOf(c: ClientProfile): string[] {
  const out: string[] = [];
  const p = priorities(c);
  const liquidity = answerValue(c, "liquidity");
  const income = answerValue(c, "income");
  if (liquidity?.need === "planned") {
    if (liquidity.amount == null) out.push("Planned withdrawal: amount not recorded.");
    if (!liquidity.currency) out.push("Planned withdrawal: currency not recorded.");
    if (!liquidity.timing) out.push("Planned withdrawal: timing not recorded.");
  }
  if (income?.need === "needed") {
    if (income.amount == null) out.push("Income need: amount not recorded.");
    if (!income.currency) out.push("Income need: currency not recorded.");
    if (!income.frequency) out.push("Income need: frequency not recorded.");
  }
  if (p.has("fund_spending") && !liquidity) out.push("Funding upcoming spending is a priority, but liquidity needs weren't discussed.");
  if (p.has("generate_income") && !income) out.push("Generating income is a priority, but income needs weren't discussed.");
  return out;
}

/**
 * The brief as Stratovell AI receives it (inside get_portfolio_overview). No
 * identity and never the private discovery notes; the caller redacts names in
 * free text as for every other model-bound result.
 */
export function modelBoundClientBrief(c: ClientProfile) {
  const b = clientBrief(c);
  const STATUS = { recorded: "recorded_not_reviewed", reviewed: "reviewed_by_advisor", review_stale: "changed_since_review" } as const;
  return {
    reviewed_answers: b.counts.reviewed,
    answered: b.counts.answered,
    questions: b.counts.total,
    last_reviewed: b.lastReviewedAt ? b.lastReviewedAt.slice(0, 10) : null,
    answers: b.answers.map((a) => ({ question: a.label, answer: a.answer, status: STATUS[a.status], ...(a.clarification ? { clarification: a.clarification } : {}) })),
    not_discussed: b.notDiscussed.map((x) => x.label),
    possible_conflicts: b.conflicts,
    missing_details: b.missingDetails,
    advisor_note_for_analysis: b.analysisNote,
    restricted_investments_on_file_not_confirmed: b.restrictionsOnFile,
    how_to_use:
      "These are the advisor's records of what the client said. A question not discussed is unknown: ask the advisor rather than assume it. " +
      "Amounts are client instructions with their own currency and period, not reserves the engines enforce. " +
      "Treat restricted investments on file as restricted until the advisor says otherwise.",
  };
}
