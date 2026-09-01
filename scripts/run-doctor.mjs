import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache", "doctor");
const output = resolve(cache, "doctor.mjs");
mkdirSync(cache, { recursive: true });
await build({
  entryPoints: [resolve(root, "scripts", "doctor.mjs")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: output,
});
const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    STREAMDECK_CODEX_ROOT: root,
    CODEX_UI_CONTROL: resolve(
      root,
      "com.todd.streamdeckcodex.sdPlugin",
      "bin",
      "codex-ui-control",
    ),
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
