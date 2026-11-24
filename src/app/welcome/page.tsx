"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAtlasStore } from "@/store/useStore";
import { useDesktopInfo } from "@/components/layout/DesktopNotices";
import { WORKFLOW_STEPS } from "@/domain/desktopWorkflow";

// #116: the first page of the Stratovell desktop application, and the guide to
// its one advisor workflow. Reading it changes nothing and sends nothing.

export default function WelcomePage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const info = useDesktopInfo();
  const router = useRouter();
  const startNewClient = useAtlasStore((s) => s.startNewClient);
  const resetSeed = useAtlasStore((s) => s.resetSeed);

  function newClient() {
    if (!info?.firstRun && !confirm("Start a new client?\n\nThis clears the current client, accounts, holdings, recommendations, source documents and PDF history. Your firm & branding are kept."))
      return;
    startNewClient();
    router.push("/client-profile");
  }
  function sample() {
    if (!info?.firstRun && !confirm("Open the fictional sample?\n\nThis replaces the current workspace with the fictional Blackwell Family Office sample. It starts with no recommendations."))
      return;
    resetSeed();
    router.push("/");
  }

  return (
    <>
      <PageHeader
        eyebrow={info ? `Stratovell ${info.version}` : "Getting started"}
        title="Welcome to Stratovell"
        description="An advisor's proposal workspace. You record the client's objectives and approve every recommendation; Claude, connected with your own API key, analyzes the portfolio and drafts recommendations for your review."
      />

      {!info && (
        <Card className="mb-5" data-testid="welcome-web">
          <CardBody className="text-[13px] text-ink-700 space-y-2">
            <p>
              You&apos;re viewing the website&apos;s scripted preview. Stratovell itself is a desktop application that runs on your own computer, where Claude analysis uses your own Anthropic API key.
            </p>
            <p>
              <Link href="/download" className="font-medium text-navy-700 hover:underline">
                Get Stratovell for Windows
              </Link>
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card data-testid="welcome-start">
          <CardHeader>
            <CardTitle>Start</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-[13px] text-ink-700">
            <div className="flex flex-wrap gap-2">
              <Button onClick={newClient} data-testid="welcome-new-client">
                Create a new client
              </Button>
              <Button variant="secondary" onClick={sample} data-testid="welcome-sample">
                Explore the fictional sample
              </Button>
            </div>
            {info && (<p>
              Used Stratovell in a web browser before? Export a backup there (Settings → Backup &amp; restore), then restore it here in{" "}
              <Link href="/settings#backup" className="font-medium text-navy-700 hover:underline">
                Settings
              </Link>
              . Stratovell never reads your browser&apos;s data by itself.
            </p>)}
          </CardBody>
        </Card>

        <Card data-testid="welcome-how">
          <CardHeader>
            <CardTitle>{info ? "How Stratovell works" : "How the Stratovell desktop application works"}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-ink-700">
              <li>Stratovell runs on this computer. Your workspace, its backups and approved versions are saved here{info ? ` (${info.dataFolder})` : ""}.</li>
              <li>Statement PDFs are read on this computer; they aren&apos;t uploaded.</li>
              <li>
                Claude analysis needs an internet connection and sends the analysis inputs shown before each run (your question, the client brief and the portfolio information Claude asks for) to Anthropic. Your private discovery notes are never sent.
              </li>
              <li>You connect your own Anthropic API key, billed by Anthropic to your Console organization. This is not a sign-in with a Claude subscription.</li>
              <li>Saving a key or reviewing the client&apos;s objectives makes no model request.</li>
              <li>An analysis starts only when you start it, inside a session with limits you confirm.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <SectionDivider>The workflow</SectionDivider>
      <ol className="space-y-2" data-testid="welcome-workflow">
        {WORKFLOW_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-md ring-1 ring-inset ring-ink-100 bg-white px-3 py-2.5">
            <span className="tabular text-ink-400 w-5 shrink-0 text-right">{i + 1}</span>
            <div className="text-[13px]">
              <div className="font-medium text-ink-900">{s.title}</div>
              <div className="text-ink-600">
                {s.detail}{" "}
                <Link href={s.href} className="text-navy-700 hover:underline whitespace-nowrap">
                  {s.place} →
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-2xs text-ink-500">
        Claude&apos;s drafts, the recommendations you write yourself and scripted or test examples stay labelled separately throughout. Advisor allocation targets are inputs to the analysis; a target alone never creates a recommendation or a trade.
      </p>
    </>
  );
}
