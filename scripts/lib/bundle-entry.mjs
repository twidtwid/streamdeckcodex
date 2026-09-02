import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const BUILD_IDENTITY_PATHS = [
  "src",
  "native",
  "scripts",
  "profile-src",
  "com.todd.streamdeckcodex.sdPlugin/manifest.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/**
 * The build identity every bundled entry point embeds as
 * `__STREAMDECK_CODEX_BUILD__`. The plugin, the doctor, and connected QA
 * therefore all report the same version, commit, and tree state.
 */
export function buildInfo(root) {
  const manifest = JSON.parse(
    readFileSync(
      resolve(root, "com.todd.streamdeckcodex.sdPlugin", "manifest.json"),
      "utf8",
    ),
  );
  const relevantStatus = git(
    root,
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...BUILD_IDENTITY_PATHS,
  );
  return Object.freeze({
    schemaVersion: 1,
    pluginVersion: String(manifest.Version),
    commit:
      process.env.STREAMDECK_BUILD_COMMIT ||
      git(root, "rev-parse", "--verify", "HEAD"),
    treeState: relevantStatus ? "dirty" : "clean",
  });
}

/**
 * Bundle a script that imports TypeScript from src/ and run it in a child process.
 * Node's built-in type stripping does not remap the `.js` specifiers the
 * source uses between sibling modules, so any entry that reaches past a
 * leaf module has to go through esbuild first.
 */
export async function runBundled({ root, entry, cacheName, args = [], env }) {
  const cache = resolve(root, ".cache", cacheName);
  const output = resolve(cache, `${cacheName}.mjs`);
  mkdirSync(cache, { recursive: true });
  await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    define: {
      __STREAMDECK_CODEX_BUILD__: JSON.stringify(buildInfo(root)),
    },
    outfile: output,
  });
  const result = spawnSync(process.execPath, [output, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
