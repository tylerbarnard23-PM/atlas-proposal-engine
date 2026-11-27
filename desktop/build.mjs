// Builds the Stratovell desktop application and its Windows installer (#116).
//
//   npm run desktop:build              the standalone server, the app bundle and the NSIS installer
//   npm run desktop:build -- --dir     the same, unpacked (no installer): quick checks
//   STRATOVELL_DESKTOP_VERSION=0.1.1   build another version (update checks)
//
// Clean inputs only: the build runs from the committed sources and installed
// dependencies, with no environment file. Before packaging it refuses any
// environment file, local state, credential, report, scratch material or
// symbolic link in what would be shipped. The installer is unsigned unless a
// code-signing certificate is supplied through electron-builder's standard
// variables (CSC_LINK / CSC_KEY_PASSWORD or WIN_CSC_LINK); none is purchased here.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dirOnly = args.includes("--dir");
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const electronVersion = rootPkg.devDependencies.electron;
const version = process.env.STRATOVELL_DESKTOP_VERSION || rootPkg.version;
const signed = !!(process.env.CSC_LINK || process.env.WIN_CSC_LINK);
const signing = signed ? "signed build" : "unsigned private UAT build";

const nextOut = join(root, ".next-desktop");
const standalone = join(nextOut, "standalone");
const appDir = join(root, "desktop", "build", "app");
const output = join(root, "dist-desktop", version);

const step = (s) => console.log(`\n== ${s}`);
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

/** Removes a build folder this script owns. Never follows links: a link inside is removed, not what it points to. */
function clean(dir) {
  if (!dir.startsWith(root + sep)) throw new Error(`refusing to clean outside the repository: ${dir}`);
  if (!existsSync(dir)) return;
  unlinkAll(dir);
  rmSync(dir, { recursive: true, force: true });
}
/** Removes every link (symbolic link or junction) under `dir` as a link, before anything is deleted recursively. */
function unlinkAll(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      try {
        rmdirSync(p);
      } catch {
        unlinkSync(p);
      }
    } else if (st.isDirectory()) unlinkAll(p);
  }
}

// 1. Provenance -----------------------------------------------------------------
step("Source");
const commit = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;
console.log(`commit ${commit}${dirty ? " (working tree has uncommitted changes)" : ""}, version ${version}, Electron ${electronVersion}, ${signing}`);
for (const f of readdirSync(root)) if (/^\.env(\..*)?$/.test(f) && f !== ".env.example") throw new Error(`An environment file (${f}) is present in the repository folder. Build from a clean checkout without it.`);

// 2. The Next.js standalone server ---------------------------------------------------
step("Next.js standalone build");
clean(nextOut);
const env = { ...process.env, STRATOVELL_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" };
for (const k of Object.keys(env)) if (/^(ANTHROPIC_|COPILOT_|DATABASE_|GITHUB_|STRATOVELL_(?!DESKTOP_)|VERCEL|NEXT_PUBLIC_)/.test(k)) delete env[k];
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const nb = spawnSync(process.execPath, [nextBin, "build"], { cwd: root, env, stdio: "inherit" });
if (nb.status !== 0) throw new Error("next build failed");
if (!existsSync(join(standalone, "server.js"))) throw new Error("next build produced no standalone server");
cpSync(join(nextOut, "static"), join(standalone, ".next-desktop", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

// Turbopack refers to server-external packages through hashed links (.next-desktop/node_modules/<name>-<hash>),
// created as junctions that point back into this repository. Each link is replaced by a real copy of the package
// traced into the standalone server. A link is removed with a non-recursive rmdir, which removes the link itself
// and can never follow it into what it points to. Packages left out on purpose (puppeteer-core: the desktop
// application prints with Electron) keep no link: their code path is never reached in the desktop build.
const hashed = join(standalone, ".next-desktop", "node_modules");
const isLink = (p) => lstatSync(p).isSymbolicLink();
const linkNames = (d) => (existsSync(d) ? readdirSync(d).flatMap((n) => (n.startsWith("@") ? readdirSync(join(d, n)).map((m) => `${n}/${m}`) : [n])) : []);
for (const name of linkNames(hashed)) {
  const link = join(hashed, ...name.split("/"));
  if (!isLink(link)) continue;
  rmdirSync(link);
  const pkg = name.replace(/-[0-9a-f]{16}$/, "");
  const real = join(standalone, "node_modules", ...pkg.split("/"));
  if (pkg === "puppeteer-core" || pkg.startsWith("@sparticuz/")) {
    console.log(`left out ${name} (not used by the desktop build)`);
    continue;
  }
  if (!existsSync(real)) throw new Error(`The external package ${pkg} wasn't traced into the standalone server.`);
  cpSync(real, link, { recursive: true });
  console.log(`linked package ${name} replaced by a copy of ${pkg}`);
}

// 3. Bundles: main process, preload and the local service's bootstrap -------------------
step("Bundles");
clean(join(root, "desktop", "build"));
mkdirSync(appDir, { recursive: true });
const common = { loader: { ".html": "text" }, bundle: true, platform: "node", target: "node24", format: "cjs", sourcemap: false, logLevel: "warning", external: ["electron"], define: { "process.env.NODE_ENV": '"production"' } };
await esbuild({ ...common, entryPoints: [join(root, "desktop", "main.ts")], outfile: join(appDir, "main.js") });
await esbuild({ ...common, entryPoints: [join(root, "desktop", "preload.ts")], outfile: join(appDir, "preload.js") });
await esbuild({ ...common, external: ["./server.js"], entryPoints: [join(root, "desktop", "server-entry.ts")], outfile: join(standalone, "stratovell-server.js") });
writeFileSync(
  join(appDir, "package.json"),
  JSON.stringify({ name: "stratovell", productName: "Stratovell", version, description: "Stratovell Proposal System: advisor proposal workspace (desktop)", main: "main.js", author: "Stratovell", license: "UNLICENSED" }, null, 2)
);
writeFileSync(join(appDir, "build-info.json"), JSON.stringify({ version, commit: dirty ? `${commit}+uncommitted` : commit, builtAt: new Date().toISOString(), signing }, null, 2));

// 4. What would ship --------------------------------------------------------------------
step("Contents check");
const forbidden = [
  [/(^|[\\/])\.env(\.[^\\/]*)?$/, "environment file"],
  [/(^|[\\/])\.atlas-local([\\/]|$)/, "local Claude state"],
  [/(^|[\\/])\.vercel([\\/]|$)/, "deployment settings"],
  [/(^|[\\/])\.git([\\/]|$)/, "Git data"],
  [/(^|[\\/])\.claude([\\/]|$)/, "assistant settings"],
  [/(^|[\\/])tests[\\/]fixtures[\\/]private([\\/]|$)/, "private fixture"],
  [/(^|[\\/])(REPORT|CLAUDE_HANDOFF[^\\/]*)\.md$/, "report or handoff"],
  [/(^|[\\/])(agent-eval-reports|evidence|scratchpad)([\\/]|$)/, "evaluation or scratch material"],
  [/\.(pem|p12|pfx|key)$/, "key or certificate"],
  [/(^|[\\/])(live-session|connection|pairing)\.json$/, "local connection state"],
];
let files = 0;
const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    const rel = relative(root, p);
    if (st.isSymbolicLink()) problems.push(`symbolic link or junction: ${rel}`);
    else if (st.isDirectory()) walk(p);
    else files++;
    for (const [re, what] of forbidden) if (re.test(rel.replace(/^\.next-desktop[\\/]standalone[\\/]/, "").replace(/^desktop[\\/]build[\\/]app[\\/]/, ""))) problems.push(`${what}: ${rel}`);
  }
}
walk(standalone);
walk(appDir);
if (problems.length) throw new Error(`Refusing to package:\n  ${problems.join("\n  ")}`);
for (const need of ["server.js", "stratovell-server.js", join(".next-desktop", "BUILD_ID"), join(".next-desktop", "server", "chunks"), join("node_modules", "next", "package.json")])
  if (!existsSync(join(standalone, need))) throw new Error(`The standalone server is missing ${need}`);
// Every compiled server file must be in the standalone copy (a tracing exclusion once dropped the server chunks).
const serverJs = (d) => readdirSync(d, { recursive: true }).filter((n) => String(n).endsWith(".js")).length;
const runtimeJs = (base) => ["chunks", "app", "pages"].reduce((n, d) => n + (existsSync(join(base, d)) ? serverJs(join(base, d)) : 0), 0);
const builtJs = runtimeJs(join(nextOut, "server")), shippedJs = runtimeJs(join(standalone, ".next-desktop", "server"));
if (shippedJs < builtJs) throw new Error(`The standalone server has ${shippedJs} of ${builtJs} compiled server files.`);
const keyring = readdirSync(join(standalone, "node_modules", "@napi-rs")).filter((n) => n.startsWith("keyring"));
console.log(`${files} files checked; none excluded material, no links. Credential-store modules: ${keyring.join(", ") || "none"}`);
if (process.platform === "win32" && !keyring.some((n) => n.includes("win32-x64"))) throw new Error("The Windows credential-store module wasn't traced into the server.");

// 5. Package ---------------------------------------------------------------------------
step(dirOnly ? "Unpacked application" : "Installer");
clean(output);
const { build } = await import("electron-builder");
const result = await build({
  // The app folder alone: its package.json has no dependencies, so nothing from the repository's node_modules is packed.
  projectDir: appDir,
  publish: "never",
  ...(dirOnly ? { dir: true } : {}),
  config: {
    appId: "com.stratovell.desktop",
    productName: "Stratovell",
    copyright: "Stratovell",
    electronVersion,
    directories: { app: appDir, output, buildResources: join(root, "desktop", "assets") },
    files: ["**/*"],
    // The local service is copied as built (electron-builder's resource filter would drop its node_modules).
    afterPack: async (ctx) => {
      const target = join(ctx.appOutDir, "resources", "server");
      cpSync(standalone, target, { recursive: true, verbatimSymlinks: true });
      if (!existsSync(join(target, "node_modules", "next", "package.json"))) throw new Error("The local service's dependencies weren't copied.");
    },
    asar: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    electronFuses: {
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
    },
    win: {
      target: [{ target: "nsis", arch: ["x64"] }],
      icon: join(root, "desktop", "assets", "icon.png"),
      executableName: "Stratovell",
      forceCodeSigning: false,
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: false,
      createStartMenuShortcut: true,
      createDesktopShortcut: true,
      shortcutName: "Stratovell",
      uninstallDisplayName: "Stratovell",
      // Uninstalling keeps the user's workspace, backups and connection record (in their application-data folder).
      deleteAppDataOnUninstall: false,
      artifactName: signed ? "Stratovell-Setup-${version}-x64.${ext}" : "Stratovell-Setup-${version}-x64-unsigned-UAT.${ext}",
    },
  },
});
console.log(`\nBuilt from ${commit}${dirty ? " (+ uncommitted changes)" : ""}:`);
for (const f of result) console.log(`  ${relative(root, f)}`);
