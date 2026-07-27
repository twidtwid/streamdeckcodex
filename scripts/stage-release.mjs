import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

const pluginPackage = resolve(
  "dist",
  "com.todd.streamdeckcodex.streamDeckPlugin",
);
const keypadProfiles = JSON.parse(
  await readFile(resolve("profile-src", "keypad-profiles.json"), "utf8"),
);
const profileNames = [
  ...keypadProfiles.devices.map((device) => device.archiveName),
  "streamdeckcodex-plus",
];

await mkdir(resolve("dist"), { recursive: true });
await readFile(pluginPackage);
const profileDestinations = [];
for (const profileName of profileNames) {
  const fileName = `${profileName}.streamDeckProfile`;
  const profileSource = resolve("com.todd.streamdeckcodex.sdPlugin", fileName);
  const profileDestination = resolve("dist", fileName);
  await copyFile(profileSource, profileDestination);
  profileDestinations.push(profileDestination);
}

const artifacts = [pluginPackage, ...profileDestinations];
const sums = [];
for (const artifact of artifacts) {
  const digest = createHash("sha256")
    .update(await readFile(artifact))
    .digest("hex");
  sums.push(`${digest}  ${basename(artifact)}`);
}

await writeFile(resolve("dist", "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
console.log("Staged GitHub release artifacts in dist/.");
