import { resolve } from "node:path";
import { build } from "esbuild";
import { buildInfo as sharedBuildInfo } from "./lib/bundle-entry.mjs";

const root = resolve(import.meta.dirname, "..");

const buildInfo = sharedBuildInfo(root);

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
  // Tests override the destination so a fixture build never replaces the
  // shipped bundle.
  outfile:
    process.env.STREAMDECK_BUNDLE_OUTFILE ??
    resolve(root, "com.todd.streamdeckcodex.sdPlugin", "bin", "plugin.js"),
  sourcemap: true,
});

console.log(
  `Built Codex Companion ${buildInfo.pluginVersion} ${buildInfo.commit} (${buildInfo.treeState})`,
);
