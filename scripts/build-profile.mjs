import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generation = spawnSync(
  process.execPath,
  [join(root, "scripts", "generate-profile.mjs"), "--check"],
  { cwd: root, stdio: "inherit" },
);
if (generation.status !== 0)
  throw new Error("Profile source is stale; run npm run profile:generate.");
const keypadGeneration = spawnSync(
  process.execPath,
  [join(root, "scripts", "generate-keypad-profiles.mjs"), "--check"],
  { cwd: root, stdio: "inherit" },
);
if (keypadGeneration.status !== 0)
  throw new Error(
    "Keypad profile sources are stale; run npm run keypad-profiles:generate.",
  );
const keypadProfiles = JSON.parse(
  await readFile(join(root, "profile-src", "keypad-profiles.json"), "utf8"),
).devices;
const outputRoot = resolve(
  process.env.STREAMDECK_PROFILE_OUTPUT_ROOT ??
    join(root, "com.todd.streamdeckcodex.sdPlugin"),
);
const profiles = [
  {
    archiveName: "streamdeckcodex-plus",
    profileDirectory: "2533E930-E936-4286-84E4-70B4A8D75417.sdProfile",
  },
  ...keypadProfiles.map((profile) => ({
    archiveName: profile.archiveName,
    profileDirectory: `${profile.archiveName}.sdProfile`,
  })),
];
const temporary = await mkdtemp(join(tmpdir(), "streamdeckcodex-profile-"));
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
  await mkdir(outputRoot, { recursive: true });
  for (const profile of profiles) {
    const source = join(root, "profile-src", profile.archiveName);
    const profileRoot = join(temporary, profile.profileDirectory);
    const archive = join(temporary, `${profile.archiveName}.streamDeckProfile`);
    const output = join(outputRoot, `${profile.archiveName}.streamDeckProfile`);
    await cp(source, profileRoot, { recursive: true });
    const entries = [
      `${profile.profileDirectory}/`,
      ...(await archiveEntries(profileRoot)).map(
        (entry) => `${profile.profileDirectory}/${entry}`,
      ),
    ].sort();
    await normalizeArchiveTimes(temporary, entries);
    const result = spawnSync("/usr/bin/zip", ["-q", "-X", archive, "-@"], {
      cwd: temporary,
      encoding: "utf8",
      input: `${entries.join("\n")}\n`,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "zip failed");
    }
    await rename(archive, output);
    console.log(`Built ${output}`);
  }
} finally {
  await rm(temporary, { force: true, recursive: true });
}
