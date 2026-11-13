import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min", "@napi-rs/keyring"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
