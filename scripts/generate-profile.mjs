import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { format } from "prettier";

const root = resolve(".");
const sourceRoot = resolve(
  process.env.STREAMDECK_PROFILE_SOURCE_ROOT ??
    join(root, "profile-src", "streamdeckcodex-plus"),
);
const contract = JSON.parse(
  await readFile(join(root, "profile-src", "profile-contract.json"), "utf8"),
);
const check = process.argv.includes("--check");
const rootManifestPath = join(sourceRoot, "manifest.json");
const rootManifest = JSON.parse(await readFile(rootManifestPath, "utf8"));

rootManifest.Name = contract.profile.name;
rootManifest.PreconfiguredName = contract.profile.preconfiguredName;
rootManifest.Pages.Pages = contract.pages.map((page) => page.id);
rootManifest.Pages.Current = contract.pages[0].id;

await writeExpected(rootManifestPath, rootManifest);
for (const page of contract.pages) {
  const manifestPath = join(sourceRoot, "Profiles", page.id, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const keypad = manifest.Controllers.find(
    (controller) => controller.Type === "Keypad",
  );
  if (!keypad) throw new Error(`Page ${page.id} has no Keypad controller.`);
  manifest.Name = page.name;
  keypad.Actions = Object.fromEntries(
    page.keys.map((key) => [
      key.position,
      {
        ActionID: key.actionId,
        LinkedTitle: false,
        Name: key.name,
        Resources: null,
        Settings: key.settings,
        State: 0,
        States: [{ Image: "", TitleAlignment: "bottom" }],
        UUID: key.uuid,
      },
    ]),
  );
  await writeExpected(manifestPath, manifest);
}

if (check) {
  console.log(
    `Profile source matches ${contract.pages.length} contract pages.`,
  );
} else {
  console.log(`Generated ${contract.pages.length} contract pages.`);
}

async function writeExpected(path, value) {
  const expected = await format(JSON.stringify(value), { parser: "json" });
  const actual = await readFile(path, "utf8");
  if (check) {
    if (actual !== expected)
      throw new Error(`${path} is stale; run npm run profile:generate.`);
    return;
  }
  await writeFile(path, expected);
}
