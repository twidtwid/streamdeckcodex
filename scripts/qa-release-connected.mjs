#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { option } from "./lib/connected-qa.mjs";

const args = process.argv.slice(2);
const fixture = option(args, "--fixture");
const installed = option(args, "--installed");
const livePages = option(args, "--live-pages");
if (!fixture || !installed || !livePages) {
  throw new Error(
    "Usage: qa:release:connected --fixture <path> --installed <profile> --live-pages <dir>",
  );
}
const run = (command, values) => {
  const result = spawnSync(command, values, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("npm", ["run", "check"]);
run("npm", ["run", "qa:keys:preflight", "--", "--fixture", fixture]);
run("npm", ["run", "qa:keys:connected", "--", "--fixture", fixture]);
run("npm", [
  "run",
  "qa:design:release",
  "--",
  "--installed",
  installed,
  "--live-pages",
  livePages,
]);
