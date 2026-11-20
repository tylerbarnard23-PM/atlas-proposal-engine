import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardFooter, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { CURRENCIES } from "@/domain/currencyConfigs";
import { OBJECTIVES, answerValue, clientBrief, questionStatus, type QuestionStatus } from "@/engines/clientDiscovery";
import type { ClientProfile, DiscoveryLevel, DiscoveryObjective, DiscoveryQuestionId } from "@/domain/types";
import { ChoiceButtons, type Choice } from "./ChoiceButtons";

// #109: the advisor-completed discovery questionnaire. Every question starts
// at "Not discussed yet"; an answer exists only when the advisor records one.
// Values with an existing profile field are written there (one source of
// truth). Editing an answer leaves its review stale until reviewed again.

const NOT = "__not_discussed" as const;
type Not = typeof NOT;
const notChoice: Choice<Not> = { value: NOT, label: "Not discussed yet" };
const LEVELS: Choice<DiscoveryLevel>[] = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export function StatusBadge({ status, reviewedAt }: { status: QuestionStatus; reviewedAt?: string }) {
  if (status === "not_discussed") return <Badge tone="neutral">Not discussed yet</Badge>;
  if (status === "recorded") return <Badge tone="warning">Recorded · not reviewed</Badge>;
  if (status === "review_stale") return <Badge tone="warning">Changed since review</Badge>;
  return <Badge tone="positive">Reviewed{reviewedAt ? ` ${fmtDate(reviewedAt)}` : ""}</Badge>;
}

export function DiscoveryQuestionnaire() {
  const client = useAtlasStore((s) => s.client);
  const recordReview = useAtlasStore((s) => s.recordDiscoveryReview);
  const brief = clientBrief(client);
  const toReview = brief.counts.answered - brief.counts.reviewed;
  return (
    <Card id="client-discovery">
      <CardHeader>
        <CardTitle>Client discovery</CardTitle>
        <CardSubtitle>
          Record what the client told you. Every question starts as “Not discussed yet”; nothing is filled in for you, and earlier profile values aren’t treated as
          answers. Stratovell AI relates its analysis to these answers.
        </CardSubtitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <Objectives client={client} />
        <TimeHorizon client={client} />
        <MoneyNeed q="liquidity" client={client} />
        <MoneyNeed q="income" client={client} />
        <LevelQuestion q="lossWillingness" client={client} title="Willingness to accept losses" help="How large a decline the client says they would accept." />
        <LevelQuestion q="lossAbility" client={client} title="Ability to absorb losses" help="How large a decline the client’s finances could absorb without changing their plans. Separate from willingness." />
        <LevelQuestion q="taxSensitivity" client={client} title="Tax sensitivity" help="How much taxes on gains or income matter to this client." />
        <ListQuestion q="securitiesToRetain" client={client} title="Securities to retain" help="Holdings the client wants to keep (for example, inherited or sentimental positions)." />
        <ListQuestion q="restrictedInvestments" client={client} title="Restricted investments" help="Securities or kinds of investment the client won’t hold." />
        <OtherConstraints client={client} />
      </CardBody>
      <CardFooter className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-ink-700" data-testid="discovery-summary">
          {brief.counts.answered} of {brief.counts.total} answered · {brief.counts.reviewed} reviewed
          {brief.counts.stale ? ` · ${brief.counts.stale} changed since review` : ""}
          {brief.lastReviewedAt ? ` · last reviewed ${fmtDate(brief.lastReviewedAt)}` : ""}
        </span>
        <Button size="sm" onClick={recordReview} disabled={toReview === 0} title="Records today’s date as your review of every answered question.">
          Record advisor review{toReview > 0 ? ` (${toReview})` : ""}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Question({ q, client, title, help, children }: { q: DiscoveryQuestionId; client: ClientProfile; title: string; help?: string; children: React.ReactNode }) {
  const status = questionStatus(client, q);
  const reviewedAt = client.discovery?.answers[q]?.review?.reviewedAt;
  return (
    <section aria-labelledby={`dq-${q}`} className="space-y-2" data-question={q} data-status={status}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`dq-${q}`} className="text-sm font-semibold text-ink-900">
          {title}
        </h3>
        <StatusBadge status={status} reviewedAt={status === "reviewed" ? reviewedAt : undefined} />
      </div>
      {help && <p className="text-2xs text-ink-500">{help}</p>}
      {children}
    </section>
  );
}

function Clarification({ q, client }: { q: Exclude<DiscoveryQuestionId, "objectives" | "otherConstraints">; client: ClientProfile }) {
  const set = useAtlasStore((s) => s.setDiscoveryClarification);
  if (answerValue(client, q) == null) return null;
  return (
    <div>
      <Label htmlFor={`dq-${q}-note`}>Clarification (optional)</Label>
      <Input id={`dq-${q}-note`} value={client.discovery?.answers[q]?.note ?? ""} onChange={(e) => set(q, e.target.value)} />
    </div>
  );
}

function Objectives({ client }: { client: ClientProfile }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const v = answerValue(client, "objectives");
  const choices: Choice<DiscoveryObjective | Not>[] = [notChoice, ...OBJECTIVES.map((o) => ({ value: o.id, label: o.label }))];
  const record = (primary: DiscoveryObjective, secondary: DiscoveryObjective[], clarification: string) => setAnswer("objectives", { primary, secondary, clarification });
  return (
    <Question q="objectives" client={client} title="Primary objective">
      <ChoiceButtons
        labelledBy="dq-objectives"
        choices={choices}
        selected={[v ? v.primary : NOT]}
        onSelect={(o) => (o === NOT ? notDiscussed("objectives") : record(o, v?.secondary ?? [], v?.clarification ?? client.investmentObjective ?? ""))}
      />
      {v && (
        <>
          <p id="dq-objectives-secondary" className="text-2xs font-medium text-ink-700">
            Secondary priorities (optional)
          </p>
          <ChoiceButtons
            labelledBy="dq-objectives-secondary"
            multiple
            choices={OBJECTIVES.filter((o) => o.id !== v.primary).map((o) => ({ value: o.id, label: o.label }))}
            selected={v.secondary}
            onSelect={(o) => record(v.primary, v.secondary.includes(o) ? v.secondary.filter((x) => x !== o) : [...v.secondary, o], v.clarification)}
          />
          <div>
            <Label htmlFor="dq-objectives-note">Objective in the client’s words (optional)</Label>
            <Textarea id="dq-objectives-note" rows={2} value={v.clarification} onChange={(e) => record(v.primary, v.secondary, e.target.value)} />
            <p className="mt-1 text-2xs text-ink-500">Also shown on the dashboard and in the proposal as the investment objective.</p>
          </div>
        </>
      )}
    </Question>
  );
}

/** A number typed by the advisor: recorded when valid, never prefilled from an older value. */
function NumberField({ id, label, value, onValue, min = 0 }: { id: string; label: string; value: number | undefined; onValue: (n: number | undefined) => void; min?: number }) {
  const [text, setText] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => setText(value == null ? "" : String(value)), [value]);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.replace(/[,\s]/g, "");
          if (raw === "") onValue(undefined);
          else if (/^\d+(\.\d+)?$/.test(raw) && Number(raw) >= min) onValue(Number(raw));
        }}
      />
    </div>
  );
}

function TimeHorizon({ client }: { client: ClientProfile }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const v = answerValue(client, "timeHorizon");
  return (
    <Question q="timeHorizon" client={client} title="Time horizon" help="Years until the client expects to need most of this money. Typing a number records the answer.">
      <div className="flex flex-wrap items-end gap-3">
        <ChoiceButtons labelledBy="dq-timeHorizon" choices={[notChoice]} selected={v ? [] : [NOT]} onSelect={() => notDiscussed("timeHorizon")} />
        <div className="w-32">
          <NumberField id="dq-timeHorizon-years" label="Years" value={v?.years} onValue={(n) => (n == null ? notDiscussed("timeHorizon") : setAnswer("timeHorizon", { years: n }))} />
        </div>
      </div>
      <Clarification q="timeHorizon" client={client} />
    </Question>
  );
}

function MoneyNeed({ q, client }: { q: "liquidity" | "income"; client: ClientProfile }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const liquidity = q === "liquidity";
  const v = answerValue(client, q);
  const needed = liquidity ? "planned" : "needed";
  const choices: Choice<string>[] = [notChoice, { value: "none", label: liquidity ? "No planned withdrawals" : "No income needed" }, { value: needed, label: liquidity ? "Planned withdrawal" : "Income needed" }];
  const current = v ?? null;
  const record = (patch: Record<string, unknown>) => setAnswer(q, { ...(current ?? { need: needed }), ...patch } as never);
  return (
    <Question
      q={q}
      client={client}
      title={liquidity ? "Liquidity needs" : "Income needs"}
      help={
        liquidity
          ? "Money the client plans to take out, with its currency and timing. A client instruction: it doesn’t reserve cash in any account."
          : "Regular income the client needs from the portfolio, with its currency and frequency when known. A client instruction, not a reserve."
      }
    >
      <ChoiceButtons labelledBy={`dq-${q}`} choices={choices} selected={[current ? current.need : NOT]} onSelect={(c) => (c === NOT ? notDiscussed(q) : setAnswer(q, { need: c } as never))} />
      {current && current.need === needed && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField id={`dq-${q}-amount`} label="Amount (if known)" value={current.amount} onValue={(n) => record({ amount: n })} />
          <div>
            <Label htmlFor={`dq-${q}-currency`}>Currency</Label>
            <Select id={`dq-${q}-currency`} value={current.currency ?? ""} onChange={(e) => record({ currency: e.target.value || undefined })}>
              <option value="">Not recorded</option>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p id={`dq-${q}-period`} className="text-2xs font-medium text-ink-700 mb-1">
              {liquidity ? "Timing" : "Frequency"}
            </p>
            {liquidity ? (
              <ChoiceButtons
                labelledBy={`dq-${q}-period`}
                choices={[
                  { value: "within_1_year", label: "Within 1 year" },
                  { value: "1_to_3_years", label: "1–3 years" },
                  { value: "over_3_years", label: "Over 3 years" },
                ]}
                selected={"timing" in current && current.timing ? [current.timing] : []}
                onSelect={(t) => record({ timing: t })}
              />
            ) : (
              <ChoiceButtons
                labelledBy={`dq-${q}-period`}
                choices={[
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "annually", label: "Annually" },
                ]}
                selected={"frequency" in current && current.frequency ? [current.frequency] : []}
                onSelect={(f) => record({ frequency: f })}
              />
            )}
          </div>
        </div>
      )}
      <Clarification q={q} client={client} />
    </Question>
  );
}

function LevelQuestion({ q, client, title, help }: { q: "lossWillingness" | "lossAbility" | "taxSensitivity"; client: ClientProfile; title: string; help: string }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const v = answerValue(client, q);
  return (
    <Question q={q} client={client} title={title} help={help}>
      <ChoiceButtons
        labelledBy={`dq-${q}`}
        choices={[notChoice, ...LEVELS] as Choice<DiscoveryLevel | Not>[]}
        selected={[v ? v.level : NOT]}
        onSelect={(l) => (l === NOT ? notDiscussed(q) : setAnswer(q, { level: l }))}
      />
      <Clarification q={q} client={client} />
    </Question>
  );
}

function ListQuestion({ q, client, title, help }: { q: "securitiesToRetain" | "restrictedInvestments"; client: ClientProfile; title: string; help: string }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const v = answerValue(client, q);
  const onFile = q === "restrictedInvestments" ? client.restrictedSecurities ?? [] : [];
  // Typed as a comma-separated list; recorded when the field is left.
  const [text, setText] = React.useState((v?.securities ?? []).join(", "));
  React.useEffect(() => setText((v?.securities ?? []).join(", ")), [v?.securities.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const list = text.split(",").map((x) => x.trim()).filter(Boolean);
    if (list.length > 0 || v) setAnswer(q, { securities: list });
  };
  return (
    <Question q={q} client={client} title={title} help={help}>
      <ChoiceButtons
        labelledBy={`dq-${q}`}
        choices={[notChoice, { value: "none", label: "None" }] as Choice<string>[]}
        selected={[v ? (v.securities.length === 0 ? "none" : "") : NOT]}
        onSelect={(c) => {
          if (c === NOT) return notDiscussed(q);
          if (onFile.length > 0 && !confirm(`Record that the client has no restricted investments? This clears ${onFile.join(", ")} from the profile.`)) return;
          setAnswer(q, { securities: [] });
        }}
      />
      {!v && onFile.length > 0 && <p className="text-2xs text-warning-600">On file before discovery, not confirmed with the client: {onFile.join(", ")}. Still treated as restricted.</p>}
      <div>
        <Label htmlFor={`dq-${q}-list`}>{v ? "Securities (comma-separated)" : "Or type them (comma-separated) to record the answer"}</Label>
        <Input id={`dq-${q}-list`} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      </div>
      <Clarification q={q} client={client} />
    </Question>
  );
}

function OtherConstraints({ client }: { client: ClientProfile }) {
  const setAnswer = useAtlasStore((s) => s.setDiscoveryAnswer);
  const notDiscussed = useAtlasStore((s) => s.setDiscoveryNotDiscussed);
  const v = answerValue(client, "otherConstraints");
  const existing = client.specialInstructions ?? "";
  return (
    <Question q="otherConstraints" client={client} title="Other constraints" help="Anything else that limits the proposal (for example, a lock-up, an employer’s trading window or an ESG preference). Shown in the proposal as special instructions.">
      <ChoiceButtons
        labelledBy="dq-otherConstraints"
        choices={[notChoice, { value: "none", label: "None" }] as Choice<string>[]}
        selected={[v ? (v.text.trim() ? "" : "none") : NOT]}
        onSelect={(c) => {
          if (c === NOT) return notDiscussed("otherConstraints");
          if (existing.trim() && !confirm("Record that there are no other constraints? This clears the special instructions text.")) return;
          setAnswer("otherConstraints", { text: "" });
        }}
      />
      <div>
        <Label htmlFor="dq-otherConstraints-text">{v ? "Constraints" : "Or type them to record the answer"}</Label>
        <Textarea id="dq-otherConstraints-text" rows={2} value={v ? v.text : ""} placeholder={!v && existing ? `Earlier profile text (not confirmed): ${existing}` : undefined} onChange={(e) => setAnswer("otherConstraints", { text: e.target.value })} />
      </div>
    </Question>
  );
}
