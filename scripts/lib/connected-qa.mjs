import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const canonicalProfile = JSON.parse(
  readFileSync(resolve("profile-src", "profile-contract.json"), "utf8"),
);
const canonicalKeyCount = canonicalProfile.pages.reduce(
  (total, page) => total + page.keys.length,
  0,
);

export const FIXTURE_MARKER = ".streamdeck-codex-disposable-fixture.json";
export const FIXTURE_KIND = "streamdeck-codex-disposable-fixture";
export const REDACTED = "[redacted]";
export const CONNECTED_RELEASE_STOP_BLOCKERS = [
  "The zero-mutation preflight has no independent foreground-task, permission, or empty-composer witness.",
  "Workflow launch witnesses are discarded by the TypeScript layer and have no task or draft cleanup path.",
  "New Chat does not return a created task identity or provide task cleanup.",
  "Send and Compact have no inverse operation.",
  "New Project has no verified picker-dismiss cleanup.",
  `No complete ${canonicalKeyCount}-key Keypad executor can prove every postcondition and restoration independently.`,
];

export function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function requireFixture(path, { root = resolve(".") } = {}) {
  if (!path) throw new Error("A disposable --fixture path is required.");
  const fixture = await realpath(resolve(path));
  const workspace = await realpath(resolve(root));
  const prohibited = new Set([resolve("/"), resolve(homedir()), workspace]);
  if (prohibited.has(fixture)) {
    throw new Error("Refusing a repository, home, or filesystem-root fixture.");
  }
  const insideWorkspace = relative(workspace, fixture);
  if (insideWorkspace && !insideWorkspace.startsWith("..")) {
    throw new Error("Refusing a fixture inside the repository workspace.");
  }
  const temporaryRoot = await realpath(tmpdir());
  const insideTemporaryRoot = relative(temporaryRoot, fixture);
  if (!insideTemporaryRoot || insideTemporaryRoot.startsWith("..")) {
    throw new Error("Fixture must live below the macOS temporary directory.");
  }
  const markerPath = join(fixture, FIXTURE_MARKER);
  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch {
    throw new Error("Fixture marker is missing or invalid.");
  }
  if (marker.kind !== FIXTURE_KIND || marker.version !== 1) {
    throw new Error("Fixture marker does not prove a disposable project.");
  }
  const entries = await readdir(fixture);
  const allowed = new Set([FIXTURE_MARKER, ".gitignore", "README.md"]);
  if (entries.some((entry) => !allowed.has(entry))) {
    throw new Error("Fixture must be empty apart from its explicit marker.");
  }
  return { fixture, markerPath };
}

export async function createFixture() {
  const fixture = await mkdtemp(join(tmpdir(), "streamdeck-codex-fixture-"));
  await writeFile(
    join(fixture, FIXTURE_MARKER),
    `${JSON.stringify({ kind: FIXTURE_KIND, version: 1, nonce: randomUUID() })}\n`,
  );
  await writeFile(join(fixture, ".gitignore"), "*\n!.gitignore\n");
  return fixture;
}

export async function loadCanonicalContract(root = resolve(".")) {
  const profile = JSON.parse(
    await readFile(join(root, "profile-src", "profile-contract.json"), "utf8"),
  );
  const contract = profile.pages.flatMap((page, index) =>
    page.keys.map((key) => ({ ...key, page: index + 1 })),
  );
  if (!Array.isArray(contract) || contract.length !== canonicalKeyCount) {
    throw new Error(
      `The canonical profile contract did not yield exactly ${canonicalKeyCount} keys.`,
    );
  }
  return contract;
}

export function redact(value, fixture) {
  if (typeof value !== "string") return value;
  const normalizedFixture = resolve(fixture);
  return value
    .replaceAll(normalizedFixture, "<fixture>")
    .replace(/\b[0-9a-f]{16,64}\b/gi, REDACTED)
    .replace(/codex:\/\/[^\s"]+/g, "codex://" + REDACTED);
}

export function settingsHash(settings) {
  return createHash("sha256")
    .update(JSON.stringify(settings))
    .digest("hex")
    .slice(0, 12);
}

export class CleanupJournal {
  #entries = [];
  #closed = false;

  register(name, restore) {
    if (this.#closed) throw new Error("Cleanup journal is already closed.");
    this.#entries.push({ name, restore });
  }

  async restoreAll() {
    this.#closed = true;
    const failures = [];
    for (const entry of [...this.#entries].reverse()) {
      try {
        await entry.restore();
      } catch (error) {
        failures.push({
          name: entry.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return failures;
  }
}

export function validateReport(report) {
  const errors = [];
  const records = report?.keys;
  if (!Array.isArray(records) || records.length !== canonicalKeyCount) {
    errors.push(
      `Expected ${canonicalKeyCount} report records, found ${records?.length ?? 0}.`,
    );
    return errors;
  }
  const locations = new Set();
  for (const record of records) {
    const location = `${record.page}:${record.position}`;
    if (locations.has(location)) errors.push(`Duplicate key ${location}.`);
    locations.add(location);
    if (record.status !== "PASS") errors.push(`${location} is not PASS.`);
    if (record.controller !== "Keypad")
      errors.push(`${location} did not use Keypad.`);
    if (!record.visualArtifact)
      errors.push(`${location} has no physical visual artifact.`);
    if (!record.postcondition?.verified)
      errors.push(`${location} has no verified postcondition.`);
  }
  if (report.cleanup?.equal !== true)
    errors.push("Cleanup did not restore the initial snapshot.");
  return errors;
}

export async function writeEvidence({
  root = resolve("."),
  report,
  screenshots = [],
}) {
  const evidenceRoot = join(
    root,
    ".cache",
    "profile-key-release",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(
    join(evidenceRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const rows = report.keys
    .map(
      (key) =>
        `| ${key.page} | ${key.position} | ${key.label} | ${key.status} | ${key.postcondition.observed} |`,
    )
    .join("\n");
  await writeFile(
    join(evidenceRoot, "report.md"),
    `# Connected ${canonicalKeyCount}-key evidence\n\n| Page | Position | Key | Status | Observed |\n| --- | --- | --- | --- | --- |\n${rows}\n\nCleanup: ${report.cleanup.equal ? "PASS" : "FAIL"}\n`,
  );
  for (const screenshot of screenshots) {
    await access(screenshot, constants.R_OK);
  }
  return evidenceRoot;
}

export async function profileArtifacts(root = resolve(".")) {
  const visualRoot = join(root, ".cache", "profile-visual-qa");
  const report = JSON.parse(
    await readFile(join(visualRoot, "report.json"), "utf8"),
  );
  if (
    report.keyCount !== canonicalKeyCount ||
    report.rasterArtifactCount !== canonicalKeyCount * 2
  ) {
    throw new Error("Physical visual artifacts are incomplete.");
  }
  return report;
}

export async function safeFile(path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Expected a regular file.");
  return path;
}
