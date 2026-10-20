import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LEGACY_SAMPLE_FIRM_NAME,
  LOGO_MAX_BYTES,
  SAMPLE_FIRM_NAME,
  accentTint,
  checkLogoDataUrl,
  isCustomFirm,
  isValidAccentColor,
  resolveFirmPlaceholder,
} from "@/domain/branding";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import type { AdvisorProfile, Proposal } from "@/domain/types";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const b64 = (bytes: number[] | string) => Buffer.from(bytes as never).toString("base64");

describe("firm identity", () => {
  it("treats the sample firms and an empty name as not customized", () => {
    expect(isCustomFirm({ firmName: SAMPLE_FIRM_NAME })).toBe(false);
    expect(isCustomFirm({ firmName: LEGACY_SAMPLE_FIRM_NAME })).toBe(false);
    expect(isCustomFirm({ firmName: "  " })).toBe(false);
    expect(isCustomFirm({ firmName: "Cedar Ridge Advisors" })).toBe(true);
  });

  it("keeps [Firm] for the sample firm and fills it in for a real one", () => {
    const text = "[Firm]'s fees are in [Firm]'s Form ADV.";
    expect(resolveFirmPlaceholder(text, { firmName: SAMPLE_FIRM_NAME })).toBe(text);
    expect(resolveFirmPlaceholder(text, { firmName: "Cedar Ridge Advisors" })).toBe(
      "Cedar Ridge Advisors's fees are in Cedar Ridge Advisors's Form ADV."
    );
  });
});

describe("accent color", () => {
  it("accepts only six-digit hex", () => {
    expect(isValidAccentColor("#1F3F6E")).toBe(true);
    for (const bad of ["red", "#123", "#12345G", "1F3F6E", "#1F3F6E;}body{display:none}", "", undefined, 123]) {
      expect(isValidAccentColor(bad)).toBe(false);
    }
  });

  it("produces a lighter tint for dark backgrounds", () => {
    expect(accentTint("#000000", 0.5)).toBe("#808080");
    expect(accentTint("#FFFFFF")).toBe("#ffffff");
  });
});

describe("logo validation", () => {
  it("accepts real PNG, JPEG and WebP data", () => {
    expect(checkLogoDataUrl(PNG_1x1).ok).toBe(true);
    expect(checkLogoDataUrl(`data:image/jpeg;base64,${b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])}`).ok).toBe(true);
    expect(checkLogoDataUrl(`data:image/webp;base64,${b64("RIFF\x1a\x00\x00\x00WEBPVP8 ")}`).ok).toBe(true);
  });

  it("refuses SVG, remote URLs and script URLs", () => {
    expect(checkLogoDataUrl(`data:image/svg+xml;base64,${b64("<svg onload='alert(1)'/>")}`).ok).toBe(false);
    expect(checkLogoDataUrl("https://example.com/logo.png").ok).toBe(false);
    expect(checkLogoDataUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(checkLogoDataUrl("javascript:alert(1)").ok).toBe(false);
    expect(checkLogoDataUrl(undefined).ok).toBe(false);
  });

  it("refuses content that doesn't match its claimed type", () => {
    const jpegBytes = b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
    expect(checkLogoDataUrl(`data:image/png;base64,${jpegBytes}`).ok).toBe(false);
    expect(checkLogoDataUrl(`data:image/png;base64,${b64("<html><script>")}`).ok).toBe(false);
  });

  it("refuses logos over the size limit", () => {
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(big);
    const res = checkLogoDataUrl(`data:image/png;base64,${big.toString("base64")}`);
    expect(res.ok).toBe(false);
  });
});

describe("branding in the proposal", () => {
  const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD");
  const render = (advisor: AdvisorProfile) =>
    renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: SEED_CLIENT,
        advisor,
        accounts: SEED_ACCOUNTS,
        holdings,
        recommendations: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY.filter((d) => d.required),
        proposal: { id: "p" } as Proposal,
        variant: "final",
      })
    );

  it("shows a valid logo and applies a valid accent", () => {
    const html = render({ ...SEED_ADVISOR, firmName: "Cedar Ridge Advisors", logoDataUrl: PNG_1x1, accentColor: "#1F3F6E" });
    expect(html).toContain(PNG_1x1);
    expect(html).toContain("--gold-500:#1F3F6E");
    expect(html).toContain("Cedar Ridge Advisors&#x27;s advisory fees");
    expect(html).not.toContain("[Firm]");
  });

  it("drops an invalid logo or accent instead of rendering it", () => {
    const html = render({ ...SEED_ADVISOR, logoDataUrl: "https://evil.example/x.png", accentColor: "red;}*{display:none" });
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("display:none");
  });

  it("leaves [Firm] in place for the sample firm", () => {
    expect(render(SEED_ADVISOR)).toContain("[Firm]");
  });
});

describe("PDF API branding checks", () => {
  const post = async (advisor: Partial<AdvisorProfile>) => {
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const res = await POST(
      new Request("http://localhost/api/proposals/p/generate-pdf?variant=draft", {
        method: "POST",
        body: JSON.stringify({ state: { client: SEED_CLIENT, advisor: { ...SEED_ADVISOR, ...advisor }, proposal: { id: "p" } } }),
      }),
      { params: Promise.resolve({ id: "p" }) }
    );
    return { status: res.status, body: await res.json() };
  };

  it("rejects a remote logo URL before rendering anything", async () => {
    const res = await post({ logoDataUrl: "http://169.254.169.254/latest/meta-data" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid firm logo/);
  });

  it("rejects an SVG logo", async () => {
    expect((await post({ logoDataUrl: `data:image/svg+xml;base64,${b64("<svg/>")}` })).status).toBe(400);
  });

  it("rejects an accent color that isn't hex", async () => {
    const res = await post({ accentColor: "#fff;}body{display:none" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/accent color/);
  });
});

describe("saved workspace migration (v4)", () => {
  it("renames the legacy sample firm and drops the remote logo URL", async () => {
    const { migrateAtlasState } = await import("@/store/useStore");
    const old = {
      advisor: { ...SEED_ADVISOR, firmName: LEGACY_SAMPLE_FIRM_NAME, email: "mwhitfield@atlas-advisors.example", firmLogoUrl: "https://x/logo.png" },
    };
    const next = migrateAtlasState(old, 3);
    expect(next.advisor.firmName).toBe(SAMPLE_FIRM_NAME);
    expect(next.advisor.email).toBe(SEED_ADVISOR.email);
    expect("firmLogoUrl" in next.advisor).toBe(false);
  });

  it("leaves an adviser's own firm alone", async () => {
    const { migrateAtlasState } = await import("@/store/useStore");
    const next = migrateAtlasState({ advisor: { ...SEED_ADVISOR, firmName: "Cedar Ridge Advisors" } }, 3);
    expect(next.advisor.firmName).toBe("Cedar Ridge Advisors");
  });
});

describe("start a new client", () => {
  it("clears the engagement but keeps the firm & branding", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    s.setAdvisor({ firmName: "Cedar Ridge Advisors", logoDataUrl: PNG_1x1, accentColor: "#1F3F6E" });
    s.startNewClient();
    const after = useAtlasStore.getState();
    expect(after.advisor).toMatchObject({ firmName: "Cedar Ridge Advisors", logoDataUrl: PNG_1x1, accentColor: "#1F3F6E" });
    expect(after.client.fullName).toBe("");
    expect(after.holdings).toHaveLength(0);
    expect(after.recommendations).toHaveLength(0);
    expect(after.proposal.advisorId).toBe(after.advisor.id);
  });
});
