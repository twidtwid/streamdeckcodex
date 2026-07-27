#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONNECTED_RELEASE_STOP_BLOCKERS,
  loadCanonicalContract,
  option,
  requireFixture,
} from "./lib/connected-qa.mjs";
import { nativeHelperPath } from "./lib/native-helper-path.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const fixtureArgument = option(args, "--fixture");
const preflightOnly = args.includes("--preflight");

function nativeBuild() {
  const result = spawnSync(process.execPath, ["scripts/build-native.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0 || !existsSync(nativeHelperPath(root))) {
    throw new Error("Native helper build failed.");
  }
}

const fixture = await requireFixture(fixtureArgument, { root });
const contract = await loadCanonicalContract(root);
nativeBuild();

// This preflight intentionally does not inspect the foreground application.
// The available native reads cannot independently bind a visible window to the
// fixture task or prove an empty composer, so calling them would only create
// misleading partial evidence.
const preflight = {
  ok: false,
  status: "STOP",
  fixture: "<fixture>",
  fixtureMarkerVerified: Boolean(fixture.markerPath),
  nativeHelper: "built",
  contractKeys: contract.length,
  mutationCount: 0,
  blockers: CONNECTED_RELEASE_STOP_BLOCKERS,
};

process.stdout.write(`${JSON.stringify(preflight)}\n`);
process.exitCode = 2;
if (!preflightOnly) {
  throw new Error(
    "STOP: refusing to dispatch partial Keypad QA because the connected release contract cannot yet prove all required cleanup.",
  );
}
