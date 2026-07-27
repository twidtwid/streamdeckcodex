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
const contract = JSON.parse(
  await readFile(join(root, "profile-src", "profile-contract.json"), "utf8"),
);
const targetManifest = JSON.parse(
  await readFile(join(targetProfile, "manifest.json"), "utf8"),
);
const sourcePageIds = contract.pages.map((page) => page.id);
const targetPageIds = [...(targetManifest.Pages?.Pages ?? [])];

if (
  sourceManifest.Pages?.Pages?.join("\n") !== sourcePageIds.join("\n") ||
  targetPageIds.length !== sourcePageIds.length
) {
  throw new Error(
    `Source and target must both have ${sourcePageIds.length} pages; observed ${sourcePageIds.length} and ${targetPageIds.length}. If the target is short one page, use Stream Deck's Add Page button once before running this installer so Stream Deck registers the new page.`,
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

// Always leave the installed profile on its primary Agents & Sessions page.
// Stream Deck persists the last selected page in `Current`; preserving that
// value made a newly installed profile appear to be missing its primary
// agent controls whenever the target happened to be left on another page.
// `Default` is a separate hidden fallback page in Stream Deck's profile
// schema, so it must remain distinct from the seven visible page IDs.
targetManifest.Pages.Current = targetPageIds[0];
targetManifest.Name = sourceManifest.Name;
targetManifest.PreconfiguredName = sourceManifest.PreconfiguredName;
await writeFile(
  join(targetProfile, "manifest.json"),
  `${JSON.stringify(targetManifest, null, 2)}\n`,
);

console.log(
  `Installed all ${sourcePageIds.length} Codex Companion pages into ${targetProfile}; page 1 is current.`,
);

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
