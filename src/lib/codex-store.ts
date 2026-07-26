import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentSnapshot,
  ContextSnapshot,
  ModelSnapshot,
  ReasoningSnapshot,
  ThreadRecord,
  UsageSnapshot,
} from "../types.js";
import type { SessionSnapshot } from "../types.js";
import { projectSessions } from "./chat-label.js";
import {
  DEFAULT_REASONING_LEVELS,
  normalizeReasoningLevels,
} from "./reasoning.js";
import { supportedModelOptions } from "./model.js";
import { parseRolloutLines } from "./rollout-status.js";
import { fetchAccountUsage, parseLatestUsage } from "./usage.js";
import { activeDesktopThreadId } from "./desktop-active.js";
import { parseLatestContext } from "./context.js";
import { readLiveInputState, type LiveInputState } from "./codex-ui-control.js";

export {
  activeDesktopThreadId,
  parseActiveDesktopThreadId,
} from "./desktop-active.js";

interface ThreadRow {
  id: string;
  rollout_path: string;
  cwd: string;
  title: string;
  preview: string;
  recency_at_ms: number;
  reasoning_effort: string | null;
  model: string | null;
  spawn_status: string | null;
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function resolveCodexHome(): string {
  const configured = process.env["CODEX_HOME"];
  return resolve(expandHome(configured || join(homedir(), ".codex")));
}

export function resolveStateDatabase(codexHome = resolveCodexHome()): string {
  const explicit = process.env["CODEX_SQLITE_HOME"];
  if (explicit) {
    const expanded = resolve(expandHome(explicit));
    return expanded.endsWith(".sqlite")
      ? expanded
      : join(expanded, "state_5.sqlite");
  }

  try {
    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    const match = config.match(/^\s*sqlite_home\s*=\s*["']([^"']+)["']/m);
    if (match?.[1]) {
      const configuredHome = resolve(expandHome(match[1]));
      return join(configuredHome, "state_5.sqlite");
    }
  } catch {
    // The default location remains authoritative when no readable config exists.
  }
  return join(codexHome, "state_5.sqlite");
}

export function readFileTail(path: string, maxBytes = 512 * 1024): string {
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

export function readableThreadTitle(
  thread: Pick<ThreadRecord, "title" | "preview">,
): string {
  const candidate = thread.title || thread.preview || "Untitled chat";
  const inputMatch = candidate.match(/<input>([\s\S]*?)<\/input>/i);
  const raw = inputMatch?.[1] ?? candidate;
  const cleaned = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled chat";
}

export function applyFocusedLiveInput(
  snapshots: AgentSnapshot[],
  focusedThreadId: string | undefined,
  liveInput: LiveInputState | undefined,
): AgentSnapshot[] {
  if (liveInput?.pending !== true) return snapshots;
  const normalizedTitle = liveInput.title
    ?.toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const titleMatch = normalizedTitle
    ? snapshots.find((snapshot) => {
        const candidate = readableThreadTitle(snapshot)
          .toLocaleLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        return (
          normalizedTitle.length >= 12 &&
          (candidate.startsWith(normalizedTitle) ||
            normalizedTitle.startsWith(candidate.slice(0, 24)))
        );
      })?.id
    : undefined;
  const targetThreadId = titleMatch ?? focusedThreadId;
  if (!targetThreadId) return snapshots;
  return snapshots.map((snapshot) =>
    snapshot.id === targetThreadId
      ? {
          ...snapshot,
          status: "needs-input",
          detail:
            liveInput.kind === "approval"
              ? "Approval required"
              : "Needs your input",
        }
      : snapshot,
  );
}

export function supportedReasoningLevels(
  parsed: unknown,
  model?: string,
): string[] {
  if (typeof parsed === "object" && parsed !== null) {
    const models = Array.isArray((parsed as { models?: unknown }).models)
      ? (
          parsed as {
            models: Array<{
              slug?: string;
              supported_reasoning_levels?: Array<{ effort?: string }>;
            }>;
          }
        ).models
      : [];
    const active = model
      ? models.find((candidate) => candidate.slug === model)
      : undefined;
    const activeLevels = active?.supported_reasoning_levels
      ?.map((entry) => entry.effort)
      .filter((effort): effort is string => typeof effort === "string");
    if (activeLevels?.length) return normalizeReasoningLevels(activeLevels);

    const fallbackLevels = models.flatMap(
      (candidate) =>
        candidate.supported_reasoning_levels
          ?.map((entry) => entry.effort)
          .filter((effort): effort is string => typeof effort === "string") ??
        [],
    );
    if (fallbackLevels.length) {
      return normalizeReasoningLevels(fallbackLevels);
    }
  }
  return [...DEFAULT_REASONING_LEVELS];
}

function modelReasoningLevels(cachePath: string, model?: string): string[] {
  try {
    return supportedReasoningLevels(
      JSON.parse(readFileSync(cachePath, "utf8")) as unknown,
      model,
    );
  } catch {
    // Fall back to the broadly supported effort set.
  }
  return [...DEFAULT_REASONING_LEVELS];
}

export class CodexStore {
  readonly codexHome: string;
  readonly databasePath: string;
  readonly #acknowledged = new Map<string, number>();
  #database: DatabaseSync | undefined;
  #cache: { at: number; snapshots: AgentSnapshot[] } | undefined;
  #usageCache: { at: number; snapshot?: UsageSnapshot } | undefined;
  #usagePromise: Promise<UsageSnapshot | undefined> | undefined;
  #contextCache:
    { at: number; threadId?: string; snapshot?: ContextSnapshot } | undefined;
  #selectedThreadId: string | undefined;
  readonly #activeThreadId: () => string | undefined;
  readonly #liveInputReader: () => Promise<LiveInputState | undefined>;
  #liveInputCache:
    | {
        at: number;
        state: LiveInputState | undefined;
      }
    | undefined;
  #liveInputPromise: Promise<void> | undefined;
  #activeDesktopCache: { at: number; threadId: string | undefined } | undefined;

  constructor(
    options: {
      codexHome?: string;
      databasePath?: string;
      activeThreadId?: () => string | undefined;
      liveInputReader?: () => Promise<LiveInputState | undefined>;
    } = {},
  ) {
    this.codexHome = options.codexHome ?? resolveCodexHome();
    this.databasePath =
      options.databasePath ?? resolveStateDatabase(this.codexHome);
    this.#activeThreadId = options.activeThreadId ?? activeDesktopThreadId;
    this.#liveInputReader = options.liveInputReader ?? readLiveInputState;
  }

  close(): void {
    this.#database?.close();
    this.#database = undefined;
  }

  acknowledge(threadId: string, at = Date.now()): void {
    this.#acknowledged.set(threadId, at);
    this.#cache = undefined;
  }

  recentThreads(
    limit = 8,
    maxAgeMs = 14 * 24 * 60 * 60 * 1000,
  ): AgentSnapshot[] {
    const now = Date.now();
    if (this.#cache && now - this.#cache.at < 700) {
      return this.#cache.snapshots.slice(0, limit);
    }

    const database = this.#open();
    const cutoff = now - maxAgeMs;
    const rows = database
      .prepare(
        `SELECT
           t.id, t.rollout_path, t.cwd, t.title, t.preview, t.recency_at_ms,
           t.reasoning_effort, t.model, e.status AS spawn_status
         FROM threads t
         LEFT JOIN thread_spawn_edges e ON e.child_thread_id = t.id
         WHERE t.archived = 0
           AND t.preview <> ''
           AND t.recency_at_ms >= ?
         ORDER BY t.recency_at_ms DESC
         LIMIT ?`,
      )
      .all(cutoff, Math.max(limit, 12)) as unknown as ThreadRow[];

    const persistedSnapshots = rows.map((row): AgentSnapshot => {
      const record: ThreadRecord = {
        id: row.id,
        rolloutPath: row.rollout_path,
        cwd: row.cwd,
        title: row.title,
        preview: row.preview,
        recencyAtMs: row.recency_at_ms,
        ...(row.reasoning_effort
          ? { reasoningEffort: row.reasoning_effort }
          : {}),
        ...(row.model ? { model: row.model } : {}),
        ...(row.spawn_status ? { spawnStatus: row.spawn_status } : {}),
      };
      const acknowledgedAt = this.#acknowledged.get(record.id);
      const rollout = parseRolloutLines(readFileTail(record.rolloutPath), {
        now,
        ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
      });
      if (
        record.spawnStatus === "running" &&
        (rollout.status === "idle" || rollout.status === "unread")
      ) {
        rollout.status = "running";
        rollout.detail = "Running";
      }
      if (record.spawnStatus === "errored") {
        rollout.status = "error";
        rollout.detail = "Error";
      }
      return {
        ...record,
        ...rollout,
        displayTitle: readableThreadTitle(record),
      };
    });

    const snapshots = applyFocusedLiveInput(
      persistedSnapshots,
      this.#focusedThreadId(now),
      this.#liveInputCache && now - this.#liveInputCache.at < 2_500
        ? this.#liveInputCache.state
        : undefined,
    );
    this.#cache = { at: now, snapshots };
    return snapshots.slice(0, limit);
  }

  threadAtSlot(slot: number): AgentSnapshot | undefined {
    return this.recentThreads(Math.max(8, slot + 1))[slot];
  }

  latestThread(): AgentSnapshot | undefined {
    return this.recentThreads(1)[0];
  }

  selectThread(threadId: string): void {
    this.#selectedThreadId = threadId;
  }

  controlThread(): AgentSnapshot | undefined {
    const threads = this.recentThreads(12);
    const focusedThreadId = this.#focusedThreadId(Date.now());
    return (
      threads.find((thread) => thread.id === focusedThreadId) ??
      threads.find((thread) => thread.id === this.#selectedThreadId) ??
      threads[0]
    );
  }

  focusedThread(): AgentSnapshot | undefined {
    const threads = this.recentThreads(50);
    const activeId = this.#focusedThreadId(Date.now());
    if (!activeId) return undefined;
    return threads.find((thread) => thread.id === activeId);
  }

  async refreshLiveInput(): Promise<void> {
    if (this.#liveInputPromise) return this.#liveInputPromise;
    const promise = this.#liveInputReader()
      .then((state) => {
        this.#liveInputCache = {
          at: Date.now(),
          state,
        };
        this.#cache = undefined;
      })
      .finally(() => {
        if (this.#liveInputPromise === promise) {
          this.#liveInputPromise = undefined;
        }
      });
    this.#liveInputPromise = promise;
    return promise;
  }

  #focusedThreadId(now: number): string | undefined {
    if (!this.#activeDesktopCache || now - this.#activeDesktopCache.at >= 700) {
      this.#activeDesktopCache = {
        at: now,
        threadId: this.#activeThreadId(),
      };
    }
    return this.#activeDesktopCache.threadId;
  }

  sessions(limit = 8): SessionSnapshot[] {
    const threads = this.recentThreads(limit);
    const activeId = this.focusedThread()?.id;
    return projectSessions(threads, activeId);
  }

  contextSnapshot(): ContextSnapshot | undefined {
    const now = Date.now();
    const thread = this.focusedThread();
    if (!thread) return undefined;
    if (
      this.#contextCache &&
      this.#contextCache.threadId === thread.id &&
      now - this.#contextCache.at < 1_000
    ) {
      return this.#contextCache.snapshot;
    }
    const snapshot = parseLatestContext(
      readFileTail(thread.rolloutPath),
      thread.id,
      now,
    );
    this.#contextCache = {
      at: now,
      threadId: thread.id,
      ...(snapshot ? { snapshot } : {}),
    };
    return snapshot;
  }

  reasoningSnapshot(): ReasoningSnapshot {
    const thread = this.controlThread();
    const current = thread?.reasoningEffort || "medium";
    const levels = modelReasoningLevels(
      join(this.codexHome, "models_cache.json"),
      thread?.model,
    );
    return {
      current,
      levels: levels.includes(current)
        ? levels
        : normalizeReasoningLevels([...levels, current]),
      ...(thread?.id ? { threadId: thread.id } : {}),
      ...(thread?.model ? { model: thread.model } : {}),
    };
  }

  modelSnapshot(): ModelSnapshot {
    const thread = this.controlThread();
    const current = thread?.model ?? "";
    try {
      const options = supportedModelOptions(
        JSON.parse(
          readFileSync(join(this.codexHome, "models_cache.json"), "utf8"),
        ) as unknown,
      );
      return {
        current,
        options,
        ...(thread?.id ? { threadId: thread.id } : {}),
      };
    } catch {
      // An empty selector is safer than dispatching a stale hard-coded index.
      return {
        current,
        options: [],
        ...(thread?.id ? { threadId: thread.id } : {}),
      };
    }
  }

  threadSettings(
    threadId: string,
  ): { model?: string; reasoningEffort?: string } | undefined {
    const row = this.#open()
      .prepare(
        "SELECT model, reasoning_effort FROM threads WHERE id = ? LIMIT 1",
      )
      .get(threadId) as
      { model: string | null; reasoning_effort: string | null } | undefined;
    if (!row) return undefined;
    return {
      ...(row.model ? { model: row.model } : {}),
      ...(row.reasoning_effort
        ? { reasoningEffort: row.reasoning_effort }
        : {}),
    };
  }

  invalidate(): void {
    this.#cache = undefined;
  }

  async usageSnapshot(): Promise<UsageSnapshot | undefined> {
    const now = Date.now();
    if (this.#usageCache && now - this.#usageCache.at < 30_000) {
      return this.#usageCache.snapshot;
    }
    if (this.#usagePromise) return this.#usagePromise;

    this.#usagePromise = (async () => {
      let snapshot: UsageSnapshot | undefined;
      try {
        snapshot = await fetchAccountUsage();
      } catch {
        snapshot = this.recentThreads(12)
          .map((thread) => parseLatestUsage(readFileTail(thread.rolloutPath)))
          .filter((usage): usage is UsageSnapshot => usage !== undefined)
          .sort((left, right) => right.observedAt - left.observedAt)[0];
      }
      this.#usageCache = {
        at: Date.now(),
        ...(snapshot ? { snapshot } : {}),
      };
      return snapshot;
    })().finally(() => {
      this.#usagePromise = undefined;
    });
    return this.#usagePromise;
  }

  #open(): DatabaseSync {
    if (this.#database) return this.#database;
    const database = new DatabaseSync(this.databasePath, {
      readOnly: true,
      timeout: 1000,
    });
    database.exec("PRAGMA query_only = ON");
    this.#database = database;
    return database;
  }
}

export const codexStore = new CodexStore();
