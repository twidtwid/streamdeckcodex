import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { format } from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = join(root, "profile-src", "streamdeckcodex-plus");
const templateId = "95B6205B-6011-4D73-8C91-B78957110300";
const pages = [
  // Curated left-to-right, top-to-bottom. Ordinary keys use one clear label.
  // A second line is reserved for the primary YEET/YOLO wordmarks only.
  ["Branch info", "", "branch", "workflow:branch"],
  ["New branch", "", "branch-add", "workflow:new-branch"],
  ["Merge", "", "merge", "workflow:merge"],
  ["Diff", "", "diff", "workflow:diff"],
  ["Commit", "", "commit", "workflow:commit"],
  ["Push", "", "push", "workflow:push"],
  ["Ship prep", "", "release", "workflow:release"],
  ["Deploy", "", "deploy", "workflow:deploy"],
  ["Refactor", "", "refactor", "workflow:refactor"],
  ["Add tests", "", "tests", "workflow:tests"],
  ["Search", "", "search", "workflow:search"],
  ["Explain", "", "explain", "workflow:explain"],
  ["Document", "", "document", "workflow:document"],
  ["Optimize", "", "optimize", "workflow:optimize"],
  ["Audit", "", "audit", "workflow:audit"],
  ["Fix CI", "", "fix", "workflow:fix-ci"],
  ["Fast", "", "bolt", "command:fast"],
  ["Accept", "", "accept", "command:accept"],
  ["Reject", "", "reject", "command:reject"],
  ["Send", "", "send", "command:send"],
  ["Explore", "", "brain-medium", "workflow:explore"],
  ["Analyze", "", "brain-outline", "workflow:analyze"],
  ["Summarize", "", "summarize", "workflow:summarize"],
  ["Define goal", "", "goal", "workflow:goal"],
  ["Run shell", "", "terminal", "workflow:terminal"],
  ["Edit code", "", "edit", "workflow:editor"],
  ["New project", "", "folder-plus", "workflow:new-project"],
  ["Upload", "", "cloud-upload", "workflow:upload"],
  ["Skills", "", "skills", "skills"],
  ["Chat audit", "", "sessions", "workflow:sessions"],
  ["Sidebar", "", "sidebar", "command:sidebar"],
  ["Tune setup", "", "settings", "workflow:settings"],
];
const pageNames = ["Git & Delivery", "Code Quality", "Decisions", "Workspace"];

const rootManifestPath = join(profile, "manifest.json");
const rootManifest = JSON.parse(await readFile(rootManifestPath, "utf8"));
rootManifest.Pages.Pages = rootManifest.Pages.Pages.filter(
  (id) => !String(id).startsWith("KEYCAPS-"),
);
for (let page = 0; page < 4; page += 1) {
  const id = `KEYCAPS-${page + 1}`;
  const folder = join(profile, "Profiles", id);
  await cp(join(profile, "Profiles", templateId), folder, {
    recursive: true,
    force: true,
  });
  const manifestPath = join(folder, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const actions = manifest.Controllers.find(
    (controller) => controller.Type === "Keypad",
  ).Actions;
  const entries = pages.slice(page * 8, page * 8 + 8);
  for (const [index, [label, description, icon, action]] of entries.entries()) {
    const key = `${index % 4},${Math.floor(index / 4)}`;
    actions[key] = {
      ActionID: stableActionId(page, key),
      LinkedTitle: false,
      Name: description ? `${label} — ${description}` : label,
      Resources: null,
      Settings: { label, description, icon, action },
      State: 0,
      States: [{ Image: "", TitleAlignment: "bottom" }],
      UUID: "com.todd.streamdeckcodex.keycap",
    };
  }
  manifest.Name = pageNames[page];
  await writeFile(
    manifestPath,
    await format(JSON.stringify(manifest), { parser: "json" }),
  );
  rootManifest.Pages.Pages.push(id);
}
await writeFile(
  rootManifestPath,
  await format(JSON.stringify(rootManifest), { parser: "json" }),
);

function stableActionId(page, key) {
  const bytes = createHash("sha256")
    .update(`streamdeckcodex:keycap:${page + 1}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
