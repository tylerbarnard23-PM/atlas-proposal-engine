"use client";

import * as React from "react";
import Link from "next/link";
import { ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { DEFAULT_ACCENT, isCustomFirm, isValidAccentColor } from "@/domain/branding";
import { processLogoFile } from "@/utils/logoImage";
import type { AdvisorProfile } from "@/domain/types";

export default function FirmBrandingPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const advisor = useAtlasStore((s) => s.advisor);
  const client = useAtlasStore((s) => s.client);
  const setAdvisor = useAtlasStore((s) => s.setAdvisor);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [hexDraft, setHexDraft] = React.useState(advisor.accentColor ?? DEFAULT_ACCENT);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const custom = isCustomFirm(advisor);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setLogoError(null);
    try {
      setAdvisor({ logoDataUrl: await processLogoFile(file) });
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setAccent(value: string) {
    setHexDraft(value);
    if (isValidAccentColor(value)) setAdvisor({ accentColor: value.toUpperCase() });
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace · White-label"
        title="Firm & Branding"
        description="Your firm, not Atlas, is what clients see. These details brand every proposal and stay in place when you start a new client."
        actions={
          <Badge tone={custom ? "positive" : "gold"}>{custom ? "Using your firm" : "Using the sample firm"}</Badge>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Firm & advisor of record</CardTitle>
              <CardSubtitle>Shown on the proposal cover, page footers and the client profile section.</CardSubtitle>
            </CardHeader>
            <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Firm name" className="sm:col-span-2">
                <Input value={advisor.firmName} onChange={(e) => setAdvisor({ firmName: e.target.value })} />
              </Field>
              <Field label="Advisor name">
                <Input value={advisor.name} onChange={(e) => setAdvisor({ name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={advisor.email} onChange={(e) => setAdvisor({ email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={advisor.phone ?? ""} onChange={(e) => setAdvisor({ phone: e.target.value })} />
              </Field>
              <p className="sm:col-span-2 text-2xs text-ink-500 leading-relaxed">
                Disclosures refer to the adviser as <code className="bg-slatey-100 rounded px-1">[Firm]</code>. Once you replace the sample firm
                name, proposals use your firm name there instead.
              </p>
              <p className="sm:col-span-2 text-2xs text-ink-500 leading-relaxed border-t border-ink-100 pt-3">
                The advisor of record remains responsible for the suitability and implementation of every recommendation in a
                proposal. Atlas does not autonomously provide financial, tax, legal, or investment advice.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardSubtitle>PNG, JPEG or WebP. It&apos;s redrawn as a clean PNG (max 512 px, 200 KB) and stays in this browser.</CardSubtitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-20 w-40 rounded-md ring-1 ring-ink-200 bg-paper flex items-center justify-center overflow-hidden">
                  {advisor.logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={advisor.logoDataUrl} alt={`${advisor.firmName} logo`} className="max-h-16 max-w-36 object-contain" />
                  ) : (
                    <span className="text-2xs text-ink-400">No logo</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onLogo(e.target.files?.[0])}
                  />
                  <Button onClick={() => fileRef.current?.click()} loading={busy} iconLeft={<ImageUp className="h-4 w-4" />}>
                    {advisor.logoDataUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                  {advisor.logoDataUrl && (
                    <Button variant="ghost" onClick={() => setAdvisor({ logoDataUrl: undefined })} iconLeft={<Trash2 className="h-4 w-4" />}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {logoError && (
                <p role="alert" className="text-[13px] text-negative-600">{logoError}</p>
              )}
              <p className="text-2xs text-ink-500 leading-relaxed">
                Logos are never fetched from a web address: the PDF is rendered on a server, and having it load arbitrary links
                is a security risk. SVG files aren&apos;t accepted because they can contain scripts.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accent color</CardTitle>
              <CardSubtitle>Used for section labels and highlights in the proposal.</CardSubtitle>
            </CardHeader>
            <CardBody className="flex flex-wrap items-end gap-3">
              <input
                type="color"
                aria-label="Accent color"
                value={isValidAccentColor(hexDraft) ? hexDraft : DEFAULT_ACCENT}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-14 rounded-md border border-ink-200 bg-paper p-1 cursor-pointer"
              />
              <Field label="Hex">
                <Input value={hexDraft} onChange={(e) => setAccent(e.target.value.trim())} className="w-32 font-mono" maxLength={7} />
              </Field>
              <Button
                variant="ghost"
                iconLeft={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  setHexDraft(DEFAULT_ACCENT);
                  setAdvisor({ accentColor: undefined });
                }}
              >
                Default
              </Button>
              {!isValidAccentColor(hexDraft) && <span className="text-[12px] text-negative-600">Use a six-digit hex color, e.g. #1F3F6E.</span>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3 xl:sticky xl:top-20 self-start">
          <div className="text-2xs uppercase tracking-widest text-ink-500">What your clients see</div>
          <CoverPreview advisor={advisor} household={client.householdName ?? client.fullName} />
          <p className="text-2xs text-ink-500">
            Live preview of the proposal cover and a page header. See the full document in{" "}
            <Link href="/pdf-preview" className="text-navy-700 hover:underline">PDF Preview</Link>.
          </p>
        </div>
      </div>
    </>
  );
}

// A faithful miniature of the PDF cover and a body page header (same colors,
// type and layout as the print template), updated as the advisor types.
function CoverPreview({ advisor, household }: { advisor: AdvisorProfile; household: string }) {
  const accent = isValidAccentColor(advisor.accentColor) ? advisor.accentColor : DEFAULT_ACCENT;
  return (
    <div className="rounded-lg overflow-hidden shadow-elevated ring-1 ring-ink-100">
      <div
        className="aspect-[8.5/7] p-7 flex flex-col justify-between text-white"
        style={{ background: "radial-gradient(circle at 80% 0%, rgba(212,180,90,0.18), transparent 45%), linear-gradient(135deg, #0A1628 0%, #172F52 60%, #2A538E 100%)" }}
      >
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] font-semibold text-white/70">Confidential Wealth Proposal</div>
          {advisor.logoDataUrl && (
            <div className="inline-flex bg-white rounded-md px-2.5 py-1.5 mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={advisor.logoDataUrl} alt="" className="max-h-8 max-w-32 object-contain" />
            </div>
          )}
          <div className="font-serif text-[15px] mt-2.5 text-white/90">{advisor.firmName || "Your firm name"}</div>
        </div>
        <div>
          <div className="font-serif text-[22px] leading-tight">{household || "Client household"}</div>
          <div className="mt-3 text-[9px] uppercase tracking-[0.18em] text-white/60">Advisor</div>
          <div className="text-[11px]">{advisor.name || "Advisor name"}</div>
          <div className="text-[11px] text-white/80">{advisor.email}</div>
          <span className="inline-block mt-3 rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[9px] text-[#F1E7C7]">
            SAMPLE — demonstration only
          </span>
        </div>
      </div>
      <div className="bg-white px-5 py-3 flex items-baseline justify-between border-t border-ink-100">
        <div className="font-serif text-[12px] text-ink-900">
          <span className="text-[8px] uppercase tracking-[0.16em] font-semibold mr-2" style={{ color: accent }}>01</span>
          Executive Summary
        </div>
        <div className="flex items-center gap-2">
          {advisor.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={advisor.logoDataUrl} alt="" className="max-h-4 max-w-16 object-contain" />
          )}
          <span className="text-[8px] uppercase tracking-[0.14em] text-ink-500">{household}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
