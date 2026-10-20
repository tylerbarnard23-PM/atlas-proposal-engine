"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Section";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { COUNTRIES } from "@/domain/countryConfigs";
import { CURRENCIES } from "@/domain/currencyConfigs";

export default function ClientProfilePage() {
  return (
    <ClientOnly>
      <ClientProfileInner />
    </ClientOnly>
  );
}

function ClientProfileInner() {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const setClient = useAtlasStore((s) => s.setClient);
  const startNewClient = useAtlasStore((s) => s.startNewClient);
  const resetSeed = useAtlasStore((s) => s.resetSeed);

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
        description="Who this proposal is for: the client's details, jurisdiction, goals and constraints. Your firm's details live in Firm & Branding."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => { if (confirm("Restore the seeded Blackwell Family Office household?")) resetSeed(); }}>
              Restore sample data
            </Button>
            <Button variant="danger" size="sm" onClick={handleNewClient}>
              Start a new client
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <Select value={client.proposalOutputCurrency} onChange={(e) => setClient({ proposalOutputCurrency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Locale">
                <Input value={client.locale} onChange={(e) => setClient({ locale: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Risk tolerance">
                <Select
                  value={client.riskTolerance}
                  onChange={(e) => setClient({ riskTolerance: e.target.value as typeof client.riskTolerance })}
                >
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="growth">Growth</option>
                  <option value="aggressive">Aggressive</option>
                </Select>
              </Field>
              <Field label="Time horizon (years)">
                <Input
                  type="number"
                  value={client.timeHorizonYears}
                  onChange={(e) => setClient({ timeHorizonYears: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tax sensitivity">
                <Select
                  value={client.taxSensitivity}
                  onChange={(e) => setClient({ taxSensitivity: e.target.value as typeof client.taxSensitivity })}
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </Select>
              </Field>
            </div>
            <Field label="Investment objective">
              <Textarea
                rows={3}
                value={client.investmentObjective}
                onChange={(e) => setClient({ investmentObjective: e.target.value })}
              />
            </Field>
            <Field label="Special instructions">
              <Textarea
                rows={2}
                value={client.specialInstructions ?? ""}
                onChange={(e) => setClient({ specialInstructions: e.target.value })}
              />
            </Field>
            <Field label="Advisor discovery notes (private)">
              <Textarea
                rows={3}
                value={client.advisorDiscoveryNotes ?? ""}
                onChange={(e) => setClient({ advisorDiscoveryNotes: e.target.value })}
              />
            </Field>
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Your firm</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              {advisor.logoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={advisor.logoDataUrl} alt="" className="h-10 max-w-28 object-contain" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-ink-900 truncate">{advisor.firmName || "No firm set"}</div>
                <div className="text-[13px] text-ink-600 truncate">
                  {advisor.name || "No advisor set"}
                  {advisor.email ? ` · ${advisor.email}` : ""}
                </div>
              </div>
            </div>
            <p className="text-[13px] text-ink-600 leading-relaxed">
              Proposals are branded with your firm, not Atlas. Firm details, logo and accent color are set once in{" "}
              <span className="font-medium text-ink-800">Firm &amp; Branding</span> and reused for every client.
            </p>
            <Link href="/firm-branding">
              <Button variant="secondary" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                Edit firm &amp; branding
              </Button>
            </Link>
            <p className="text-2xs text-ink-500 leading-relaxed pt-2 border-t border-ink-100">
              The advisor remains responsible for the suitability and implementation of every recommendation in this proposal. The platform does not autonomously provide
              financial, tax, legal, or investment advice.
            </p>
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
