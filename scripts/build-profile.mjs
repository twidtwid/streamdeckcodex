import { cp, mkdtemp, readdir, rename, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "profile-src", "streamdeckcodex-plus");
const output = join(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "streamdeckcodex-plus.streamDeckProfile",
);
const temporary = await mkdtemp(join(tmpdir(), "streamdeckcodex-profile-"));
const profileDirectory = "2533E930-E936-4286-84E4-70B4A8D75417.sdProfile";
const archiveTimestamp = new Date("2000-01-01T00:00:00.000Z");

async function archiveEntries(directory, relative = "") {
  const entries = [];
  for (const entry of await readdir(join(directory, relative), {
    withFileTypes: true,
  })) {
    const path = join(relative, entry.name);
    entries.push(entry.isDirectory() ? `${path}/` : path);
    if (entry.isDirectory()) {
      entries.push(...(await archiveEntries(directory, path)));
    }
  }
  return entries;
}

async function normalizeArchiveTimes(directory, entries) {
  await utimes(directory, archiveTimestamp, archiveTimestamp);
  for (const entry of entries) {
    await utimes(
      join(directory, entry.replace(/\/$/, "")),
      archiveTimestamp,
      archiveTimestamp,
    );
  }
}

try {
  const profileRoot = join(temporary, profileDirectory);
  const archive = join(temporary, "streamdeckcodex-plus.streamDeckProfile");
  await cp(source, profileRoot, { recursive: true });
  const entries = [
    `${profileDirectory}/`,
    ...(await archiveEntries(profileRoot)).map(
      (entry) => `${profileDirectory}/${entry}`,
    ),
  ].sort();
  await normalizeArchiveTimes(temporary, entries);
  const result = spawnSync("/usr/bin/zip", ["-q", "-X", archive, "-@"], {
    cwd: temporary,
    encoding: "utf8",
    input: `${entries.join("\n")}\n`,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ditto failed");
  }
  await rm(output, { force: true, recursive: true });
  await rename(archive, output);
  console.log(`Built ${output}`);
} finally {
  await rm(temporary, { force: true, recursive: true });
}
