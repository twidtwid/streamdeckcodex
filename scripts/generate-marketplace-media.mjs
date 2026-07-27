import { access, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(".");
const outputRoot = resolve("marketplace/media");
const visualQaRoot = resolve(".cache/profile-visual-qa");
const magick = process.env.MAGICK ?? "magick";
const font = resolve(
  "assets/fonts/barlow-condensed/BarlowCondensed-BlackItalic.otf",
);
const sources = {
  agents: resolve(visualQaRoot, "agents.png"),
  appIcon: resolve("com.todd.streamdeckcodex.sdPlugin/imgs/plugin@2x.png"),
  commands: resolve(visualQaRoot, "commands.png"),
  keycaps1: resolve(visualQaRoot, "keycaps-1.png"),
  keycaps2: resolve(visualQaRoot, "keycaps-2.png"),
  keycaps3: resolve(visualQaRoot, "keycaps-3.png"),
  allPages: resolve(visualQaRoot, "all-pages.png"),
};
await ensureVisualQa();
await mkdir(outputRoot, { recursive: true });

await Promise.all([
  makeAppIcon(),
  makeThumbnail(),
  makeLiveStatusGallery(),
  makeControlsGallery(),
  makeWorkflowGallery(),
  makeCompatibilityGallery(),
]);

process.stdout.write(
  `Created Marketplace media in ${outputRoot}\n` +
    "- app-icon.png\n" +
    "- thumbnail.png\n" +
    "- gallery-01-live-status.png\n" +
    "- gallery-02-controls.png\n" +
    "- gallery-03-workflows.png\n" +
    "- gallery-04-key-actions.png\n",
);

async function ensureVisualQa() {
  try {
    await Promise.all(Object.values(sources).map((source) => access(source)));
  } catch {
    process.stdout.write(
      "Profile visual QA render is missing; generating it first.\n",
    );
    run(process.execPath, ["scripts/render-profile-visuals.mjs"]);
    await Promise.all(Object.values(sources).map((source) => access(source)));
  }
}

async function makeThumbnail() {
  const destination = resolve(outputRoot, "thumbnail.png");
  await canvas(
    destination,
    [
      text("CODEX COMPANION", 108, 86, 42, "#9CD5FE"),
      text("FOR STREAM DECK", 108, 136, 84, "#F7F9FC"),
      text(
        "Live chat status · focused controls · local by design",
        112,
        238,
        30,
        "#B9C4D5",
      ),
      text("KEYPAD ACTIONS FOR STREAM DECK", 112, 826, 27, "#9CD5FE"),
      text(
        "Profiles for every key deck · dials enhance Stream Deck +",
        112,
        870,
        26,
        "#B9C4D5",
      ),
    ],
    [
      layer(sources.agents, 1060, 110, 760),
      layer(sources.commands, 1060, 510, 760),
    ],
  );
}

async function makeAppIcon() {
  await runAsync(magick, [
    sources.appIcon,
    "-resize",
    "288x288",
    "-strip",
    "-define",
    "png:compression-level=9",
    resolve(outputRoot, "app-icon.png"),
  ]);
}

async function makeLiveStatusGallery() {
  await canvas(
    resolve(outputRoot, "gallery-01-live-status.png"),
    [
      eyebrow("LIVE CHAT STATUS"),
      ...heading("SEE RECENT CHATS", "AT A GLANCE"),
      body("Status, focus, unread work,", 126, 328),
      body("and input needs stay visible", 126, 366),
      body("on your Stream Deck keys.", 126, 404),
      rule(126, 492, 390, "#9CD5FE"),
      caption("STATUS KEYS", 126, 542, "#9CD5FE"),
      body("Idle · running · unread · needs input", 126, 582),
    ],
    [layer(sources.agents, 654, 196, 1130)],
  );
}

async function makeControlsGallery() {
  await canvas(
    resolve(outputRoot, "gallery-02-controls.png"),
    [
      eyebrow("FOCUSED CONTROLS"),
      ...heading("KEEP WORK", "MOVING"),
      body("Plan, permissions, push-to-talk,", 126, 328),
      body("usage, and context are available", 126, 366),
      body("from dedicated keys.", 126, 404),
      rule(126, 492, 390, "#C8A4FF"),
      caption("VISIBLE, VERIFIABLE ACTIONS", 126, 542, "#C8A4FF"),
      body("Designed to fail closed when focus is unclear.", 126, 582),
    ],
    [layer(sources.commands, 705, 236, 1080)],
  );
}

async function makeWorkflowGallery() {
  await canvas(
    resolve(outputRoot, "gallery-03-workflows.png"),
    [
      eyebrow("BUILT-IN WORKFLOWS"),
      ...heading("YOUR ROUTINE,", "ON KEYS"),
      body("Git and delivery, code quality,", 126, 328),
      body("decisions, workspace work, and", 126, 366),
      body("Codex panels have ready-made pages.", 126, 404),
      rule(126, 492, 390, "#FFD166"),
      caption("MODEL-SPECIFIC PROFILES", 126, 542, "#FFD166"),
      body("Each key uses the project's original generated artwork.", 126, 582),
    ],
    [
      layer(sources.keycaps1, 1240, 132, 440),
      layer(sources.keycaps2, 1240, 384, 440),
      layer(sources.keycaps3, 1240, 636, 440),
    ],
  );
}

async function makeCompatibilityGallery() {
  await canvas(
    resolve(outputRoot, "gallery-04-key-actions.png"),
    [
      eyebrow("KEYPAD ACTIONS"),
      ...heading("BUILT FOR", "BUTTONS"),
      body("Included layouts fit Stream Deck,", 126, 328),
      body("Mini, Neo, and XL without dropping", 126, 366),
      body("actions or adding fake dial controls.", 126, 404),
      rule(126, 492, 390, "#7EE787"),
      caption("STREAM DECK + ADDS DIALS", 126, 542, "#7EE787"),
      body("Agent, Action, Model, and Reasoning are optional dials.", 126, 582),
    ],
    [layer(sources.allPages, 1040, 148, 540)],
  );
}

async function canvas(destination, labels, layers) {
  const labelArguments = labels.flatMap((item) => [
    "-font",
    font,
    "-fill",
    item.fill,
    "-pointsize",
    String(item.size),
    "-kerning",
    String(item.kerning ?? 0),
    "-gravity",
    "northwest",
    "-annotate",
    `+${item.x}+${item.y}`,
    item.value,
  ]);
  const layerArguments = layers.flatMap((item) => [
    "(",
    item.source,
    "-resize",
    `${item.width}x`,
    "-bordercolor",
    "#253653",
    "-border",
    "8",
    "-geometry",
    `+${item.x}+${item.y}`,
    ")",
    "-compose",
    "over",
    "-composite",
  ]);
  await runAsync(magick, [
    "-size",
    "1920x960",
    "xc:#070A11",
    "-fill",
    "#101A2F",
    "-draw",
    "circle 1770,10 1330,10",
    "-blur",
    "0x110",
    "-fill",
    "#0A1020",
    "-draw",
    "rectangle 0,0 1920,960",
    "-fill",
    "#0B1427",
    "-draw",
    "polygon 780,0 1920,0 1920,960 1120,960",
    "-fill",
    "#24344F",
    "-stroke",
    "none",
    "-draw",
    "rectangle 84,78 91,886",
    ...labelArguments,
    ...layerArguments,
    "-strip",
    "-define",
    "png:compression-level=9",
    destination,
  ]);
}

function text(value, x, y, size, fill, kerning = 0) {
  return { value, x, y, size, fill, kerning };
}

function eyebrow(value) {
  return text(value, 126, 94, 34, "#9CD5FE", 1.6);
}

function heading(first, second) {
  return [
    text(first, 120, 142, 76, "#F7F9FC", 0.4),
    text(second, 120, 218, 76, "#F7F9FC", 0.4),
  ];
}

function body(value, x, y) {
  return text(value, x, y, 29, "#B9C4D5");
}

function caption(value, x, y, fill) {
  return text(value, x, y, 25, fill, 1.1);
}

function rule(x, y, width, fill) {
  return text(
    "━━━━━━━━━━━━",
    x,
    y,
    Math.max(10, Math.round(width / 18)),
    fill,
    0,
  );
}

function layer(source, x, y, width) {
  return { source, x, y, width };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.stderr || result.stdout || result.error}`,
    );
  }
}

function runAsync(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} failed: ${stderr}`));
    });
  });
}
