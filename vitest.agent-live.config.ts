import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The opt-in paid live agent evaluation only (D4). `npm test` never runs it.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["eval/agentLive.eval.ts"],
    environment: "node",
    env: { TZ: "UTC" },
    // A live run makes sequential model calls; the spend cap, not a timeout, bounds it.
    testTimeout: 60 * 60 * 1000,
  },
});
