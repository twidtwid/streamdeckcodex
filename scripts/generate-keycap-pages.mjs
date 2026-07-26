import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = join(root, "profile-src", "streamdeckcodex-plus");
const templateId = "95B6205B-6011-4D73-8C91-B78957110300";
const pages = [
  // Official sheet, read left-to-right then top-to-bottom. The short second
  // line deliberately explains an otherwise inscrutable cap.
  ["Bug", "DEBUG AGENT", "debug", "info"],
  ["Codex", "OPEN SKILLS", "openai", "skills"],
  ["Terminal", "SHELL", "terminal", "info"],
  ["Download", "EXPORT", "download", "info"],
  ["Trash", "DISCARD", "trash", "info"],
  ["Edit", "DRAFT", "edit", "info"],
  ["Send", "PROMPT", "send", "command:send"],
  ["Spark", "SKILLS", "skills", "skills"],
  ["Inbox", "NEW CHAT", "inbox", "new-chat"],
  ["Run", "EXECUTE", "play", "info"],
  ["Branch", "GIT GRAPH", "branch", "info"],
  ["Back", "UNDO BRANCH", "branch-back", "info"],
  ["Branch+", "NEW BRANCH", "branch-add", "info"],
  ["Merge", "COMBINE", "merge", "info"],
  ["Brush", "REFACTOR", "paint", "info"],
  ["Flask", "TESTS", "tests", "info"],
  ["Party", "DONE", "confetti", "info"],
  ["Clock", "WAIT", "clock", "info"],
  ["Think", "THINKING", "brain-medium", "info"],
  ["Reason", "REASONING", "brain-outline", "info"],
  ["Fast", "QUICK PASS", "bolt", "command:fast"],
  ["Accept", "APPROVE", "accept", "command:accept"],
  ["Reject", "DECLINE", "reject", "command:reject"],
  ["Enter", "SEND", "enter", "command:send"],
  ["Settings", "CONFIGURE", "settings", "info"],
  ["Folder+", "NEW PROJECT", "folder-plus", "info"],
  ["Upload", "SHARE", "cloud-upload", "info"],
  ["Apps", "MORE TOOLS", "apps", "skills"],
  ["YOLO", "Permissions", "yolo", "info"],
  ["YEET", "Review publish", "yeet", "info"],
  ["Voice", "Push to talk", "dictate", "info"],
  ["Cloud", "Codex", "cloud", "skills"],
];

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
      ActionID: randomUUID(),
      LinkedTitle: false,
      Name: `${label} — ${description}`,
      Resources: null,
      Settings: { label, description, icon, action },
      State: 0,
      States: [{ Image: "", TitleAlignment: "bottom" }],
      UUID: "com.todd.streamdeckcodex.keycap",
    };
  }
  manifest.Name = `Codex Icon Keyset ${page + 1}/4`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  rootManifest.Pages.Pages.push(id);
}
await writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2));
