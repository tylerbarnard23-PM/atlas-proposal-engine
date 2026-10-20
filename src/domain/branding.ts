import type { AdvisorProfile } from "./types";

// White-label branding: the adviser's firm (not Atlas) is what clients see on
// a proposal. These helpers are shared by the UI, the PDF template and the PDF
// API so validation is identical in the browser and on the server.

// The fictional firm that ships with the sample data. Deliberately unrelated to
// the product name so "Atlas" (the software) and the firm (its customer) never
// blur together.
export const SAMPLE_FIRM_NAME = "Harbor & Pine Wealth Partners";
export const LEGACY_SAMPLE_FIRM_NAME = "Atlas Private Wealth Advisors";

export const DEFAULT_ACCENT = "#947629";

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MAX_DIMENSION = 512;
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// True once the adviser has replaced the sample firm with their own.
export function isCustomFirm(advisor: Pick<AdvisorProfile, "firmName">): boolean {
  const name = advisor.firmName?.trim();
  return !!name && name !== SAMPLE_FIRM_NAME && name !== LEGACY_SAMPLE_FIRM_NAME;
}

// Disclosures use "[Firm]" as a placeholder. It stays a placeholder for the
// sample firm, so the demo never presents sample text as a real firm's
// disclosures, and becomes the adviser's firm name once they set their own.
export function resolveFirmPlaceholder(text: string, advisor: Pick<AdvisorProfile, "firmName">): string {
  return isCustomFirm(advisor) ? text.replaceAll("[Firm]", advisor.firmName.trim()) : text;
}

// --- Accent color ------------------------------------------------------------
// Only a plain six-digit hex color is accepted: it is interpolated into CSS, so
// anything else could inject styles into the client document.
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidAccentColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

// A lighter tint of the accent for use on the dark PDF cover.
export function accentTint(hex: string, amount = 0.45): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// --- Logo --------------------------------------------------------------------
// Logos are stored as base64 data URLs of raster images only. SVG is refused
// (it can carry script), remote URLs are refused (the PDF server would fetch
// them: SSRF and tracking risk), and the decoded bytes must carry the real
// PNG/JPEG/WebP signature, not just claim the type.
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type LogoCheck = { ok: true } | { ok: false; reason: string };

export function checkLogoDataUrl(value: unknown): LogoCheck {
  if (typeof value !== "string") return { ok: false, reason: "Logo must be an image." };
  const m = DATA_URL.exec(value);
  if (!m) return { ok: false, reason: "Logo must be an embedded PNG, JPEG or WebP image." };
  const [, type, b64] = m;
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (bytes > LOGO_MAX_BYTES) return { ok: false, reason: `Logo is larger than ${LOGO_MAX_BYTES / 1024} KB.` };
  const head = decodeHead(b64);
  const signature =
    type === "png"
      ? head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
      : type === "jpeg"
      ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
      : String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!signature) return { ok: false, reason: "Logo content doesn't match its image type." };
  return { ok: true };
}

function decodeHead(b64: string): number[] {
  const chunk = b64.slice(0, 16); // 12 bytes is enough for every signature above
  if (typeof atob === "function") return Array.from(atob(chunk), (c) => c.charCodeAt(0));
  return Array.from(Buffer.from(chunk, "base64"));
}
