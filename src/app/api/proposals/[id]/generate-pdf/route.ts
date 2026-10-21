import { NextResponse } from "next/server";
import * as React from "react";
import {
  ProposalPdfTemplate,
  buildPrintableHtml,
} from "@/pdf/templates/ProposalPdfTemplate";
import type {
  Account,
  AdvisorProfile,
  ClientProfile,
  Disclosure,
  FxRate,
  Holding,
  Proposal,
  ProposalSection,
  Recommendation,
} from "@/domain/types";
import { evaluateWorkspaceReadiness, readinessOk } from "@/engines/complianceEngine";
import { checkLogoDataUrl, isValidAccentColor } from "@/domain/branding";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RequestBody {
  state: {
    client: ClientProfile;
    advisor: AdvisorProfile;
    accounts: Account[];
    holdings: Holding[];
    recommendations: Recommendation[];
    sections: ProposalSection[];
    disclosures: Disclosure[];
    proposal: Proposal;
    // Rates for expressing proposed trades in each holding's own currency.
    // Missing rates are reported by readiness; they never default to 1:1.
    fxRates?: FxRate[];
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const variant = (url.searchParams.get("variant") as "draft" | "final") ?? "draft";
  const body = (await req.json()) as RequestBody;

  if (!body?.state?.client?.fullName) {
    return NextResponse.json({ error: "Invalid proposal state in request body." }, { status: 400 });
  }

  // Branding comes from the browser, so check it here too: the logo must be an
  // embedded raster image (never a URL this server would fetch) and the accent a
  // plain hex color (it is written into the document's CSS).
  const { logoDataUrl, accentColor } = body.state.advisor ?? {};
  if (logoDataUrl !== undefined) {
    const check = checkLogoDataUrl(logoDataUrl);
    if (!check.ok) return NextResponse.json({ error: `Invalid firm logo: ${check.reason}` }, { status: 400 });
  }
  if (accentColor !== undefined && !isValidAccentColor(accentColor)) {
    return NextResponse.json({ error: "Invalid accent color: use a six-digit hex value such as #1F3F6E." }, { status: 400 });
  }

  // The UI disables the final button until readiness passes; enforce the same
  // gate here so a direct API call can't skip it.
  if (variant === "final") {
    const { client, advisor, accounts, holdings, recommendations, disclosures, fxRates } = body.state;
    const checks = evaluateWorkspaceReadiness({
      client,
      advisor,
      accounts: accounts ?? [],
      holdings: holdings ?? [],
      recommendations: recommendations ?? [],
      disclosures: disclosures ?? [],
      fxRates: Array.isArray(fxRates) ? fxRates : [],
    });
    if (!readinessOk(checks)) {
      const failing = checks.filter((c) => !c.passed).map((c) => c.label);
      return NextResponse.json(
        { error: `Final PDF blocked by readiness checks: ${failing.join("; ")}.`, failing },
        { status: 422 }
      );
    }
  }

  const props = { ...body.state, fxRates: Array.isArray(body.state.fxRates) ? body.state.fxRates : [], variant };
  // Dynamically load react-dom/server inside the handler so the App Router
  // doesn't statically reject the import. (Next.js disallows static
  // `react-dom/server` imports in API routes; dynamic import is allowed.)
  const { renderToStaticMarkup } = await import("react-dom/server");
  const bodyMarkup = renderToStaticMarkup(React.createElement(ProposalPdfTemplate, props));
  const html = buildPrintableHtml(props, bodyMarkup);

  // Lazy-load puppeteer-core so the import isn't pulled into edge bundles.
  const puppeteer = (await import("puppeteer-core")).default;

  // Pick a Chromium binary based on environment:
  //  - On Vercel / AWS Lambda, use @sparticuz/chromium-min and fetch the
  //    binary tarball from the matching Sparticuz GitHub release. This keeps
  //    the function bundle small and avoids the Node 24 + bundled-binary
  //    extraction issues that produced cold-start 500s.
  //  - Locally, find the host's installed Chrome via chromiumPath.ts.
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  let executablePath: string | undefined;
  let launchArgs: string[];
  let headlessMode: boolean | "shell" = true;
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const tarball =
      process.env.CHROMIUM_TARBALL_URL ??
      "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";
    executablePath = await chromium.executablePath(tarball);
    launchArgs = chromium.args;
    // chromium-min v148 dropped the static `headless` property; "shell" is
    // the recommended mode for the bundled binary.
    headlessMode = "shell";
  } else {
    const { resolveChromiumExecutable, ChromiumNotFoundError } = await import("@/pdf/chromiumPath");
    const local = resolveChromiumExecutable();
    if (!local) {
      return NextResponse.json({ error: new ChromiumNotFoundError().message }, { status: 500 });
    }
    executablePath = local;
    launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"];
  }
  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    browser = await puppeteer.launch({
      args: launchArgs,
      headless: headlessMode,
      executablePath,
    });
  } catch (err) {
    console.error("[generate-pdf] puppeteer.launch failed", err);
    return NextResponse.json(
      { error: `Browser launch failed: ${(err as Error).message ?? "unknown"}` },
      { status: 500 }
    );
  }
  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    // The template is self-contained (inline CSS, no scripts or remote assets),
    // so "load" is complete. puppeteer-core 25 dropped networkidle for setContent.
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      preferCSSPageSize: false,
    });
    const { id } = await params;
    const safeName = (body.state.client.householdName ?? body.state.client.fullName)
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `SAMPLE_${safeName}_${variant === "draft" ? "Draft_" : ""}Wealth_Proposal_${dateStamp}.pdf`;
    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Filename": filename,
        "X-Proposal-Id": id,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[generate-pdf] PDF generation failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "PDF generation failed" },
      { status: 500 }
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
