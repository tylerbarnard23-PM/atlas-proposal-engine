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
  Holding,
  Proposal,
  ProposalSection,
  Recommendation,
} from "@/domain/types";

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
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const variant = (url.searchParams.get("variant") as "draft" | "final") ?? "draft";
  const body = (await req.json()) as RequestBody;

  if (!body?.state?.client?.fullName) {
    return NextResponse.json({ error: "Invalid proposal state in request body." }, { status: 400 });
  }

  const props = { ...body.state, variant };
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
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 });
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
    const filename = `${safeName}_${variant === "draft" ? "Draft_" : ""}Wealth_Proposal_${dateStamp}.pdf`;
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
