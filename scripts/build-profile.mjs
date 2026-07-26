import { cp, mkdtemp, rename, rm } from "node:fs/promises";
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

try {
  const profileRoot = join(temporary, profileDirectory);
  const archive = join(temporary, "streamdeckcodex-plus.streamDeckProfile");
  await cp(source, profileRoot, { recursive: true });
  const result = spawnSync(
    "/usr/bin/zip",
    ["-q", "-r", archive, profileDirectory],
    { cwd: temporary, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ditto failed");
  }
  await rm(output, { force: true, recursive: true });
  await rename(archive, output);
  console.log(`Built ${output}`);
} finally {
  await rm(temporary, { force: true, recursive: true });
}
