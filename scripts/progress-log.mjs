import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const line = process.argv.slice(2).join(" ").replace(/\s+/g, " ").trim();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const activityPath =
  process.env.CODEX_PROGRESS_ACTIVITY_PATH ||
  join(root, ".cache", "progress", "activity.jsonl");

async function appendDirectly() {
  const entry = {
    at: new Date().toISOString(),
    kind: "transition",
    line: line.slice(0, 500),
  };
  await mkdir(dirname(activityPath), { recursive: true });
  await appendFile(activityPath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

if (!line) {
  console.error('Usage: npm run progress:log -- "Current activity line"');
  process.exitCode = 2;
} else {
  const port = Number.parseInt(process.env.CODEX_PROGRESS_PORT || "4317", 10);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line, kind: "transition" }),
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) {
      throw new Error(`Progress endpoint returned HTTP ${response.status}`);
    }
    const result = await response.json();
    console.log(`${result.entry.at} ${result.entry.line}`);
  } catch {
    // The feed reads the same append-only file on every refresh. Writing it
    // directly keeps transitions live when localhost is sandboxed or the
    // status server is briefly restarting.
    const entry = await appendDirectly();
    console.log(`${entry.at} ${entry.line}`);
  }
}
