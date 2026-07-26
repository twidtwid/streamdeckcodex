import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profileArgument = process.argv[2] ?? process.env.STREAM_DECK_PROFILE;
if (!profileArgument) {
  throw new Error(
    "Provide the target .sdProfile path as an argument or set STREAM_DECK_PROFILE.",
  );
}

const sourceProfile = join(root, "profile-src", "streamdeckcodex-plus");
const targetProfile = resolve(profileArgument);
const sourceManifest = JSON.parse(
  await readFile(join(sourceProfile, "manifest.json"), "utf8"),
);
const targetManifest = JSON.parse(
  await readFile(join(targetProfile, "manifest.json"), "utf8"),
);
const sourcePageIds = sourceManifest.Pages?.Pages ?? [];
const targetPageIds = targetManifest.Pages?.Pages ?? [];

if (sourcePageIds.length !== 6 || targetPageIds.length !== 6) {
  throw new Error(
    `Source and target must each have exactly six pages; observed ${sourcePageIds.length} and ${targetPageIds.length}.`,
  );
}

for (let index = 0; index < sourcePageIds.length; index += 1) {
  const sourcePath = await pageManifestPath(
    sourceProfile,
    sourcePageIds[index],
  );
  const targetPath = await pageManifestPath(
    targetProfile,
    targetPageIds[index],
  );
  const sourcePage = JSON.parse(await readFile(sourcePath, "utf8"));
  const targetPage = JSON.parse(await readFile(targetPath, "utf8"));

  for (const type of ["Keypad", "Encoder"]) {
    const sourceController = sourcePage.Controllers.find(
      (controller) => controller.Type === type,
    );
    const targetController = targetPage.Controllers.find(
      (controller) => controller.Type === type,
    );
    if (!sourceController || !targetController) {
      throw new Error(
        `Page ${index + 1} is missing its ${type} controller in source or target.`,
      );
    }
    targetController.Actions = sourceController.Actions;
  }

  targetPage.Name = sourcePage.Name;
  await writeFile(targetPath, `${JSON.stringify(targetPage, null, 2)}\n`);
}

console.log(`Installed all six Codex Companion pages into ${targetProfile}.`);

async function pageManifestPath(profileRoot, requestedId) {
  const profilesRoot = join(profileRoot, "Profiles");
  const directories = await readdir(profilesRoot);
  const directory = directories.find(
    (candidate) =>
      candidate.toLocaleUpperCase() === String(requestedId).toLocaleUpperCase(),
  );
  if (!directory) {
    throw new Error(
      `Profile page ${requestedId} is missing under ${profilesRoot}.`,
    );
  }
  return join(profilesRoot, directory, "manifest.json");
}
