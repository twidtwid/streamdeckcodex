import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(".");
const sourceProfile = resolve("profile-src", "streamdeckcodex-plus");
const visualRoot = resolve(".cache", "profile-visual-qa");
const outputRoot = resolve(".cache", "profile-design-eval");
const installedFlag = process.argv.indexOf("--installed");
const installedProfile =
  installedFlag >= 0 && process.argv[installedFlag + 1]
    ? resolve(process.argv[installedFlag + 1])
    : undefined;
const livePagesFlag = process.argv.indexOf("--live-pages");
const livePagesRoot =
  livePagesFlag >= 0 && process.argv[livePagesFlag + 1]
    ? resolve(process.argv[livePagesFlag + 1])
    : undefined;
const releaseMode = process.argv.includes("--release");
const contract = JSON.parse(
  await readFile(resolve("profile-src", "profile-contract.json"), "utf8"),
);
const expectedKeyCount = contract.pages.reduce(
  (total, page) => total + page.keys.length,
  0,
);
const expectedRasterArtifactCount = expectedKeyCount * 2;

const failures = [];
const warnings = [];
const evidence = [];
await mkdir(outputRoot, { recursive: true });
const { COMMANDS, KEYCAP_WORKFLOWS, LUCIDE_PATHS } = await loadRegistries();

const source = await readProfile(sourceProfile);
checkProfileRootState(source, "profile", true);
const keys = source.pages.flatMap((page, pageIndex) =>
  page.keys.map((key) => ({ ...key, page: pageIndex + 1 })),
);
const nonAgentKeys = keys.filter(
  (key) => key.uuid !== "com.todd.streamdeckcodex.agent-status",
);
const keycaps = keys.filter(
  (key) => key.uuid === "com.todd.streamdeckcodex.keycap",
);

check(source.pages.length === contract.pages.length, "profile.page-count", {
  expected: contract.pages.length,
  observed: source.pages.length,
});
check(keys.length === expectedKeyCount, "profile.key-count", {
  expected: `${expectedKeyCount} intentional keys; empty beats filler`,
  observed: keys.length,
});
const contractPages = contract.pages.map((page) => ({
  name: page.name,
  labels: page.keys.filter((key) => key.settings.label).map((key) => key.label),
  liveAnchors: page.visual.liveOcrAnchors,
  requiredLiveAnchors: page.visual.requiredLiveAnchors,
  requiresLivePercent: page.visual.requiresLivePercent,
}));
for (const [index, expected] of contractPages.entries()) {
  const page = source.pages[index];
  check(page?.name === expected.name, "profile.page-name", {
    page: index + 1,
    expected: expected.name,
    observed: page?.name,
  });
  if (expected.labels.length) {
    check(
      JSON.stringify(
        page.keys.map((key) => key.settings.label).filter(Boolean),
      ) === JSON.stringify(expected.labels),
      "profile.page-membership",
      {
        page: index + 1,
        expected: expected.labels,
        observed: page.keys.map((key) => key.settings.label).filter(Boolean),
      },
    );
  }
}
if (releaseMode) {
  check(Boolean(installedProfile), "release.installed-evidence-required", {});
  check(Boolean(livePagesRoot), "release.live-evidence-required", {});
}

const at = (page, position) =>
  keys.find((key) => key.page === page && key.position === position);
const page2Contract = contract.pages[1].keys.map((key) => [
  key.position,
  key.uuid,
  key.settings,
]);
for (const [position, uuid, settings] of page2Contract) {
  const key = at(2, position);
  check(
    key?.uuid === uuid && matchesContract(key, settings),
    "live-controls.position-contract",
    {
      position,
      expected: { uuid, settings },
      observed: normalizeKey(key),
    },
  );
}
check(
  at(2, "1,0")?.uuid === "com.todd.streamdeckcodex.approval-mode" &&
    at(2, "1,0")?.settings.mode === "yolo",
  "live-controls.approval-contract",
  {
    expected: "Page 2 / 1,0 / stateful YOLO approval action",
    observed: describeKey(at(2, "1,0")),
  },
);
check(
  matchesContract(at(2, "0,1"), {
    label: "YEET",
    description: "Publish",
    icon: "yeet",
    action: "workflow:publish",
  }),
  "live-controls.yeet-contract",
  {
    expected: "Page 2 / 0,1 / YEET / Publish / workflow:publish",
    observed: describeKey(at(2, "0,1")),
  },
);

for (const [name, uuid] of [
  ["Usage", "com.todd.streamdeckcodex.usage"],
  ["Context", "com.todd.streamdeckcodex.context"],
]) {
  const matches = keys.filter((key) => key.uuid === uuid);
  check(matches.length === 1, `singleton.${name.toLowerCase()}`, {
    expected: 1,
    observed: matches.map(describeKey),
  });
}

for (const icon of ["yeet"]) {
  const matches = keys.filter((key) => key.settings.icon === icon);
  check(matches.length === 1, `singleton.${icon}`, {
    expected: 1,
    observed: matches.map(describeKey),
  });
}
const approvalKeys = keys.filter(
  (key) => key.uuid === "com.todd.streamdeckcodex.approval-mode",
);
check(approvalKeys.length === 1, "singleton.approval-mode", {
  expected: 1,
  observed: approvalKeys.map(describeKey),
});

const rejectedIcons = new Set(["back", "forward", "branch-back"]);
for (const key of nonAgentKeys) {
  const label = normalized(key.settings.label ?? key.name);
  check(
    !/\b(back|forward|previous|next)\b/.test(label),
    "semantics.rejected-navigation-label",
    {
      key: describeKey(key),
      label,
    },
  );
  check(
    key.uuid !== "com.todd.streamdeckcodex.session-navigation",
    "semantics.rejected-navigation-action",
    { key: describeKey(key), uuid: key.uuid },
  );
  check(
    !rejectedIcons.has(normalized(key.settings.icon)),
    "semantics.rejected-navigation-icon",
    {
      key: describeKey(key),
      icon: key.settings.icon,
    },
  );
}

const copyPairs = [
  ["accept", "approve"],
  ["reject", "decline"],
  ["wait", "pause"],
  ["done", "complete"],
  ["run", "execute"],
  ["debug", "diagnose"],
  ["export", "download"],
  ["delete", "discard"],
  ["edit", "draft"],
  ["voice", "dictate"],
  ["settings", "configure"],
  ["new project", "create"],
  ["new branch", "create"],
];
for (const key of keycaps) {
  const label = normalized(key.settings.label);
  const description = normalized(key.settings.description);
  const isWordmark =
    key.settings.icon === "yolo" || key.settings.icon === "yeet";
  check(
    isWordmark ? description.length > 0 : description.length === 0,
    "copy.secondary-line-policy",
    {
      key: describeKey(key),
      rule: isWordmark
        ? "Wordmarks require one explanatory noun"
        : "Ordinary keys use one clear label; no redundant subtitle",
      description,
    },
  );
  for (const pair of copyPairs) {
    check(
      !pair.includes(label) || !pair.includes(description),
      "copy.synonym-pair",
      { key: describeKey(key), label, description },
    );
  }
  check(label.length <= 11, "copy.label-length", {
    key: describeKey(key),
    label,
    maximum: 11,
  });
  check(description.length <= 12, "copy.description-length", {
    key: describeKey(key),
    description,
    maximum: 12,
  });
  check(key.settings.action !== "info", "function.no-inert-key", {
    key: describeKey(key),
    action: key.settings.action,
  });
  const expectedName = key.settings.description
    ? `${key.settings.label} — ${key.settings.description}`
    : key.settings.label;
  check(key.name === expectedName, "copy.manifest-name-consistency", {
    key: describeKey(key),
    expected: expectedName,
    observed: key.name,
  });
}

const labels = new Map();
const icons = new Map();
for (const key of nonAgentKeys) {
  const label = normalized(key.settings.label ?? key.name);
  if (label) pushMap(labels, label, key);
  const icon = normalized(key.settings.icon);
  if (icon) pushMap(icons, icon, key);
}
for (const [label, matches] of labels) {
  check(matches.length === 1, "semantics.duplicate-label", {
    label,
    keys: matches.map(describeKey),
  });
}
for (const [icon, matches] of icons) {
  check(matches.length === 1, "semantics.duplicate-icon", {
    icon,
    keys: matches.map(describeKey),
  });
}

for (const key of nonAgentKeys) {
  const icon = key.settings.icon;
  if (!icon || icon === "yolo" || icon === "yeet") continue;
  check(Boolean(LUCIDE_PATHS[icon]), "icon.missing-lucide-source", {
    key: describeKey(key),
    icon,
  });
}
check(!LUCIDE_PATHS.openai, "licensing.no-openai-icon-alias", {});
const workflowIds = new Set(KEYCAP_WORKFLOWS.map((workflow) => workflow.id));
const commandIds = new Set(COMMANDS.map((command) => command.id));
for (const key of keycaps) {
  const action = String(key.settings.action ?? "");
  if (action.startsWith("workflow:")) {
    const id = action.slice("workflow:".length);
    check(workflowIds.has(id), "function.missing-workflow", {
      key: describeKey(key),
      action,
    });
  } else if (action.startsWith("command:")) {
    const id = action.slice("command:".length);
    check(commandIds.has(id), "function.missing-command", {
      key: describeKey(key),
      action,
    });
  } else {
    check(
      action === "skills" || action === "new-chat" || action === "new-project",
      "function.invalid-action",
      {
        key: describeKey(key),
        action,
      },
    );
  }
}
const usedPaths = new Map();
for (const key of nonAgentKeys) {
  const icon = key.settings.icon;
  if (!icon || icon === "yolo" || icon === "yeet") continue;
  const path = normalizedPath(LUCIDE_PATHS[icon]);
  if (path) pushMap(usedPaths, path, key);
}
for (const matches of usedPaths.values()) {
  check(matches.length === 1, "icon.duplicate-lucide-path", {
    keys: matches.map(describeKey),
    icons: matches.map((key) => key.settings.icon),
  });
}

await checkVisualEvidence();

if (installedProfile) {
  const installed = await readProfile(installedProfile);
  checkProfileRootState(installed, "installed", false);
  check(
    installed.pages.length === source.pages.length,
    "installed.page-count-parity",
    {
      source: source.pages.length,
      installed: installed.pages.length,
    },
  );
  check(
    installed.manifest.Name === source.manifest.Name,
    "installed.profile-name-parity",
    {
      expected: source.manifest.Name,
      observed: installed.manifest.Name,
    },
  );
  check(
    installed.manifest.PreconfiguredName === source.manifest.PreconfiguredName,
    "installed.preconfigured-name-parity",
    {
      expected: source.manifest.PreconfiguredName,
      observed: installed.manifest.PreconfiguredName,
    },
  );
  for (let index = 0; index < source.pages.length; index += 1) {
    const expectedPage = source.pages[index];
    const observedPage = installed.pages[index];
    check(
      observedPage?.name === expectedPage?.name,
      "installed.page-name-parity",
      {
        page: index + 1,
        expected: expectedPage?.name,
        observed: observedPage?.name,
      },
    );
    check(
      observedPage?.keys.length === expectedPage?.keys.length,
      "installed.key-count-parity",
      {
        page: index + 1,
        expected: expectedPage?.keys.length,
        observed: observedPage?.keys.length,
      },
    );
    for (const expected of expectedPage?.keys ?? []) {
      const observed = observedPage?.keys.find(
        (candidate) => candidate.position === expected.position,
      );
      check(
        JSON.stringify(normalizeKey(observed)) ===
          JSON.stringify(normalizeKey(expected)),
        "installed.key-parity",
        {
          page: index + 1,
          position: expected.position,
          expected: normalizeKey(expected),
          observed: normalizeKey(observed),
        },
      );
    }
  }
  evidence.push({
    id: "installed.profile-parity",
    profile: installedProfile,
    pages: installed.pages.length,
    keys: installed.pages.reduce((total, page) => total + page.keys.length, 0),
  });
}
if (livePagesRoot) await checkLivePages(livePagesRoot, contractPages);

const result = {
  status:
    failures.length > 0
      ? "fail"
      : releaseMode
        ? "release-pass"
        : installedProfile
          ? "installed-pass"
          : "source-pass",
  failureCount: failures.length,
  warningCount: warnings.length,
  failures,
  warnings,
  evidence,
};
await writeFile(
  join(outputRoot, "report.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
await writeFile(join(outputRoot, "report.md"), markdownReport(result));
process.stdout.write(
  `${JSON.stringify(
    {
      status: result.status,
      failureCount: failures.length,
      warningCount: warnings.length,
      report: join(outputRoot, "report.md"),
    },
    null,
    2,
  )}\n`,
);
if (failures.length) process.exitCode = 1;

async function checkVisualEvidence() {
  let report;
  try {
    report = JSON.parse(
      await readFile(join(visualRoot, "report.json"), "utf8"),
    );
  } catch {
    failures.push({
      id: "visual.missing-contact-sheet",
      detail: { expected: join(visualRoot, "report.json") },
    });
    return;
  }
  check(keys.length === expectedKeyCount, "profile.exact-key-count", {
    expected: expectedKeyCount,
    observed: keys.length,
  });
  check(report.keyCount === expectedKeyCount, "visual.rendered-key-count", {
    expected: expectedKeyCount,
    observed: report.keyCount,
  });
  check(
    report.rasterArtifactCount === expectedRasterArtifactCount,
    "visual.raster-artifact-count",
    {
      expected: expectedRasterArtifactCount,
      observed: report.rasterArtifactCount,
    },
  );
  evidence.push({
    id: "visual.color-count-observation",
    note: "Recorded only; color count is not a quality proxy.",
    minimumColorsAt144: report.minimumColorsAt144,
    minimumColorsAt72: report.minimumColorsAt72,
  });

  check(
    Array.isArray(report.keys) && report.keys.length === expectedKeyCount,
    "visual.per-key-artifacts",
    {
      expected: expectedKeyCount,
      observed: report.keys?.length,
    },
  );
  for (const rendered of report.keys ?? []) {
    for (const [size, artifact] of [
      [144, rendered.png144],
      [72, rendered.png72],
    ]) {
      let present = false;
      try {
        await readFile(artifact);
        present = true;
      } catch {}
      check(present, "visual.missing-raster-artifact", {
        key: rendered.name,
        size,
        artifact,
      });
    }
    check(Number(rendered.colors144) >= 8, "visual.color-mass-144", {
      key: rendered.name,
      colors: rendered.colors144,
    });
    check(Number(rendered.colors72) >= 8, "visual.color-mass-72", {
      key: rendered.name,
      colors: rendered.colors72,
    });
  }
  const observedRasterArtifacts = (report.keys ?? [])
    .flatMap((rendered) => [rendered.png144, rendered.png72])
    .filter(Boolean).length;
  check(
    observedRasterArtifacts === expectedRasterArtifactCount,
    "visual.observed-raster-artifact-count",
    {
      expected: expectedRasterArtifactCount,
      observed: observedRasterArtifacts,
    },
  );
  evidence.push({
    id: "visual.raster-artifacts",
    expected: expectedRasterArtifactCount,
    observed: observedRasterArtifacts,
  });

  const svgFiles = [
    ...new Set((report.keys ?? []).map(({ svgPath }) => svgPath)),
  ];
  check(svgFiles.length === expectedKeyCount, "visual.per-key-svg-artifacts", {
    expected: expectedKeyCount,
    observed: svgFiles.length,
  });
  for (const svgPath of svgFiles) {
    const svg = await readFile(svgPath, "utf8");
    check(!svg.includes("…"), "visual.no-ellipsis", {
      file: basename(svgPath),
    });
    check(!svg.includes('x="8" y="8"'), "visual.no-inset-card-frame", {
      file: basename(svgPath),
    });
    for (const size of [144, 72]) {
      const scale = size / 144;
      const pngPath = svgPath.replace(/\.svg$/, `-${size}.png`);
      const edgeSize = Math.round(12 * scale);
      for (const [edge, crop] of [
        ["top", `${size}x${edgeSize}+0+0`],
        ["bottom", `${size}x${edgeSize}+0+${size - edgeSize}`],
        ["left", `${edgeSize}x${size}+0+0`],
        ["right", `${edgeSize}x${size}+${size - edgeSize}+0`],
      ]) {
        const colors = runMagick([
          pngPath,
          "-crop",
          crop,
          "+repage",
          "-format",
          "%k",
          "info:",
        ]);
        check(Number(colors) === 1, "visual.safe-edge", {
          file: basename(svgPath),
          edge,
          size,
          colors: Number(colors),
        });
      }
      if (svgPath.includes("/keycaps-")) {
        const gapColors = runMagick([
          pngPath,
          "-crop",
          `${size}x${Math.round(8 * scale)}+0+${Math.round(89 * scale)}`,
          "+repage",
          "-format",
          "%k",
          "info:",
        ]);
        check(Number(gapColors) === 1, "visual.icon-caption-gap", {
          file: basename(svgPath),
          size,
          colors: Number(gapColors),
        });
      }
      const [width, height] = runMagick([
        pngPath,
        "-crop",
        `${size}x${Math.round(88 * scale)}+0+0`,
        "+repage",
        "-fuzz",
        "10%",
        "-transparent",
        "#090B0F",
        "-trim",
        "-format",
        "%w %h",
        "info:",
      ])
        .split(/\s+/)
        .map(Number);
      const alpha = Number(
        runMagick([
          pngPath,
          "-crop",
          `${size}x${Math.round(88 * scale)}+0+0`,
          "+repage",
          "-fuzz",
          "10%",
          "-transparent",
          "#090B0F",
          "-format",
          "%[fx:mean.a]",
          "info:",
        ]),
      );
      check(
        width >= Math.round(36 * scale) &&
          height >= Math.round(36 * scale) &&
          alpha >= 0.055,
        "visual.glyph-mass",
        {
          file: basename(svgPath),
          size,
          width,
          height,
          alpha,
          minimum: {
            width: Math.round(36 * scale),
            height: Math.round(36 * scale),
            alpha: 0.055,
          },
        },
      );
    }
  }
  evidence.push({
    id: "visual.contact-sheets",
    atlas: report.atlas,
    physicalAtlas: report.physicalAtlas,
    renderedKeys: report.keyCount,
  });
}

async function checkLivePages(directory, pages) {
  const signatures = [];
  for (let page = 1; page <= pages.length; page += 1) {
    const path = join(directory, `page-${page}.png`);
    let signature;
    try {
      signature = runMagick([
        path,
        "-crop",
        "360x260+95+110",
        "+repage",
        "-resize",
        "48x35!",
        "-colorspace",
        "gray",
        "-blur",
        "0x1.5",
        "-format",
        "%#",
        "info:",
      ]);
    } catch {
      failures.push({
        id: "live.missing-page-screenshot",
        detail: { page, path },
      });
      continue;
    }
    const ocrImage = join(outputRoot, `live-page-${page}-ocr.png`);
    runMagick([
      path,
      "-crop",
      "340x140+115+125",
      "+repage",
      "-resize",
      "1360x560",
      "-sharpen",
      "0x1",
      ocrImage,
    ]);
    const ocr = runOcr(ocrImage);
    const anchors = pages[page - 1].liveAnchors;
    const matched = anchors.filter((anchor) => ocr.includes(anchor));
    check(
      matched.length >= pages[page - 1].requiredLiveAnchors,
      "live.page-content",
      {
        page,
        expectedPage: pages[page - 1].name,
        anchors,
        matched,
        ocr,
      },
    );
    if (pages[page - 1].requiresLivePercent) {
      check(/(?:^|\s)\d{1,3}%(?:$|\s)/.test(ocr), "live.context-percentage", {
        page,
        expected: "Live Context numeric percentage",
        ocr,
      });
      check(
        !ocr.includes("no data") && !ocr.includes("--"),
        "live.context-no-placeholder",
        { page, ocr },
      );
    }
    signatures.push({ page, signature, path, matched });
  }
  check(
    new Set(signatures.map(({ signature }) => signature)).size === pages.length,
    "live.distinct-page-grids",
    {
      expected: pages.length,
      distinct: new Set(signatures.map(({ signature }) => signature)).size,
      pages: signatures,
    },
  );
  evidence.push({ id: "live.page-screenshots", pages: signatures });
}

async function loadRegistries() {
  const bundlePath = join(outputRoot, "registries.mjs");
  await build({
    stdin: {
      contents: `
        export { COMMANDS } from "./src/lib/commands.ts";
        export { KEYCAP_WORKFLOWS } from "./src/lib/keycap-workflows.ts";
        export { LUCIDE_PATHS } from "./src/lib/lucide-paths.ts";
      `,
      resolveDir: root,
      sourcefile: "design-eval-registries.ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    outfile: bundlePath,
  });
  return import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
}

async function readProfile(profileRoot) {
  const manifest = JSON.parse(
    await readFile(join(profileRoot, "manifest.json"), "utf8"),
  );
  const directories = await readdir(join(profileRoot, "Profiles"));
  const pages = [];
  for (const id of manifest.Pages.Pages) {
    const directory = directories.find(
      (candidate) => candidate.toUpperCase() === String(id).toUpperCase(),
    );
    if (!directory) {
      failures.push({
        id: "profile.missing-page-directory",
        detail: { profileRoot, id },
      });
      pages.push({ id, keys: [] });
      continue;
    }
    const page = JSON.parse(
      await readFile(
        join(profileRoot, "Profiles", directory, "manifest.json"),
        "utf8",
      ),
    );
    const keypad = page.Controllers.find(
      (controller) => controller.Type === "Keypad",
    );
    pages.push({
      id,
      name: page.Name,
      keys: Object.entries(keypad?.Actions ?? {})
        .map(([position, action]) => ({
          position,
          name: action.Name,
          uuid: action.UUID,
          settings: action.Settings ?? {},
        }))
        .sort((left, right) => {
          const [leftColumn, leftRow] = left.position.split(",").map(Number);
          const [rightColumn, rightRow] = right.position.split(",").map(Number);
          return leftRow - rightRow || leftColumn - rightColumn;
        }),
    });
  }
  return { manifest, directories, pages };
}

function checkProfileRootState(profile, prefix, requirePrimaryCurrent) {
  const visibleIds = profile.manifest.Pages?.Pages ?? [];
  const current = profile.manifest.Pages?.Current;
  const fallback = profile.manifest.Pages?.Default;
  if (requirePrimaryCurrent) {
    check(current === visibleIds[0], `${prefix}.current-page-is-primary`, {
      expected: visibleIds[0],
      observed: current,
    });
  } else {
    check(visibleIds.includes(current), `${prefix}.current-page-is-visible`, {
      visibleIds,
      observed: current,
    });
  }
  check(!visibleIds.includes(fallback), `${prefix}.default-page-is-hidden`, {
    visibleIds,
    observed: fallback,
  });
  check(
    profile.directories.some(
      (directory) => directory.toUpperCase() === String(fallback).toUpperCase(),
    ),
    `${prefix}.default-page-directory-exists`,
    { fallback },
  );
}

function check(condition, id, detail) {
  if (!condition) failures.push({ id, detail });
}

function normalized(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedPath(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesContract(key, settings) {
  if (!key) return false;
  return Object.entries(settings).every(
    ([name, value]) => key.settings[name] === value,
  );
}

function pushMap(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function describeKey(key) {
  if (!key) return "(missing)";
  return `Page ${key.page ?? "?"} ${key.position} ${key.name}`;
}

function normalizeKey(key) {
  if (!key) return null;
  const settings = { ...(key.settings ?? {}) };
  if (key.uuid === "com.todd.streamdeckcodex.approval-mode") {
    // This value is the live mode last confirmed by Codex, not profile
    // configuration. A working Permissions key is expected to change it.
    delete settings.mode;
  }
  return {
    position: key.position,
    name: key.name,
    uuid: key.uuid,
    settings: Object.fromEntries(
      Object.entries(settings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function runMagick(args) {
  const result = spawnSync(process.env.MAGICK ?? "magick", args, {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ImageMagick failed");
  }
  return result.stdout.trim();
}

function runOcr(path) {
  const result = spawnSync(
    "/usr/bin/swift",
    [resolve("scripts/ocr-image.swift"), path],
    {
      encoding: "utf8",
      timeout: 30000,
    },
  );
  if (result.status !== 0) {
    failures.push({
      id: "live.ocr-failed",
      detail: { path, stderr: result.stderr, stdout: result.stdout },
    });
    return "";
  }
  return normalized(result.stdout);
}

function markdownReport(result) {
  const lines = [
    "# Stream Deck profile design evaluation",
    "",
    `**Status:** ${result.status.toUpperCase()}`,
    "",
    `- Failures: ${result.failureCount}`,
    `- Warnings: ${result.warningCount}`,
    "",
    "## Release blockers",
    "",
  ];
  if (!result.failures.length) lines.push("None.");
  for (const failure of result.failures) {
    lines.push(`- \`${failure.id}\` — ${JSON.stringify(failure.detail)}`);
  }
  lines.push("", "## Evidence", "");
  for (const item of result.evidence) {
    lines.push(`- \`${item.id}\` — ${JSON.stringify(item)}`);
  }
  lines.push("");
  return lines.join("\n");
}
