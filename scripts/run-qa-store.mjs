import { resolve } from "node:path";
import { runBundled } from "./lib/bundle-entry.mjs";

process.exitCode = await runBundled({
  root: resolve(import.meta.dirname, ".."),
  entry: "scripts/qa-live.mjs",
  cacheName: "qa-store",
  args: process.argv.slice(2),
});
