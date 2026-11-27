"use client";

import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WorkspaceBackupPanel } from "@/components/settings/WorkspaceBackupPanel";
import { AiConnectionPanel } from "@/components/settings/AiConnectionPanel";
import { DesktopAboutPanel } from "@/components/settings/DesktopAboutPanel";
import { useDesktopInfo } from "@/components/layout/DesktopNotices";

export default function SettingsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const desktop = useDesktopInfo();
  const reset = useAtlasStore((s) => s.resetSeed);
  const clearAll = useAtlasStore((s) => s.clearAll);
  const startNewClient = useAtlasStore((s) => s.startNewClient);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="The AI connection, where your data is saved, backups and the exchange-rate source."
      />

      {desktop && <DesktopAboutPanel info={desktop} />}

      <SectionDivider>AI connection</SectionDivider>
      <AiConnectionPanel />

      <SectionDivider>Persistence</SectionDivider>
      <Card className="mb-5">
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-700" data-testid="persistence-where">
            {desktop ? (
              <>
                All advisor-entered data is saved on this computer, in <code className="text-2xs bg-slatey-100 rounded px-1 py-0.5 break-all">{desktop.dataFolder}</code>, with the previous copy and daily backups kept beside it. Installing, updating and uninstalling Stratovell never remove it.
              </>
            ) : (
              <>
                All advisor-entered data is persisted in the browser via <code className="text-2xs bg-slatey-100 rounded px-1 py-0.5">localStorage</code>.
              </>
            )}{" "}
            <em>Start a new client</em> clears the engagement but keeps your firm &amp; branding; <em>Reset everything</em> also clears the firm.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { if (confirm("Reset the workspace to the fictional sample? Any in-progress edits will be replaced. The sample starts with no recommendations.")) reset(); }}>
              Restore sample data
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (
                  confirm(
                    "Start a new client?\n\nThis clears the client profile, accounts, holdings, recommendations, source documents and PDF history. Your firm & branding are kept. This can't be undone."
                  )
                ) {
                  startNewClient();
                }
              }}
            >
              Start a new client
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  confirm(
                    "Reset everything?\n\nThis clears the client and your firm & branding (firm name, advisor, logo, accent color), plus all accounts, holdings, recommendations, source documents and PDF history. This can't be undone."
                  )
                ) {
                  clearAll();
                }
              }}
            >
              Reset everything
            </Button>
          </div>
        </CardBody>
      </Card>

      <SectionDivider>
        <span id="backup" className="scroll-mt-4">Backup &amp; restore</span>
      </SectionDivider>
      <WorkspaceBackupPanel />

      <SectionDivider>Exchange rates</SectionDivider>
      <Card>
        <CardHeader><CardTitle>Exchange-rate source</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          <p className="text-sm text-ink-700">
            Exchange rates come from Frankfurter (ECB reference rates) when you refresh them on the{" "}
            <Link href="/market-data" className="font-medium text-navy-700 hover:underline">Exchange rates</Link> page, or from rates you add there by hand. No key or account is needed.
          </p>
          <p className="text-2xs text-ink-500 leading-relaxed">
            Proposals don&apos;t need a security-price feed: holding values come from statements, advisor entry and approved values, each with its own date.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
