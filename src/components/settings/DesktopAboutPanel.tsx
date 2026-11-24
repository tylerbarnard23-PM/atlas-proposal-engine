import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import type { DesktopAppInfo } from "@/store/workspaceStorage";

// #116: Settings · About this application (desktop only): version, build, where
// data is kept, and how updating keeps it.

export function DesktopAboutPanel({ info }: { info: DesktopAppInfo }) {
  return (
    <Card className="mb-5" data-testid="desktop-about">
      <CardHeader>
        <CardTitle>About this application</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-[13px] text-ink-700">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-500">Version</dt>
          <dd data-testid="desktop-version">Stratovell {info.version}</dd>
          <dt className="text-ink-500">Build</dt>
          <dd>{info.build}</dd>
          <dt className="text-ink-500">Platform</dt>
          <dd>{info.platform}</dd>
          <dt className="text-ink-500">Your data</dt>
          <dd className="break-all">{info.dataFolder}</dd>
        </dl>
        <p>
          <strong className="font-medium text-ink-900">Updating:</strong> install the newer Stratovell installer over this one. Your workspace, approved versions, backups and Claude connection record stay in your data folder; installing, updating and uninstalling never remove it. As a precaution, export a backup below before updating.
        </p>
        <p className="text-ink-500">Stratovell doesn&apos;t check for updates or contact any server by itself. It goes online only when you choose to: refreshing exchange rates (Frankfurter) or running a Claude analysis (Anthropic).</p>
      </CardBody>
    </Card>
  );
}
