"use client";

import * as React from "react";
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
  const setAdvisor = useAtlasStore((s) => s.setAdvisor);

  return (
    <>
      <PageHeader
        eyebrow="Engagement"
        title="Client & Advisor Profile"
        description="Configure who the proposal is for, what jurisdiction it serves, and the advisor of record."
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

        <Card>
          <CardHeader>
            <CardTitle>Advisor of Record</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Advisor name">
              <Input value={advisor.name} onChange={(e) => setAdvisor({ name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={advisor.email} onChange={(e) => setAdvisor({ email: e.target.value })} />
            </Field>
            <Field label="Firm name">
              <Input value={advisor.firmName} onChange={(e) => setAdvisor({ firmName: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={advisor.phone ?? ""} onChange={(e) => setAdvisor({ phone: e.target.value })} />
            </Field>
            <Field label="Logo URL (optional)">
              <Input value={advisor.firmLogoUrl ?? ""} onChange={(e) => setAdvisor({ firmLogoUrl: e.target.value })} />
            </Field>
            <p className="text-2xs text-ink-500 leading-relaxed pt-2">
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
