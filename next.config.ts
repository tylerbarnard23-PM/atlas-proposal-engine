import type { NextConfig } from "next";

// #116: the desktop application's build (desktop/build.mjs sets
// STRATOVELL_DESKTOP_BUILD=1) produces a self-contained standalone server in
// its own folder, so it never overwrites the development or web build, and
// keeps Next's route cache in memory so the installed program folder is never
// written at run time. It prints PDFs with Electron's Chromium, so the serverless Chromium packages are
// left out of it. The web build (Vercel, `next build`) is unchanged.
const desktop = process.env.STRATOVELL_DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min", "@napi-rs/keyring"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  typescript: { ignoreBuildErrors: false },
  ...(desktop
    ? {
        output: "standalone" as const,
        // The installed program folder is never written at run time: Next's route cache stays in memory.
        experimental: { serverActions: { bodySizeLimit: "25mb" }, isrFlushToDisk: false },
        distDir: ".next-desktop",
        outputFileTracingRoot: process.cwd(),
        outputFileTracingExcludes: { "*": ["node_modules/@sparticuz/**", "node_modules/puppeteer-core/**", "node_modules/electron/**", "node_modules/electron-builder/**", "node_modules/app-builder-*/**", ".atlas-local/**", "tests/**", "docs/**"] },
      }
    : {}),
};

export default nextConfig;
