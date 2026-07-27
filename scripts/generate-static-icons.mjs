import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const iconRoot = resolve("node_modules/lucide-static/icons");
const outputRoot = resolve(
  process.env.STREAMDECK_STATIC_ICON_ROOT ??
    "com.todd.streamdeckcodex.sdPlugin/imgs",
);
const checkOnly = process.argv.includes("--check");
const actionIcons = {
  agent: "circle-user-round",
  command: "command",
  context: "scan-text",
  keycap: "keyboard",
  model: "box",
  navigator: "compass",
  reasoning: "brain",
  usage: "gauge",
  workflow: "workflow",
};

await writeOrCheck(
  "plugin.svg",
  await surfaceIcon("message-square-code", "#9CD5FE", 512, 12),
);
await writeOrCheck(
  "category.svg",
  await listIcon("message-square-code", 56, 1.75),
);

for (const [file, icon] of Object.entries(actionIcons)) {
  await writeOrCheck(`actions/${file}.svg`, await listIcon(icon, 40, 1.25));
}

if (checkOnly) {
  for (const [size, file] of [
    [256, "plugin.png"],
    [512, "plugin@2x.png"],
  ]) {
    const image = await readFile(resolve(outputRoot, file));
    if (image.readUInt32BE(16) !== size || image.readUInt32BE(20) !== size) {
      throw new Error(`${file} must be ${size} × ${size}px.`);
    }
  }
} else {
  const rasterizer = "/opt/homebrew/bin/rsvg-convert";
  for (const [size, file] of [
    [256, "plugin.png"],
    [512, "plugin@2x.png"],
  ]) {
    const result = spawnSync(
      rasterizer,
      [
        "-w",
        String(size),
        "-h",
        String(size),
        "-o",
        resolve(outputRoot, file),
        resolve(outputRoot, "plugin.svg"),
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `${rasterizer} failed: ${result.stderr || result.stdout || result.error}`,
      );
    }
  }
}

async function writeOrCheck(relativePath, expected) {
  const destination = resolve(outputRoot, relativePath);
  if (checkOnly) {
    if ((await readFile(destination, "utf8")) !== expected) {
      throw new Error(`${relativePath} is stale; run npm run icons:static.`);
    }
  } else {
    await writeFile(destination, expected);
  }
}

async function surfaceIcon(iconName, accent, size, scale) {
  const source = await readFile(resolve(iconRoot, `${iconName}.svg`), "utf8");
  const openingSvg = source.indexOf("<svg");
  const inner = source
    .slice(source.indexOf(">", openingSvg) + 1, source.lastIndexOf("</svg>"))
    .replaceAll(/\s+/g, " ")
    .trim();
  const left = (size - 24 * scale) / 2;
  const radius = decimal(size * 0.19);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#151A23"/>
      <stop offset="1" stop-color="#080A0E"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="#07090C"/>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#surface)"/>
  <g transform="translate(${left} ${left}) scale(${scale})" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>
`;
}

async function listIcon(iconName, size, scale) {
  const source = await readFile(resolve(iconRoot, `${iconName}.svg`), "utf8");
  const openingSvg = source.indexOf("<svg");
  const inner = source
    .slice(source.indexOf(">", openingSvg) + 1, source.lastIndexOf("</svg>"))
    .replaceAll(/\s+/g, " ")
    .trim();
  const left = (size - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${left} ${left}) scale(${scale})" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>
`;
}

function decimal(value) {
  return Number(value.toFixed(3));
}
