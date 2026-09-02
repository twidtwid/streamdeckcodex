import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean)
  .sort();
const forbiddenExtensions = new Set([
  ".db",
  ".key",
  ".log",
  ".p12",
  ".pem",
  ".sqlite",
]);
const forbiddenNames = [/^\.env(?:\.|$)/, /^id_(?:rsa|ecdsa|ed25519)$/];
const runtimeArtifacts = new Set(["dashboard/activity.jsonl"]);
const internalPlanningArtifacts = new Set(["plan.md"]);
const patterns = [
  {
    label: "private macOS home path",
    expression: /\/Users\/(?!example(?:\/|$))[A-Za-z0-9._-]+\//,
  },
  {
    label: "private key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { label: "GitHub token", expression: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  {
    label: "GitHub fine-grained token",
    expression: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  },
  {
    label: "OpenAI-style secret",
    expression: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  { label: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: "Slack token",
    expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
];
const failures = [];

for (const file of tracked) {
  if (runtimeArtifacts.has(file)) {
    failures.push(`${file}: runtime activity must not be tracked`);
    continue;
  }
  if (internalPlanningArtifacts.has(file) || file.startsWith("plans/")) {
    failures.push(
      `${file}: internal implementation planning must not be tracked`,
    );
    continue;
  }
  const name = file.split("/").at(-1) ?? file;
  if (
    forbiddenExtensions.has(extname(name).toLowerCase()) ||
    forbiddenNames.some((pattern) => pattern.test(name))
  ) {
    failures.push(`${file}: sensitive file type is tracked`);
    continue;
  }

  const content = await readFile(resolve(file));
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const { label, expression } of patterns) {
    if (expression.test(text)) failures.push(`${file}: contains ${label}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Public-tree scrub failed:\n${failures.join("\n")}`);
}

console.log(`Public-tree scrub passed for ${tracked.length} repository files.`);
