"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, FilePlus2, Wallet, ShieldAlert, CheckCircle2, ArrowRight, CheckCheck } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { HoldingsTable } from "@/components/tables/HoldingsTable";
import { ACCOUNT_TYPE_GROUPS, ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { COUNTRIES } from "@/domain/countryConfigs";
import { CURRENCIES } from "@/domain/currencyConfigs";
import type { Account, AccountType, AssetClass, Holding } from "@/domain/types";
import { formatCurrency, formatDate, safeId, todayIso } from "@/utils/formatting";
import { QuoteTypeBadge, ValuationSourceLine } from "@/components/ui/SourceTag";
import { holdingsNeedingReview, type ReviewReason } from "@/engines/complianceEngine";
import { cn } from "@/utils/cn";

const REASON_LABEL: Record<ReviewReason, string> = {
  unverified: "Value not confirmed",
  stale: "Price out of date",
  mock: "Placeholder price",
};

export default function AccountsAssetsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const accounts = useAtlasStore((s) => s.accounts);
  const upsertAccount = useAtlasStore((s) => s.upsertAccount);
  const removeAccount = useAtlasStore((s) => s.removeAccount);
  const upsertHolding = useAtlasStore((s) => s.upsertHolding);
  const removeHolding = useAtlasStore((s) => s.removeHolding);
  const { holdings, reportingCurrency } = useNormalizedHoldings();
  const [active, setActive] = React.useState<Holding | null>(null);
  const [addAccountOpen, setAddAccountOpen] = React.useState(false);
  const [addHoldingOpen, setAddHoldingOpen] = React.useState(false);
  const [presetAccountId, setPresetAccountId] = React.useState<string | undefined>();
  const pending = holdingsNeedingReview(holdings);
  const setVerification = useAtlasStore((s) => s.setHoldingsVerification);
  const accountName = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  // Confirm all covers only holdings whose price isn't stale or a placeholder;
  // those need opening one by one.
  const bulkConfirmable = pending.filter((p) => p.reasons.length === 1);
  const [bulkConfirmed, setBulkConfirmed] = React.useState<string[] | null>(null);
  function confirmAll() {
    const total = bulkConfirmable.reduce((s, p) => s + (p.holding.reportingMarketValue ?? p.holding.nativeMarketValue), 0);
    const held = pending.length - bulkConfirmable.length;
    const ok = confirm(
      `Confirm the values of ${bulkConfirmable.length} holding${bulkConfirmable.length === 1 ? "" : "s"} ` +
        `(${formatCurrency(total, reportingCurrency, { compact: true })} in total) as shown in the list?

` +
        "Only do this if you've checked them against their source documents." +
        (held ? `

${held} holding${held === 1 ? " has" : "s have"} an out-of-date or placeholder price and must be checked one by one.` : "")
    );
    if (!ok) return;
    const ids = bulkConfirmable.map((p) => p.holding.id);
    setVerification(ids, "advisor_approved");
    setBulkConfirmed(ids);
  }
  // Readiness "Fix in…" links land here with ?review=1; highlight the queue
  // and bring it into view so the next step is obvious.
  const reviewRef = React.useRef<HTMLDivElement>(null);
  const [focusReview, setFocusReview] = React.useState(false);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("review") === "1") {
      setFocusReview(true);
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function openHoldingForAccount(accountId: string) {
    setPresetAccountId(accountId);
    setAddHoldingOpen(true);
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Accounts & Assets"
        description="Add accounts and holdings, drill into source and valuation, and prepare positions for the proposal."
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft={<Wallet className="h-4 w-4" />}
              onClick={() => setAddAccountOpen(true)}
            >
              Add account
            </Button>
            <Button
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={() => {
                setPresetAccountId(undefined);
                setAddHoldingOpen(true);
              }}
              disabled={accounts.length === 0}
              title={accounts.length === 0 ? "Add an account first" : undefined}
            >
              Add holding
            </Button>
          </>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add a brokerage, IRA, trust, crypto wallet, real-estate schedule, or any other account to begin building this engagement."
          icon={<Wallet className="h-8 w-8" />}
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Button onClick={() => setAddAccountOpen(true)} iconLeft={<Plus className="h-4 w-4" />}>
                Add your first account
              </Button>
              <Link href="/import-center">
                <Button variant="secondary" iconLeft={<FilePlus2 className="h-4 w-4" />}>
                  Import from CSV / statement
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {accounts.map((a) => {
              const acctValue = holdings
                .filter((h) => h.accountId === a.id)
                .reduce((acc, h) => acc + (h.reportingMarketValue ?? h.nativeMarketValue ?? 0), 0);
              return (
                <Card key={a.id} className="group">
                  <CardBody>
                    <div className="text-2xs uppercase tracking-widest text-ink-500">{ACCOUNT_TYPE_LABELS[a.type]}</div>
                    <div className="text-[13px] font-medium text-ink-900 mt-0.5 truncate">{a.name}</div>
                    <div className="text-2xs text-ink-500 mt-0.5 truncate">{a.institution ?? "—"}</div>
                    <div className="font-serif text-lg tabular text-ink-900 mt-1.5">{formatCurrency(acctValue, reportingCurrency, { compact: true })}</div>
                    <div className="text-2xs text-ink-500 mb-2">{a.baseCurrency} · {a.country ?? "—"}</div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openHoldingForAccount(a.id)}
                      >
                        + Holding
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-negative-500 hover:bg-negative-50"
                        onClick={() => {
                          if (confirm(`Remove account "${a.name}" and all its holdings?`)) removeAccount(a.id);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {bulkConfirmed && (
            <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-4 py-2.5 text-[13px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-positive-600">
                <CheckCircle2 className="h-4 w-4" />
                Confirmed {bulkConfirmed.length} holding value{bulkConfirmed.length === 1 ? "" : "s"}.
              </span>
              <button
                className="font-medium text-navy-700 hover:underline"
                onClick={() => {
                  setVerification(bulkConfirmed, "unverified");
                  setBulkConfirmed(null);
                }}
              >
                Undo
              </button>
              <Link href="/pdf-preview" className="font-medium text-navy-700 hover:underline">Check readiness in PDF Preview →</Link>
              <button className="ml-auto text-ink-500 hover:text-ink-800" onClick={() => setBulkConfirmed(null)}>Dismiss</button>
            </div>
          )}

          {pending.length > 0 && (
            <div ref={reviewRef} className="mb-4 scroll-mt-20">
              <Card className={cn(focusReview && "ring-2 ring-warning-500/60")}>
                <CardHeader className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning-500" />
                  <CardTitle>Confirm holding values · {pending.length} holding{pending.length === 1 ? "" : "s"}</CardTitle>
                </CardHeader>
                <CardBody className="space-y-2">
                  <p className="text-[13px] text-ink-600">
                    Check that each holding&apos;s value is correct before it goes into a client document. Compare the value
                    and source shown with the statement, then click <span className="font-medium text-ink-800">Confirm</span>. To
                    correct a value or see more detail, click <span className="font-medium text-ink-800">Check value</span>.
                  </p>
                  <p className="text-[12px] text-ink-500">
                    This is a data check, not a recommendation review. Recommendations are approved separately on{" "}
                    <Link href="/recommendations" className="font-medium text-navy-700 hover:underline">Recommendations →</Link>
                  </p>
                  {bulkConfirmable.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slatey-50 px-3 py-2">
                      <span className="text-[12px] text-ink-600">
                        Checked them all against the source? Confirm the {bulkConfirmable.length} values shown below in one step.
                      </span>
                      <Button size="sm" variant="secondary" iconLeft={<CheckCheck className="h-4 w-4" />} onClick={confirmAll}>
                        Confirm all ({bulkConfirmable.length})
                      </Button>
                    </div>
                  )}
                  <ul className="divide-y divide-ink-100">
                    {pending.map(({ holding, reasons }) => (
                      <li key={holding.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-ink-900 truncate">{holding.assetName}</div>
                          <div className="text-[12px] text-ink-500 truncate">
                            <span className="tabular font-medium text-ink-800">
                              {formatCurrency(holding.nativeMarketValue, holding.currency)}
                            </span>
                            {accountName[holding.accountId] && accountName[holding.accountId] !== holding.assetName && (
                              <> · {accountName[holding.accountId]}</>
                            )}
                            {" · "}
                            {holding.valuationSource.note ?? holding.valuationSource.kind} · as of {formatDate(holding.valuationDate)}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {reasons.map((r) => (
                              <Badge key={r} tone="warning">{REASON_LABEL[r]}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setActive(holding)}>Check value</Button>
                          {reasons.length === 1 && (
                            <Button size="sm" onClick={() => setVerification([holding.id], "advisor_approved")}>Confirm</Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>
          )}

          <SectionDivider>All Holdings</SectionDivider>

          {holdings.length === 0 ? (
            <EmptyState
              title="No holdings in this engagement yet"
              description="Add holdings manually or import them from CSV, Excel, PDF, or a screenshot."
              action={
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button onClick={() => setAddHoldingOpen(true)} iconLeft={<Plus className="h-4 w-4" />}>
                    Add a holding
                  </Button>
                  <Link href="/import-center">
                    <Button variant="secondary">Open Import Center</Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <HoldingsTable
              holdings={holdings}
              accounts={accounts}
              reportingCurrency={reportingCurrency}
              onRowClick={(h) => setActive(h)}
            />
          )}
        </>
      )}

      <Drawer open={!!active} onClose={() => setActive(null)} title="Holding Detail" width="max-w-2xl">
        {active && (
          <HoldingDetail
            key={active.id}
            holding={active}
            pendingCount={pending.filter((p) => p.holding.id !== active.id).length}
            onNext={() => {
              const next = pending.find((p) => p.holding.id !== active.id);
              if (next) setActive(next.holding);
            }}
            onSave={(patch) => {
              const updated: Holding = { ...active, ...patch, updatedAt: new Date().toISOString() };
              upsertHolding(updated);
              setActive(updated);
            }}
            onRemove={() => {
              if (confirm("Remove this holding?")) {
                removeHolding(active.id);
                setActive(null);
              }
            }}
          />
        )}
      </Drawer>

      <Drawer open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title="Add account" width="max-w-lg">
        <AddAccountForm
          onCancel={() => setAddAccountOpen(false)}
          onSave={(account) => {
            upsertAccount(account);
            setAddAccountOpen(false);
            setPresetAccountId(account.id);
          }}
        />
      </Drawer>

      <Drawer
        open={addHoldingOpen}
        onClose={() => setAddHoldingOpen(false)}
        title="Add holding"
        width="max-w-xl"
      >
        <AddHoldingForm
          accounts={accounts}
          presetAccountId={presetAccountId}
          onCancel={() => setAddHoldingOpen(false)}
          onSave={(holding) => {
            upsertHolding(holding);
            setAddHoldingOpen(false);
          }}
        />
      </Drawer>
    </>
  );
}

const VERIFICATION: Record<
  Holding["advisorVerification"],
  { label: string; tone: "warning" | "positive" | "navy" | "negative" | "neutral" }
> = {
  unverified: { label: "Value not confirmed", tone: "warning" },
  advisor_reviewed: { label: "Value reviewed", tone: "neutral" },
  advisor_approved: { label: "Value confirmed", tone: "positive" },
  locked_for_proposal: { label: "Locked for proposal", tone: "navy" },
  rejected: { label: "Rejected", tone: "negative" },
};

function HoldingDetail({
  holding,
  pendingCount,
  onNext,
  onSave,
  onRemove,
}: {
  holding: Holding;
  pendingCount: number;
  onNext: () => void;
  onSave: (patch: Partial<Holding>) => void;
  onRemove: () => void;
}) {
  const [override, setOverride] = React.useState(holding.nativeMarketValue);
  const [notes, setNotes] = React.useState(holding.advisorNotes ?? "");
  // Confirmation for the last action, so a click visibly does something.
  const [done, setDone] = React.useState<string | null>(null);
  const review = holdingsNeedingReview([holding])[0];
  const status = VERIFICATION[holding.advisorVerification];
  const isApproved = holding.advisorVerification === "advisor_approved";
  const isLocked = holding.advisorVerification === "locked_for_proposal";
  const act = (message: string, patch: Partial<Holding>) => {
    onSave(patch);
    setDone(message);
  };
  return (
    <div className="space-y-5">
      {done && (
        <div role="status" className="rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-3 py-2.5 text-[13px]">
          <div className="flex items-center gap-1.5 font-semibold text-positive-600">
            <CheckCircle2 className="h-4 w-4" /> {done}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-700">
            {pendingCount > 0 ? (
              <>
                <span>{pendingCount} more holding value{pendingCount === 1 ? "" : "s"} to confirm.</span>
                <Button size="sm" onClick={onNext} iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                  Next holding
                </Button>
              </>
            ) : (
              <>
                <span>All holding values confirmed.</span>
                <Link href="/pdf-preview" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                  Back to PDF Preview <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      )}
      {!done && review && (
        <div className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/30 px-3 py-2.5 text-[13px] text-ink-800">
          <div className="font-semibold text-warning-600">
            Blocks the final PDF: {review.reasons.map((r) => REASON_LABEL[r].toLowerCase()).join(", ")}
          </div>
          <p className="mt-0.5 text-ink-600">
            Check the value and valuation source below, then click <span className="font-medium">Confirm value</span>, or
            enter a corrected value and click <span className="font-medium">Save advisor override</span>.
          </p>
        </div>
      )}
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-500">{ASSET_CLASS_LABELS[holding.assetClass]}</div>
        <h3 className="font-serif text-2xl text-ink-900 leading-tight">{holding.assetName}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          {holding.identifier && <Badge tone="navy">{holding.identifier.type}: {holding.identifier.value}</Badge>}
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="neutral">{holding.currency}</Badge>
          {holding.country && <Badge tone="neutral">{holding.country}</Badge>}
          <QuoteTypeBadge type={holding.quoteType ?? "manual"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Stat label="Quantity" value={holding.quantity != null ? holding.quantity.toLocaleString() : "—"} />
        <Stat label="Price" value={holding.price != null ? formatCurrency(holding.price, holding.currency) : "—"} />
        <Stat label="Native value" value={formatCurrency(holding.nativeMarketValue, holding.currency)} />
        <Stat label="Reporting value" value={formatCurrency(holding.reportingMarketValue ?? holding.nativeMarketValue, "USD")} />
        <Stat label="Cost basis" value={holding.costBasis != null ? formatCurrency(holding.costBasis, holding.currency) : "—"} />
        <Stat label="Liquidity" value={holding.liquidity ?? "—"} />
        <Stat label="Valuation date" value={formatDate(holding.valuationDate)} />
        <Stat label="Value status" value={status.label} />
      </div>

      <div className="border-t border-ink-100 pt-4">
        <div className="text-2xs uppercase tracking-widest text-ink-500 mb-1.5">Valuation Source</div>
        <ValuationSourceLine source={holding.valuationSource} />
        {holding.valuationSource.note && <div className="text-2xs text-ink-500 mt-0.5">{holding.valuationSource.note}</div>}
      </div>

      <div className="border-t border-ink-100 pt-4 space-y-3">
        <Label>Advisor override (native value)</Label>
        <Input value={override} onChange={(e) => setOverride(Number(e.target.value))} />
        <Label>Advisor notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {/* Buttons show the holding's current state so a click visibly lands. */}
          <Button
            variant={isApproved ? "secondary" : "primary"}
            disabled={isApproved}
            className={cn(isApproved && "bg-positive-50 border-positive-500/50 text-positive-600 disabled:opacity-100 disabled:cursor-default")}
            iconLeft={isApproved ? <CheckCircle2 className="h-4 w-4" /> : undefined}
            onClick={() =>
              act("Value confirmed.", { advisorVerification: "advisor_approved", advisorNotes: notes || holding.advisorNotes })
            }
          >
            {isApproved ? "Value confirmed" : "Confirm value"}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              act("Override saved and marked reviewed.", {
                nativeMarketValue: override,
                advisorNotes: notes,
                valuationSource: { kind: "advisor_override", asOf: new Date().toISOString(), confidence: "high" },
                quoteType: "advisor_entered",
                priceFreshness: "manual",
                advisorVerification: "advisor_reviewed",
              })
            }
          >
            Save advisor override
          </Button>
          <Button
            variant="secondary"
            disabled={isLocked}
            className={cn(isLocked && "bg-navy-50 border-navy-200 text-navy-700 disabled:opacity-100 disabled:cursor-default")}
            iconLeft={isLocked ? <CheckCircle2 className="h-4 w-4" /> : undefined}
            onClick={() =>
              act("Value locked for the proposal.", {
                advisorVerification: "locked_for_proposal",
                proposalApprovedValue: {
                  amount: holding.nativeMarketValue,
                  currency: holding.currency,
                  source: holding.valuationSource,
                  lockedAt: new Date().toISOString(),
                },
              })
            }
          >
            {isLocked ? "Locked for proposal" : "Lock for proposal"}
          </Button>
          <Button variant="ghost" onClick={onRemove}>Remove holding</Button>
        </div>
        <dl className="text-2xs text-ink-500 leading-relaxed space-y-0.5">
          <div><dt className="inline font-medium text-ink-700">Confirm value:</dt> <dd className="inline">you&apos;ve checked the current value and it&apos;s right for the proposal.</dd></div>
          <div><dt className="inline font-medium text-ink-700">Save advisor override:</dt> <dd className="inline">replaces the value with the one entered above.</dd></div>
          <div><dt className="inline font-medium text-ink-700">Lock for proposal:</dt> <dd className="inline">freezes today&apos;s value so later price refreshes don&apos;t change the proposal.</dd></div>
        </dl>
      </div>

      {holding.dataQuality.length > 0 && (
        <div className="border-t border-ink-100 pt-4">
          <div className="text-2xs uppercase tracking-widest text-ink-500 mb-1.5">Data Quality Flags</div>
          <ul className="space-y-1.5">
            {holding.dataQuality.map((d, i) => (
              <li key={i} className="text-[13px] flex items-start gap-2">
                <Badge tone={d.severity === "critical" ? "negative" : d.severity === "warning" ? "warning" : "neutral"}>{d.severity}</Badge>
                <span>{d.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-500">{label}</div>
      <div className="text-ink-900 tabular">{value}</div>
    </div>
  );
}

function AddAccountForm({
  onSave,
  onCancel,
}: {
  onSave: (a: Account) => void;
  onCancel: () => void;
}) {
  const client = useAtlasStore((s) => s.client);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("brokerage");
  const [institution, setInstitution] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [currency, setCurrency] = React.useState(client.baseCurrency || "USD");
  const [country, setCountry] = React.useState(client.reportingCountry || "US");

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    const now = todayIso();
    const masked = accountNumber ? "•••• " + accountNumber.slice(-4) : undefined;
    onSave({
      id: safeId("acc"),
      name: name.trim(),
      type,
      institution: institution.trim() || undefined,
      accountNumberMasked: masked,
      baseCurrency: currency,
      country,
      asOf: now.slice(0, 10),
      isLiabilityAccount: type === "liability_account",
      createdAt: now,
      updatedAt: now,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Accounts hold individual assets. Pick the type that matches the custodian or context (e.g. brokerage, IRA, trust, crypto wallet, real-estate schedule, liability).</p>
      <Label>Account name *</Label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Smith Family — Joint Brokerage"
        autoFocus
      />
      <Label>Account type</Label>
      <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {ACCOUNT_TYPE_GROUPS.flatMap((g) => [
          <option key={`grp-${g.label}`} disabled>
            ── {g.label} ──
          </option>,
          ...g.types.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          )),
        ])}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Institution / custodian</Label>
          <Input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Fidelity, Schwab, Pictet..."
          />
        </div>
        <div>
          <Label>Account # (last 4)</Label>
          <Input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="1234"
            maxLength={4}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Base currency</Label>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Country</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-3 border-t border-ink-100 mt-2">
        <Button onClick={save} disabled={!canSave}>
          Add account
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddHoldingForm({
  accounts,
  presetAccountId,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  presetAccountId?: string;
  onSave: (h: Holding) => void;
  onCancel: () => void;
}) {
  const client = useAtlasStore((s) => s.client);
  const [accountId, setAccountId] = React.useState<string>(presetAccountId ?? accounts[0]?.id ?? "");
  React.useEffect(() => {
    if (presetAccountId) setAccountId(presetAccountId);
  }, [presetAccountId]);
  const account = accounts.find((a) => a.id === accountId);

  const [assetName, setAssetName] = React.useState("");
  const [symbol, setSymbol] = React.useState("");
  const [assetClass, setAssetClass] = React.useState<AssetClass>("equity");
  const [currency, setCurrency] = React.useState(account?.baseCurrency ?? client.baseCurrency ?? "USD");
  const [country, setCountry] = React.useState(account?.country ?? client.reportingCountry ?? "US");
  const [quantity, setQuantity] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [marketValue, setMarketValue] = React.useState("");
  const [costBasis, setCostBasis] = React.useState("");
  const [valuationDate, setValuationDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");

  // When account changes, default currency/country to that account's defaults if user hasn't typed yet.
  React.useEffect(() => {
    if (account) {
      setCurrency(account.baseCurrency);
      if (account.country) setCountry(account.country);
    }
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !!accountId && assetName.trim().length > 0;
  const computedValue =
    marketValue !== ""
      ? Number(marketValue)
      : quantity !== "" && price !== ""
      ? Number(quantity) * Number(price)
      : 0;

  function save() {
    if (!canSave) return;
    const now = todayIso();
    const isLiability = assetClass === "liability";
    const sign = isLiability && computedValue > 0 ? -1 : 1;
    const h: Holding = {
      id: safeId("h"),
      accountId,
      assetName: assetName.trim(),
      identifier: symbol.trim() ? { type: "ticker", value: symbol.trim().toUpperCase() } : undefined,
      assetClass,
      country,
      currency,
      quantity: quantity ? Number(quantity) : undefined,
      price: price ? Number(price) : undefined,
      nativeMarketValue: sign * Math.abs(computedValue || 0),
      costBasis: costBasis ? Number(costBasis) : undefined,
      valuationDate,
      valuationSource: { kind: "advisor_entered", asOf: valuationDate, confidence: "high" },
      quoteType: "advisor_entered",
      priceFreshness: "manual",
      advisorVerification: "advisor_reviewed",
      advisorNotes: notes.trim() || undefined,
      isLiability,
      dataQuality: [],
      createdAt: now,
      updatedAt: now,
    };
    onSave(h);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Add any asset — public or private, in any currency. Symbols are optional; manual valuations and liabilities are first-class.</p>

      <Label>Account *</Label>
      <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.baseCurrency})
          </option>
        ))}
      </Select>

      <Label>Asset name *</Label>
      <Input
        value={assetName}
        onChange={(e) => setAssetName(e.target.value)}
        placeholder="Apple Inc., Cambridge Residence, Cambridge Growth Partners IV..."
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Symbol (optional)</Label>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL, BTC..." />
        </div>
        <div>
          <Label>Asset class</Label>
          <Select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
            {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Currency</Label>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Country</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Quantity</Label>
          <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label>Price</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label>Market value</Label>
          <Input
            value={marketValue}
            onChange={(e) => setMarketValue(e.target.value)}
            inputMode="decimal"
            placeholder={quantity && price ? String(Number(quantity) * Number(price)) : ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cost basis (optional)</Label>
          <Input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label>Valuation date</Label>
          <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} />
        </div>
      </div>

      <Label>Advisor notes</Label>
      <Textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Sponsor reporting cadence, restrictions, valuation method..."
      />

      <div className="text-xs text-ink-500 pt-1">
        Will save as <span className="text-ink-900 tabular">{formatCurrency(computedValue, currency)}</span> in {account?.name ?? "—"}.
        {assetClass === "liability" && computedValue !== 0 && (
          <span className="text-warning-600 ml-1">Stored as a negative balance.</span>
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-ink-100 mt-2">
        <Button onClick={save} disabled={!canSave}>
          Add holding
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
