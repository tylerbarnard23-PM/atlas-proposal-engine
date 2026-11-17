import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BACKUP_FORMAT, backupFileName } from "@/engines/workspaceBackup";
import { STORAGE_KEY } from "@/store/useStore";
import { KEYCHAIN_SERVICE } from "@/copilot/credentialStore";
import { LIVE_COOKIE } from "@/copilot/liveGate";
import { PAIR_COOKIE } from "@/copilot/localPairing";
import { CSRF_HEADER } from "@/copilot/localConnect";
import { LEGACY_SAMPLE_FIRM_NAME } from "@/domain/branding";

// The product was renamed for display only (D5, #35). These identifiers are how
// saved workspaces, backups, pairings, cookies and a remembered key are found,
// so a display rename must not touch them: changing one would orphan existing data.
describe("technical identities survive the product rename", () => {
  it("keeps the storage, backup and credential identifiers existing data depends on", () => {
    expect(STORAGE_KEY).toBe("atlas-proposal-engine");
    expect(BACKUP_FORMAT).toBe("atlas-workspace-backup");
    expect(backupFileName(new Date(2026, 10, 17))).toBe("atlas-workspace-backup-2026-11-17.json");
    expect(KEYCHAIN_SERVICE).toBe("Atlas Proposal Engine");
  });

  it("keeps the local-mode cookie, header and legacy sample-firm names", () => {
    expect([LIVE_COOKIE, PAIR_COOKIE, CSRF_HEADER]).toEqual(["atlas_live_session", "atlas_local_pair", "x-atlas-csrf"]);
    expect(LEGACY_SAMPLE_FIRM_NAME).toBe("Atlas Private Wealth Advisors");
  });

  it("keeps the package identity", () => {
    expect(JSON.parse(readFileSync("package.json", "utf8")).name).toBe("atlas-proposal-engine");
  });
});
