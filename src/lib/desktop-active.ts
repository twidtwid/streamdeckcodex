import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_THREAD_ID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function readLogTail(path: string, maxBytes = 4 * 1024 * 1024): string {
  let file: number | undefined;
  try {
    file = openSync(path, "r");
    const size = fstatSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    readSync(file, buffer, 0, buffer.length, start);
    const content = buffer.toString("utf8");
    if (start === 0) return content;
    const firstNewline = content.indexOf("\n");
    return firstNewline < 0 ? "" : content.slice(firstNewline + 1);
  } catch {
    return "";
  } finally {
    if (file !== undefined) closeSync(file);
  }
}

export function parseActiveDesktopThreadId(
  desktopLogTail: string,
): string | undefined {
  const lines = desktopLogTail.split("\n");
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
    const match = line.match(
      new RegExp(`conversationId=(${CODEX_THREAD_ID})`, "i"),
    );
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function localLogDateParts(date: Date): string[] {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
}

export function activeDesktopThreadId(
  logRoot = join(homedir(), "Library", "Logs", "com.openai.codex"),
  now = new Date(),
): string | undefined {
  const dates = [now, new Date(now.getTime() - 24 * 60 * 60 * 1000)];
  const candidates = dates.flatMap((date) => {
    const directory = join(logRoot, ...localLogDateParts(date));
    try {
      return readdirSync(directory)
        .filter((name) => name.endsWith(".log"))
        .map((name) => {
          const path = join(directory, name);
          return { path, modifiedAt: statSync(path).mtimeMs };
        });
    } catch {
      return [];
    }
  });
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const candidate of candidates.slice(0, 8)) {
    const threadId = parseActiveDesktopThreadId(readLogTail(candidate.path));
    if (threadId) return threadId;
  }
  return undefined;
}
