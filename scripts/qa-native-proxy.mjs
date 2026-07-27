#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const real = process.env["QA_NATIVE_REAL"];
const log = process.env["QA_NATIVE_LOG"];
if (!real || !log) process.exit(64);

appendFileSync(log, `${JSON.stringify(process.argv.slice(2))}\n`);
const result = spawnSync(real, process.argv.slice(2), {
  encoding: "utf8",
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
