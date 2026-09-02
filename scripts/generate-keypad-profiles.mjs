import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { format } from "prettier";

const root = resolve(".");
const check = process.argv.includes("--check");
// Tests point this at a scratch copy so a stale fixture can be checked
// without touching the tracked sources.
const keypadRoot = resolve(
  process.env.STREAMDECK_KEYPAD_PROFILE_ROOT ?? join(root, "profile-src"),
);
const contract = JSON.parse(
  await readFile(join(root, "profile-src", "profile-contract.json"), "utf8"),
);
const configuration = JSON.parse(
  await readFile(join(root, "profile-src", "keypad-profiles.json"), "utf8"),
);

const pageGroups = [
  contract.pages[1],
  contract.pages[0],
  ...contract.pages.slice(2),
];

for (const device of configuration.devices) {
  await generateDeviceProfile(device);
}

console.log(
  `${check ? "Checked" : "Generated"} ${configuration.devices.length} keypad-only profile sources.`,
);

async function generateDeviceProfile(device) {
  const sourceRoot = join(keypadRoot, device.archiveName);
  const pages = createPages(device);
  const defaultPageId = deterministicUuid(`${device.slug}:default`);
  const rootManifest = {
    Device: { Model: device.model, UUID: "" },
    InstalledByPluginUUID: "com.todd.streamdeckcodex",
    Name: `Codex Companion — ${device.name}`,
    Pages: {
      Current: pages[0].id,
      Default: defaultPageId,
      Pages: pages.map((page) => page.id),
    },
    PreconfiguredName: `Codex Companion — ${device.name}`,
    Version: "3.0",
  };

  await writeExpected(join(sourceRoot, "manifest.json"), rootManifest);
  await writeExpected(
    join(sourceRoot, "Profiles", defaultPageId, "manifest.json"),
    {
      Controllers: [{ Actions: null, Type: "Keypad" }],
      Icon: "",
      Name: "",
    },
  );
  for (const page of pages) {
    await writeExpected(
      join(sourceRoot, "Profiles", page.id, "manifest.json"),
      {
        Controllers: [
          {
            Actions: Object.fromEntries(
              page.keys.map((key, index) => [
                positionFor(index, device.columns),
                {
                  ActionID: deterministicUuid(
                    `${device.slug}:${page.id}:${key.actionId}`,
                  ),
                  LinkedTitle: false,
                  Name: key.name,
                  Resources: null,
                  Settings: key.settings,
                  State: 0,
                  States: [{ Image: "", TitleAlignment: "bottom" }],
                  UUID: key.uuid,
                },
              ]),
            ),
            Type: "Keypad",
          },
        ],
        Icon: "",
        Name: page.name,
      },
    );
  }
}

function createPages(device) {
  const capacity = device.columns * device.rows;
  return pageGroups.flatMap((group) => {
    const chunkCount = Math.ceil(group.keys.length / capacity);
    return Array.from({ length: chunkCount }, (_, chunkIndex) => {
      const number = chunkIndex + 1;
      return {
        id: deterministicUuid(`${device.slug}:${group.id}:${number}`),
        keys: group.keys.slice(chunkIndex * capacity, number * capacity),
        name:
          chunkCount === 1
            ? group.name
            : `${group.name} ${number}/${chunkCount}`,
      };
    });
  });
}

function positionFor(index, columns) {
  return `${index % columns},${Math.floor(index / columns)}`;
}

function deterministicUuid(input) {
  const hash = createHash("sha256").update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function writeExpected(path, value) {
  const expected = await format(JSON.stringify(value), { parser: "json" });
  if (check) {
    let actual;
    try {
      actual = await readFile(path, "utf8");
    } catch {
      throw new Error(`${path} is missing; run npm run profile:generate.`);
    }
    if (actual !== expected)
      throw new Error(`${path} is stale; run npm run profile:generate.`);
    return;
  }
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, expected);
}
