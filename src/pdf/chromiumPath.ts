import fs from "node:fs";

// Resolve a usable Chrome / Chromium executable on the host. Puppeteer's
// auto-download was disabled at install time (`PUPPETEER_SKIP_DOWNLOAD=true`)
// because the bundled download failed under corporate TLS interception.
// At runtime we search for an existing browser; if none is found we surface a
// clear error so the operator knows what to install.

const CANDIDATES: string[] = [
  // Explicit override always wins.
  ...(process.env.PUPPETEER_EXECUTABLE_PATH ? [process.env.PUPPETEER_EXECUTABLE_PATH] : []),
  ...(process.env.CHROME_PATH ? [process.env.CHROME_PATH] : []),
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

export function resolveChromiumExecutable(): string | null {
  for (const path of CANDIDATES) {
    if (!path) continue;
    try {
      if (fs.existsSync(path)) return path;
    } catch {
      continue;
    }
  }
  return null;
}

export class ChromiumNotFoundError extends Error {
  constructor() {
    super(
      "No Chromium-based browser was found. Install Google Chrome (or set PUPPETEER_EXECUTABLE_PATH) and retry."
    );
    this.name = "ChromiumNotFoundError";
  }
}
