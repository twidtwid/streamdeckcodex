import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeHelperPath } from "./lib/native-helper-path.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = nativeHelperPath(root);
mkdirSync(dirname(output), { recursive: true });
const xcodeDeveloper = "/Applications/Xcode.app/Contents/Developer";
const moduleCache = resolve(tmpdir(), "streamdeckcodex-clang-module-cache");
mkdirSync(moduleCache, { recursive: true });
const nativeDirectory = resolve(root, "native");
const nativeSources = readdirSync(nativeDirectory)
  .filter((file) => file.endsWith(".swift"))
  .sort((left, right) => {
    if (left === "main.swift") return 1;
    if (right === "main.swift") return -1;
    return left.localeCompare(right);
  })
  .map((file) => resolve(nativeDirectory, file));
if (!nativeSources.some((file) => file.endsWith("/main.swift"))) {
  throw new Error("Native helper sources have no main.swift entry point");
}

const result = spawnSync(
  "/usr/bin/xcrun",
  [
    "swiftc",
    ...nativeSources,
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    "-o",
    output,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(process.env["DEVELOPER_DIR"]
        ? {}
        : existsSync(xcodeDeveloper)
          ? { DEVELOPER_DIR: xcodeDeveloper }
          : {}),
      CLANG_MODULE_CACHE_PATH:
        process.env["CLANG_MODULE_CACHE_PATH"] ?? moduleCache,
    },
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`swiftc exited with ${result.status ?? "unknown status"}`);
}
