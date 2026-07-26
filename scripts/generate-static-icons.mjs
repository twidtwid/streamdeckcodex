import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const iconRoot = resolve("node_modules/lucide-static/icons");
const outputRoot = resolve("com.todd.streamdeckcodex.sdPlugin/imgs");
const actionIcons = {
  agent: ["circle-user-round", "#9CD5FE"],
  command: ["command", "#C8A4FF"],
  context: ["scan-text", "#79C0FF"],
  keycap: ["keyboard", "#D9DEE8"],
  model: ["box", "#C8A4FF"],
  navigator: ["compass", "#FFD166"],
  reasoning: ["brain", "#9CD5FE"],
  usage: ["gauge", "#7EE787"],
  workflow: ["workflow", "#7EE787"],
};

await writeFile(
  resolve(outputRoot, "plugin.svg"),
  await surfaceIcon("message-square-code", "#9CD5FE", 288, 7),
);
await writeFile(
  resolve(outputRoot, "category.svg"),
  await surfaceIcon("message-square-code", "#9CD5FE", 56, 1.5),
);

for (const [file, [icon, accent]] of Object.entries(actionIcons)) {
  await writeFile(
    resolve(outputRoot, "actions", `${file}.svg`),
    await surfaceIcon(icon, accent, 144, 3.25),
  );
}

const rasterizer = "/opt/homebrew/bin/rsvg-convert";
for (const [size, file] of [
  [144, "plugin.png"],
  [288, "plugin@2x.png"],
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

function decimal(value) {
  return Number(value.toFixed(3));
}
