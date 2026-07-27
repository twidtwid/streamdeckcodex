import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_THREAD_ID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DESKTOP_LOG_SCAN_CHUNK_BYTES = 1024 * 1024;
const DESKTOP_LOG_SCAN_LIMIT_BYTES = 128 * 1024 * 1024;
const DESKTOP_LOG_LINE_OVERLAP_BYTES = 8 * 1024;

interface DesktopLogCursor {
  size: number;
  witness?: DesktopActivityWitness;
}

export interface DesktopActivityWitness {
  conversationId: string;
  rendererWindowId: string;
  /** Byte offset immediately after the activity event in its log fragment. */
  cursor: number;
  observedAt: number;
}

const desktopLogCursors = new Map<string, DesktopLogCursor>();

export function parseActiveDesktopThreadId(
  desktopLogTail: string,
): string | undefined {
  return parseActiveDesktopWitness(desktopLogTail)?.conversationId;
}

/**
 * Return only a primary, focused activity event.  `cursor` is intentionally
 * relative to the supplied fragment so callers can require a fresh event
 * after their own saved file cursor rather than accepting cached focus state.
 */
export function parseActiveDesktopWitness(
  desktopLogTail: string,
  observedAt = Date.now(),
): DesktopActivityWitness | undefined {
  const lines = desktopLogTail.split("\n");
  let cursor = desktopLogTail.length;
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
    const conversation = line.match(
      new RegExp(`conversationId=(${CODEX_THREAD_ID})`, "i"),
    );
    const renderer = line.match(/rendererWindowId=([^\s]+)/i);
    if (conversation?.[1] && renderer?.[1]) {
      const timestamp = line.match(
        /(?:^|\s)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?:\s|$)/,
      )?.[1];
      const parsedTimestamp = timestamp ? Date.parse(timestamp) : Number.NaN;
      return {
        conversationId: conversation[1],
        rendererWindowId: renderer[1],
        cursor,
        observedAt: Number.isFinite(parsedTimestamp)
          ? parsedTimestamp
          : observedAt,
      };
    }
    cursor -= line.length + 1;
  }
  return undefined;
}

function readLogRange(path: string, start: number, end: number): string {
  let file: number | undefined;
  try {
    file = openSync(path, "r");
    const length = Math.max(0, end - start);
    const buffer = Buffer.alloc(length);
    readSync(file, buffer, 0, length, start);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    if (file !== undefined) closeSync(file);
  }
}

/**
 * Resolve the last focused task without assuming it lives in the final few
 * megabytes of a busy desktop log. Codex can append many megabytes of unrelated
 * diagnostics after the last task switch, which made a fixed tail silently
 * fall back to a stale log from the prior day.
 *
 * The first read walks backwards in bounded chunks. Later reads examine only
 * newly appended bytes and retain the last verified task when no switch event
 * was emitted.
 */
function latestDesktopWitnessInLog(
  path: string,
): DesktopActivityWitness | undefined {
  let size: number;
  let modifiedAt: number;
  try {
    const stat = statSync(path);
    size = stat.size;
    modifiedAt = stat.mtimeMs;
  } catch {
    desktopLogCursors.delete(path);
    return undefined;
  }

  const cached = desktopLogCursors.get(path);
  if (cached && size >= cached.size) {
    if (size === cached.size) return cached.witness;
    const start = Math.max(0, cached.size - DESKTOP_LOG_LINE_OVERLAP_BYTES);
    const appended = readLogRange(path, start, size);
    const updated = parseActiveDesktopWitness(appended, modifiedAt);
    const cursor = {
      size,
      ...((updated ?? cached.witness)
        ? { witness: updated ?? cached.witness }
        : {}),
    };
    desktopLogCursors.set(path, cursor);
    return cursor.witness;
  }

  const minimumOffset = Math.max(0, size - DESKTOP_LOG_SCAN_LIMIT_BYTES);
  let end = size;
  while (end > minimumOffset) {
    const start = Math.max(minimumOffset, end - DESKTOP_LOG_SCAN_CHUNK_BYTES);
    const windowStart = Math.max(
      minimumOffset,
      start - DESKTOP_LOG_LINE_OVERLAP_BYTES,
    );
    const witness = parseActiveDesktopWitness(
      readLogRange(path, windowStart, end),
      modifiedAt,
    );
    if (witness) {
      desktopLogCursors.set(path, { size, witness });
      return witness;
    }
    end = start;
  }
  desktopLogCursors.set(path, { size });
  return undefined;
}

function utcLogDateParts(date: Date): string[] {
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ];
}

export function activeDesktopThreadId(
  logRoot = join(homedir(), "Library", "Logs", "com.openai.codex"),
  now = new Date(),
): string | undefined {
  const dates = [now, new Date(now.getTime() - 24 * 60 * 60 * 1000)];
  const candidates = dates.flatMap((date) => {
    // Codex Desktop partitions logs by UTC date, not the Mac's local date.
    // Around local evening in western time zones, using local date parts skips
    // the current log directory and silently resolves a stale task.
    const directory = join(logRoot, ...utcLogDateParts(date));
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
  const newest = candidates
    .slice(0, 8)
    .map((candidate) => ({
      ...candidate,
      witness: latestDesktopWitnessInLog(candidate.path),
    }))
    .filter(
      (
        candidate,
      ): candidate is typeof candidate & {
        witness: DesktopActivityWitness;
      } => candidate.witness !== undefined,
    )
    .sort(
      (left, right) =>
        right.witness.observedAt - left.witness.observedAt ||
        right.modifiedAt - left.modifiedAt,
    )[0];
  return newest?.witness.conversationId;
}
