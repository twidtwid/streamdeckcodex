import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profileArgument = process.argv[2] ?? process.env.STREAM_DECK_PROFILE;
if (!profileArgument) {
  throw new Error(
    "Provide the target .sdProfile path as an argument or set STREAM_DECK_PROFILE.",
  );
}
const profileRoot = resolve(profileArgument);
const pageTemplateId = "EC486D36-A1D0-46B0-B3C7-064A1D4483A6";
const sourceRoot = join(
  root,
  "profile-src",
  "streamdeckcodex-plus",
  "Profiles",
);
const manifestPath = join(profileRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const keycapPageIds = manifest.Pages.Pages.slice(2, 6);
if (keycapPageIds.length !== 4) {
  throw new Error(
    "Create exactly four blank pages in the active profile before installing the keyset.",
  );
}
const sharedPage = JSON.parse(
  await readFile(
    join(profileRoot, "Profiles", pageTemplateId, "manifest.json"),
    "utf8",
  ),
);
const sharedEncoders = sharedPage.Controllers.find(
  (controller) => controller.Type === "Encoder",
).Actions;

for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
  const id = keycapPageIds[pageNumber - 1];
  const destination = join(profileRoot, "Profiles", id.toUpperCase());

  const source = JSON.parse(
    await readFile(
      join(sourceRoot, `KEYCAPS-${pageNumber}`, "manifest.json"),
      "utf8",
    ),
  );
  const targetPath = join(destination, "manifest.json");
  const target = JSON.parse(await readFile(targetPath, "utf8"));
  const sourceKeypad = source.Controllers.find(
    (controller) => controller.Type === "Keypad",
  );
  const targetKeypad = target.Controllers.find(
    (controller) => controller.Type === "Keypad",
  );
  const targetEncoders = target.Controllers.find(
    (controller) => controller.Type === "Encoder",
  );
  targetKeypad.Actions = sourceKeypad.Actions;
  targetEncoders.Actions = sharedEncoders;
  target.Name = source.Name;
  await writeFile(targetPath, JSON.stringify(target, null, 2));
}

console.log("Installed four Codex Icon Keyset pages into the active profile.");
