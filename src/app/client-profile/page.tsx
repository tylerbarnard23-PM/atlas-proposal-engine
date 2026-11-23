"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Section";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { COUNTRIES } from "@/domain/countryConfigs";
import { CURRENCIES } from "@/domain/currencyConfigs";
import { hasMoneyAmounts, recommendationsInOtherCurrencies } from "@/engines/recommendationAmounts";
import { clientBrief } from "@/engines/clientDiscovery";
import { movedDiscoveryLink, OBJECTIVES_PATH } from "@/components/profile/objectivesLinks";

export default function ClientProfilePage() {
  // #111: discovery moved to Client objectives; a link saved to its old anchor here still lands on it,
  // whether it opens this page or changes only the hash of a page already open.
  const router = useRouter();
  React.useEffect(() => {
    const forward = () => {
      const moved = movedDiscoveryLink(window.location.hash);
      if (moved) router.replace(moved);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router]);
  return (
    <ClientOnly>
      <ClientProfileInner />
    </ClientOnly>
  );
}

function ClientProfileInner() {
  const client = useAtlasStore((s) => s.client);
  const setClient = useAtlasStore((s) => s.setClient);
  const startNewClient = useAtlasStore((s) => s.startNewClient);
  const resetSeed = useAtlasStore((s) => s.resetSeed);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const brief = clientBrief(client);
  const elsewhere = recommendationsInOtherCurrencies(recommendations, client.proposalOutputCurrency);

  // Recommendation amounts keep the currency they were entered in; a new
  // output currency converts them at the workspace's rates, never relabels.
  function changeOutputCurrency(to: string) {
    const affected = recommendations.filter((r) => r.status !== "excluded" && hasMoneyAmounts(r) && r.currency !== to);
    if (affected.length > 0) {
      const currencies = [...new Set(affected.map((r) => r.currency))].join(", ");
      const ok = confirm(
        `Report this proposal in ${to}?

${affected.length} recommendation${affected.length === 1 ? " has" : "s have"} amounts in ${currencies}. ` +
          `They stay in ${currencies} and are converted into ${to} at the workspace's current exchange rates (each card shows the rate used). ` +
          "Nothing is relabelled. Edit a recommendation if its amount should be different."
      );
      if (!ok) return;
    }
    setClient({ proposalOutputCurrency: to });
  }

  function handleNewClient() {
    if (
      confirm(
        "Start a new client?\n\n" +
          "This clears the client profile, accounts, holdings, recommendations, source documents and PDF history. " +
          "Your firm & branding are kept. This can't be undone."
      )
    ) {
      startNewClient();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Engagement"
        title="Client Profile"
        description="Who this proposal is for: the client's identity, household, jurisdiction, tax residency and currencies. The client's objectives, needs and constraints are recorded on Client objectives."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Restore the fictional Blackwell Family Office sample?\n\nThis replaces the current workspace. The sample starts with no recommendations.")) resetSeed();
              }}
            >
              Restore sample data
            </Button>
            <Button variant="danger" size="sm" onClick={handleNewClient}>
              Start a new client
            </Button>
          </>
        }
      />

      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Full name">
              <Input value={client.fullName} onChange={(e) => setClient({ fullName: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred name">
                <Input
                  value={client.preferredName ?? ""}
                  onChange={(e) => setClient({ preferredName: e.target.value })}
                />
              </Field>
              <Field label="Household name">
                <Input
                  value={client.householdName ?? ""}
                  onChange={(e) => setClient({ householdName: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Country of residence">
                <Select value={client.countryOfResidence} onChange={(e) => setClient({ countryOfResidence: e.target.value })}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tax residency">
                <Select value={client.taxResidency} onChange={(e) => setClient({ taxResidency: e.target.value })}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reporting country">
                <Select value={client.reportingCountry} onChange={(e) => setClient({ reportingCountry: e.target.value })}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Base currency">
                <Select value={client.baseCurrency} onChange={(e) => setClient({ baseCurrency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Output currency">
                <Select value={client.proposalOutputCurrency} onChange={(e) => changeOutputCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
                {elsewhere.length > 0 && (
                  <p className="mt-1 text-2xs text-ink-500">
                    {elsewhere.length} recommendation{elsewhere.length === 1 ? " has" : "s have"} amounts in{" "}
                    {[...new Set(elsewhere.map((r) => r.currency))].join(", ")}, converted into {client.proposalOutputCurrency} at current
                    workspace rates.
                  </p>
                )}
              </Field>
              <Field label="Locale">
                <Input value={client.locale} onChange={(e) => setClient({ locale: e.target.value })} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card data-testid="objectives-pointer">
          <CardHeader>
            <CardTitle>Client objectives</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-700">
            <span>
              {brief.counts.answered} of {brief.counts.total} discovery questions answered · {brief.counts.reviewed} reviewed
              {brief.counts.stale ? ` · ${brief.counts.stale} changed since review` : ""}
            </span>
            <Link href={OBJECTIVES_PATH} className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
              Record or review client objectives <ArrowRight className="h-4 w-4" />
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={() => alert("Profile saved to local persistence.")}>Saved automatically</Button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
