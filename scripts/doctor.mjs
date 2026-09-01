import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { CodexStore } from "../src/lib/codex-store.ts";
import { collectHealth } from "../src/lib/health.ts";

const root = process.env.STREAMDECK_CODEX_ROOT
  ? resolve(process.env.STREAMDECK_CODEX_ROOT)
  : resolve(import.meta.dirname, "..");
const includePaths = process.argv.includes("--include-paths");
const json = process.argv.includes("--json");
const allowDegraded = process.argv.includes("--allow-degraded");
const manifest = JSON.parse(
  readFileSync(
    resolve(root, "com.todd.streamdeckcodex.sdPlugin", "manifest.json"),
    "utf8",
  ),
);

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function processRunning(pattern) {
  return (
    spawnSync("/usr/bin/pgrep", ["-f", pattern], {
      stdio: "ignore",
    }).status === 0
  );
}

function installedState() {
  const installed = resolve(
    homedir(),
    "Library/Application Support/com.elgato.StreamDeck/Plugins/com.todd.streamdeckcodex.sdPlugin",
  );
  const expected = resolve(root, "com.todd.streamdeckcodex.sdPlugin");
  if (!existsSync(installed)) return { classification: "missing" };
  let resolved;
  try {
    resolved = realpathSync(installed);
  } catch {
    return { classification: "unreadable" };
  }
  const classification =
    resolved === realpathSync(expected)
      ? "saved-project"
      : lstatSync(installed).isSymbolicLink()
        ? "other-link"
        : "installed-copy";
  return {
    classification,
    ...(includePaths ? { path: resolved } : {}),
  };
}

const relevantStatus = git(
  "status",
  "--porcelain",
  "--untracked-files=all",
  "--",
  "src",
  "native",
  "scripts",
  "profile-src",
  "com.todd.streamdeckcodex.sdPlugin/manifest.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
);
const store = new CodexStore();
try {
  const health = await collectHealth(store);
  const report = {
    schemaVersion: 1,
    build: {
      pluginVersion: manifest.Version,
      commit: git("rev-parse", "--verify", "HEAD"),
      treeState: relevantStatus ? "dirty" : "clean",
    },
    runtime: {
      manifestSdk: manifest.SDKVersion,
      nodeTarget: manifest.Nodejs?.Version,
      streamDeckRunning: processRunning("com.elgato.StreamDeck"),
      pluginRunning: processRunning(
        "com.todd.streamdeckcodex.sdPlugin/bin/plugin.js",
      ),
    },
    installed: installedState(),
    components: health.components,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Codex Companion ${report.build.pluginVersion} ${report.build.commit} (${report.build.treeState})`,
    );
    console.log(`Installed: ${report.installed.classification}`);
    console.log(
      `Stream Deck: ${report.runtime.streamDeckRunning ? "running" : "stopped"}; plugin: ${report.runtime.pluginRunning ? "running" : "stopped"}`,
    );
    for (const [component, availability] of Object.entries(report.components)) {
      console.log(
        `${component}: ${availability.state === "ready" ? availability.value : availability.reason}`,
      );
    }
  }
  const degraded =
    report.installed.classification !== "saved-project" ||
    !report.runtime.streamDeckRunning ||
    !report.runtime.pluginRunning ||
    Object.values(report.components).some(
      (availability) => availability.state !== "ready",
    );
  process.exitCode = degraded && !allowDegraded ? 1 : 0;
} finally {
  store.close();
}
