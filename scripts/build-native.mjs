import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "codex-ui-control",
);
mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  "/usr/bin/xcrun",
  [
    "swiftc",
    resolve(root, "native", "CodexUIControl.swift"),
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    "-o",
    output,
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`swiftc exited with ${result.status ?? "unknown status"}`);
}
