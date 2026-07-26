import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(".");
const outputRoot = resolve(process.argv[2] ?? ".cache/profile-visual-qa");
const profileRoot = resolve("profile-src", "streamdeckcodex-plus", "Profiles");
const rasterizer = "/opt/homebrew/bin/rsvg-convert";
const imageMagick = "/opt/homebrew/bin/magick";
const montageFont = "/System/Library/Fonts/Supplemental/Arial.ttf";

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const bundlePath = resolve(
  tmpdir(),
  `streamdeckcodex-profile-visuals-${randomUUID()}.mjs`,
);
await build({
  stdin: {
    contents: `
      export {
        agentKeySvg,
        commandKeySvg,
        contextKeySvg,
        keycapSvg,
        usageKeySvg,
      } from "./src/lib/visuals.ts";
      export { COMMANDS } from "./src/lib/commands.ts";
      export { WORKFLOWS } from "./src/lib/workflows.ts";
    `,
    resolveDir: root,
    sourcefile: "profile-visuals-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile: bundlePath,
});
const visuals = await import(pathToFileURL(bundlePath).href);

const pageSheets = [];
const physicalSheets = [];
const renderedKeys = [];
const sourcePages = [
  ["agents", "0D4C7F4C-666D-46B1-A787-7F2ABE2E12F0"],
  ["commands", "95B6205B-6011-4D73-8C91-B78957110300"],
  ["keycaps-1", "KEYCAPS-1"],
  ["keycaps-2", "KEYCAPS-2"],
  ["keycaps-3", "KEYCAPS-3"],
  ["keycaps-4", "KEYCAPS-4"],
];

for (const [slug, pageId] of sourcePages) {
  const page = JSON.parse(
    await readFile(join(profileRoot, pageId, "manifest.json"), "utf8"),
  );
  const keypad = page.Controllers.find(
    (controller) => controller.Type === "Keypad",
  );
  const pageDirectory = join(outputRoot, slug);
  await mkdir(pageDirectory, { recursive: true });
  const keyPngs = [];
  const keyPngs72 = [];
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const position = `${column},${row}`;
      const action = keypad.Actions[position];
      if (!action) continue;
      const svg = renderAction(action, column + row * 4);
      const stem = `${column}-${row}-${safeName(action.Name)}`;
      const svgPath = join(pageDirectory, `${stem}.svg`);
      const png144 = join(pageDirectory, `${stem}-144.png`);
      const png72 = join(pageDirectory, `${stem}-72.png`);
      await writeFile(svgPath, svg, "utf8");
      run(rasterizer, ["-w", "144", "-h", "144", "-o", png144, svgPath]);
      run(rasterizer, ["-w", "72", "-h", "72", "-o", png72, svgPath]);
      const colors72 = Number(
        run(imageMagick, [png72, "-format", "%k", "info:"]).trim(),
      );
      if (!Number.isFinite(colors72) || colors72 < 8) {
        throw new Error(`${action.Name} rendered blank at physical size.`);
      }
      keyPngs.push(png144);
      keyPngs72.push(png72);
      renderedKeys.push({
        colors72,
        name: action.Name,
        page: slug,
        position,
      });
    }
  }
  const sheet = join(outputRoot, `${slug}.png`);
  run(imageMagick, [
    "montage",
    ...keyPngs,
    "-font",
    montageFont,
    "-tile",
    "4x2",
    "-geometry",
    "144x144+8+8",
    "-background",
    "#05070A",
    sheet,
  ]);
  pageSheets.push(sheet);
  const physicalSheet = join(outputRoot, `${slug}-physical.png`);
  run(imageMagick, [
    "montage",
    ...keyPngs72,
    "-font",
    montageFont,
    "-tile",
    "4x2",
    "-geometry",
    "72x72+4+4",
    "-background",
    "#05070A",
    "-filter",
    "point",
    "-resize",
    "200%",
    physicalSheet,
  ]);
  physicalSheets.push(physicalSheet);
}

const staticRoot = resolve("com.todd.streamdeckcodex.sdPlugin/imgs");
const staticSvgs = [
  join(staticRoot, "plugin.svg"),
  join(staticRoot, "category.svg"),
  ...(await readdir(join(staticRoot, "actions")))
    .filter((file) => file.endsWith(".svg"))
    .sort()
    .map((file) => join(staticRoot, "actions", file)),
];
const staticPngs = [];
const staticDirectory = join(outputRoot, "static");
await mkdir(staticDirectory, { recursive: true });
for (const source of staticSvgs) {
  const destination = join(
    staticDirectory,
    `${safeName(basename(source, ".svg"))}.png`,
  );
  run(rasterizer, ["-w", "144", "-h", "144", "-o", destination, source]);
  staticPngs.push(destination);
}
const staticSheet = join(outputRoot, "static-assets.png");
run(imageMagick, [
  "montage",
  ...staticPngs,
  "-font",
  montageFont,
  "-tile",
  "4x3",
  "-geometry",
  "144x144+8+8",
  "-background",
  "#05070A",
  staticSheet,
]);
pageSheets.push(staticSheet);

const atlas = join(outputRoot, "all-pages.png");
run(imageMagick, [
  "montage",
  ...pageSheets,
  "-font",
  montageFont,
  "-tile",
  "2x4",
  "-geometry",
  "+12+12",
  "-background",
  "#030407",
  atlas,
]);
const physicalAtlas = join(outputRoot, "all-pages-physical.png");
run(imageMagick, [
  "montage",
  ...physicalSheets,
  "-font",
  montageFont,
  "-tile",
  "2x3",
  "-geometry",
  "+12+12",
  "-background",
  "#030407",
  physicalAtlas,
]);

const report = {
  atlas,
  physicalAtlas,
  keyCount: renderedKeys.length,
  minimumColorsAt72: Math.min(...renderedKeys.map(({ colors72 }) => colors72)),
  pages: sourcePages.length,
  sheets: pageSheets,
};
await writeFile(
  join(outputRoot, "report.json"),
  `${JSON.stringify({ ...report, keys: renderedKeys }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function renderAction(action, index) {
  const settings = action.Settings ?? {};
  switch (action.UUID) {
    case "com.todd.streamdeckcodex.agent-status": {
      const statuses = [
        "idle",
        "thinking",
        "unread",
        "needs-input",
        "error",
        "off",
      ];
      const labels = ["BUILD", "VISUAL", "POLISH", "REVIEW", "FIX", "EMPTY"];
      const status = statuses[index] ?? "idle";
      return visuals.agentKeySvg(
        status === "off"
          ? undefined
          : {
              cwd: "/tmp/streamdeckcodex",
              detail: "Visual QA",
              displayTitle: labels[index],
              id: `fixture-${index}`,
              isActive: index === 1,
              lastEventAt: 1,
              preview: "Visual QA",
              recencyAtMs: 1,
              rolloutPath: "/tmp/fixture.jsonl",
              sessionIndex: index,
              sessionLabel: labels[index],
              status,
              title: labels[index],
            },
        index,
      );
    }
    case "com.todd.streamdeckcodex.command": {
      const command = visuals.COMMANDS.find(
        (candidate) => candidate.id === settings.commandId,
      );
      if (!command) throw new Error(`Unknown command ${settings.commandId}`);
      return visuals.commandKeySvg(
        command.label,
        command.accent,
        command.icon,
        command.id === "plan" ? "ACTIVE" : undefined,
      );
    }
    case "com.todd.streamdeckcodex.workflow": {
      const workflow = visuals.WORKFLOWS.find(
        (candidate) => candidate.id === settings.workflowId,
      );
      if (!workflow) throw new Error(`Unknown workflow ${settings.workflowId}`);
      return visuals.commandKeySvg(
        workflow.label,
        workflow.accent,
        workflow.icon,
      );
    }
    case "com.todd.streamdeckcodex.usage":
      return visuals.usageKeySvg({
        observedAt: Date.now(),
        resetsAt: Date.now() / 1000 + 2 * 24 * 60 * 60,
        resetsAvailable: 3,
        usedPercent: 42,
      });
    case "com.todd.streamdeckcodex.context":
      return visuals.contextKeySvg({
        maxTokens: 258_000,
        observedAt: Date.now(),
        remainingPercent: 68,
        threadId: "fixture",
        usedTokens: 82_560,
      });
    case "com.todd.streamdeckcodex.keycap":
      return visuals.keycapSvg(
        settings.label,
        settings.description,
        settings.icon,
      );
    default:
      throw new Error(`No visual fixture for ${action.UUID}`);
  }
}

function safeName(value) {
  return String(value)
    .replaceAll(/[^a-z0-9._-]+/gi, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.stderr || result.stdout || result.error}`,
    );
  }
  return result.stdout;
}
