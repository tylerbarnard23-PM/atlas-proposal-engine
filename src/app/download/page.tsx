import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DESKTOP_AVAILABILITY_NOTE, DESKTOP_RELEASE } from "@/domain/desktopRelease";

// #116: the website's product entry. Stratovell is a desktop application; the
// website offers the download (once an approved installer exists) and a
// separately labelled scripted preview.

export const metadata: Metadata = { title: "Get Stratovell for Windows" };

export default function DownloadPage() {
  const r = DESKTOP_RELEASE;
  return (
    <>
      <PageHeader eyebrow="Stratovell for Windows" title="Get Stratovell" description="Stratovell is an advisor's proposal workspace that runs on your own computer. Claude analysis uses your own Anthropic API key." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card data-testid="download-card">
          <CardHeader>
            <CardTitle>Download</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-[13px] text-ink-700">
            {r ? (
              <>
                <a href={r.url} className="inline-flex items-center rounded-md bg-navy-700 px-4 h-9 font-medium text-white hover:bg-navy-600" data-testid="download-link">
                  Download Stratovell {r.version} for Windows (x64)
                </a>
                <p className="text-2xs text-ink-500 break-all">
                  SHA-256 {r.sha256} · {(r.sizeBytes / 1_048_576).toFixed(0)} MB · tested on {r.testedOn.join(", ")}
                </p>
              </>
            ) : (
              <>
                <button type="button" disabled className="inline-flex items-center rounded-md bg-ink-100 px-4 h-9 font-medium text-ink-500 cursor-not-allowed" data-testid="download-unavailable">
                  Download for Windows: not yet available
                </button>
                <p data-testid="download-note">{DESKTOP_AVAILABILITY_NOTE}</p>
              </>
            )}
            <p>
              <Link href="/" className="font-medium text-navy-700 hover:underline" data-testid="try-preview">
                Try the scripted preview
              </Link>{" "}
              <span className="text-ink-500">— a fixed, labelled demonstration in your browser with fictional data. It isn&apos;t Claude&apos;s analysis and stores nothing on a server.</span>
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What to expect</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-ink-700">
              <li>Stratovell runs on your computer and keeps your workspace there. Statement PDFs are read locally.</li>
              <li>Claude analysis needs an internet connection and your own Anthropic API key (a Console key, not a Claude subscription sign-in). It sends the displayed analysis inputs to Anthropic only when you start an analysis.</li>
              <li>You approve every recommendation and every proposal version; drafts never approve themselves.</li>
              <li>Windows 10 or 11, 64-bit (tested so far on Windows 11). No other software is needed.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
