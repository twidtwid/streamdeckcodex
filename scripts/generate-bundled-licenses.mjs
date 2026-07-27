import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const pluginRoot = resolve("com.todd.streamdeckcodex.sdPlugin");
const checkOnly = process.argv.includes("--check");
const licenses = [
  ["@elgato/streamdeck", "node_modules/@elgato/streamdeck/LICENSE"],
  ["@elgato/schemas", "node_modules/@elgato/schemas/LICENSE"],
  ["@elgato/utils", "node_modules/@elgato/utils/LICENSE"],
  ["ws", "node_modules/ws/LICENSE"],
  ["zod", "node_modules/zod/LICENSE"],
  ["lucide-static", "node_modules/lucide-static/LICENSE"],
  ["Barlow", "assets/fonts/barlow-condensed/OFL.txt"],
];

const projectLicense = normalizeLicense(
  await readFile(resolve("LICENSE"), "utf8"),
);
const thirdPartyLicenses = (
  await Promise.all(
    licenses.map(async ([name, path]) => {
      const license = normalizeLicense(await readFile(resolve(path), "utf8"));
      return `================================================================================
${name}
================================================================================

${license}`;
    }),
  )
).join("\n\n");

await writeOrCheck("LICENSE.txt", projectLicense);
await writeOrCheck(
  "THIRD_PARTY_LICENSES.txt",
  `${thirdPartyLicenses.trim()}\n`,
);

async function writeOrCheck(file, expected) {
  const destination = resolve(pluginRoot, file);
  if (checkOnly) {
    if ((await readFile(destination, "utf8")) !== expected) {
      throw new Error(`${file} is stale; run npm run licenses:bundle.`);
    }
  } else {
    await writeFile(destination, expected);
  }
}

function normalizeLicense(license) {
  return license
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
