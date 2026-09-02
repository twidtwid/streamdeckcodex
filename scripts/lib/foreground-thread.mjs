import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const THREAD_ID =
  /conversationId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const CHUNK_BYTES = 1024 * 1024;
const MAX_SCAN_BYTES = 128 * 1024 * 1024;
const OVERLAP_BYTES = 8 * 1024;

function range(path, start, end) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    const length = Math.max(0, end - start);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function witness(text, fallback) {
  const lines = text.split("\n");
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
    const id = line.match(THREAD_ID)?.[1];
    if (!id) continue;
    const timestamp = line.match(
      /(?:^|\s)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?:\s|$)/,
    )?.[1];
    const observedAt = timestamp ? Date.parse(timestamp) : Number.NaN;
    return {
      id,
      observedAt: Number.isFinite(observedAt) ? observedAt : fallback,
    };
  }
  return undefined;
}

function latestWitness(path) {
  const stat = statSync(path);
  const minimum = Math.max(0, stat.size - MAX_SCAN_BYTES);
  let end = stat.size;
  while (end > minimum) {
    const start = Math.max(minimum, end - CHUNK_BYTES);
    const windowStart = Math.max(minimum, start - OVERLAP_BYTES);
    const result = witness(range(path, windowStart, end), stat.mtimeMs);
    if (result) return { ...result, modifiedAt: stat.mtimeMs };
    end = start;
  }
  return undefined;
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
  return logs
    .slice(0, 8)
    .map(latestWitness)
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.observedAt - left.observedAt ||
        right.modifiedAt - left.modifiedAt,
    )[0]?.id;
}
