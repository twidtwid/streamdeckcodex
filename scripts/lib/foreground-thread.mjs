import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const THREAD_ID =
  /conversationId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function tail(path, limit = 1024 * 1024) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    const size = statSync(path).size;
    const length = Math.min(size, limit);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function activeForegroundThreadId(now = new Date()) {
  const days = [now, new Date(now.getTime() - 24 * 60 * 60 * 1_000)];
  const logs = days.flatMap((day) => {
    const directory = join(
      homedir(),
      "Library",
      "Logs",
      "com.openai.codex",
      String(day.getUTCFullYear()),
      String(day.getUTCMonth() + 1).padStart(2, "0"),
      String(day.getUTCDate()).padStart(2, "0"),
    );
    try {
      return readdirSync(directory)
        .filter((entry) => entry.endsWith(".log"))
        .map((entry) => join(directory, entry));
    } catch {
      return [];
    }
  });
  logs.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  for (const path of logs.slice(0, 8)) {
    const lines = tail(path).split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index] ?? "";
      if (
        !line.includes("thread_stream_view_activity_changed") ||
        !line.includes("active=true") ||
        !line.includes("rendererWindowAppearance=primary") ||
        !line.includes("rendererWindowFocused=true")
      ) {
        continue;
      }
      const match = line.match(THREAD_ID);
      if (match?.[1]) return match[1];
    }
  }
  return undefined;
}
