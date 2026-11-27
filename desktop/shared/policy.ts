// Pure rules of the desktop boundary (#116), kept apart from Electron so tests
// can check them directly: launch flags, the local service's environment, which
// URLs count as the app's own, and where pairing may redirect.

export interface DesktopFlags {
  /** A separate data folder (tests, UAT). Absolute paths only. */
  dataDir: string | null;
  /** Answer with the labelled deterministic test provider instead of Claude: no model, no API calls. */
  testProvider: boolean;
  /** The port to try first for the local service. */
  port: number | null;
}

/** Reads `--stratovell-data-dir=…`, `--stratovell-test-provider` and `--stratovell-port=…`; anything else is ignored. */
export function parseFlags(argv: readonly string[]): DesktopFlags {
  const value = (name: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const dir = value("stratovell-data-dir");
  const port = Number(value("stratovell-port"));
  return {
    dataDir: dir && (/^[a-zA-Z]:[\\/]/.test(dir) || dir.startsWith("/")) ? dir : null,
    testProvider: argv.includes("--stratovell-test-provider"),
    port: Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : null,
  };
}

/**
 * The few variables the operating system needs. Nothing else from the
 * environment Stratovell was started from reaches the local service: no
 * deployment, database or provider settings, no ANTHROPIC_API_KEY and no
 * ANTHROPIC_BASE_URL. A key is connected inside Stratovell (OS credential
 * store or this session's memory) and is never read from the environment.
 */
export const INHERITED = ["SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PATH", "Path", "PATHEXT", "COMSPEC", "ComSpec", "HOMEDRIVE", "HOMEPATH", "HOME", "USER", "USERNAME", "LANG", "LC_ALL", "TZ", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"] as const;

export function childEnvironment(env: Record<string, string | undefined>, o: { port: number; host: string; localStateDir: string; testProvider: boolean }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of INHERITED) if (typeof env[k] === "string") out[k] = env[k] as string;
  Object.assign(out, {
    NODE_ENV: "production",
    PORT: String(o.port),
    HOSTNAME: o.host,
    NEXT_TELEMETRY_DISABLED: "1",
    COPILOT_MODE: "live",
    ATLAS_LOCAL_DIR: o.localStateDir,
    STRATOVELL_DESKTOP: "1",
  });
  if (o.testProvider) out.COPILOT_LIVE_PROVIDER = "fake";
  return out;
}

/** Whether `url` is served by this app's own local server (same scheme, host and port). */
export function isAppUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** Where pairing may send the window afterwards: a plain path in this app, never another site (shared with the pair route). */
export { pairRedirectPath as safeNextPath } from "../../src/copilot/localPairing";
