import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(
    resolve(root, "com.todd.streamdeckcodex.sdPlugin", "manifest.json"),
    "utf8",
  ),
);

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const commit =
  process.env.STREAMDECK_BUILD_COMMIT || git("rev-parse", "--verify", "HEAD");
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
const buildInfo = Object.freeze({
  schemaVersion: 1,
  pluginVersion: String(manifest.Version),
  commit,
  treeState: relevantStatus ? "dirty" : "clean",
});

await build({
  entryPoints: [resolve(root, "src", "plugin.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  define: {
    __STREAMDECK_CODEX_BUILD__: JSON.stringify(buildInfo),
  },
  outfile: resolve(
    root,
    "com.todd.streamdeckcodex.sdPlugin",
    "bin",
    "plugin.js",
  ),
  sourcemap: true,
});

console.log(
  `Built Codex Companion ${buildInfo.pluginVersion} ${buildInfo.commit} (${buildInfo.treeState})`,
);
