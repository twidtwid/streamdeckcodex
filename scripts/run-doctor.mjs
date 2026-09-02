import { resolve } from "node:path";
import { runBundled } from "./lib/bundle-entry.mjs";

const root = resolve(import.meta.dirname, "..");
process.exitCode = await runBundled({
  root,
  entry: "scripts/doctor.mjs",
  cacheName: "doctor",
  args: process.argv.slice(2),
  env: {
    STREAMDECK_CODEX_ROOT: root,
    CODEX_UI_CONTROL: resolve(
      root,
      "com.todd.streamdeckcodex.sdPlugin",
      "bin",
      "codex-ui-control",
    ),
  },
});
