import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
import { supportedModelOptions, supportedReasoningForModel } from "./model.js";
import {
  parseRolloutEvents,
  reduceRolloutEvents,
  type RolloutEvent,
} from "./rollout-status.js";
import { fetchAccountUsage, parseLatestUsage } from "./usage.js";
import { activeDesktopThreadId } from "./desktop-active.js";
import { contextAvailabilityFromLines } from "./context.js";
import {
  availabilityReasonFromError,
  ready,
  unavailable,
  type Availability,
  type AvailabilityReason,
} from "./availability.js";
import {
  cycleLiveApprovalMode,
  readLiveComposerState,
  type CodexApprovalMode,
  type LiveComposerState,
} from "./codex-ui-control.js";

export const LIVE_COMPOSER_CACHE_MS = 2_500;

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
  liveInput: LiveComposerState | undefined,
): AgentSnapshot[] {
  if (
    liveInput?.pendingInput !== true ||
    !focusedThreadId ||
    liveInput.conversationId !== focusedThreadId
  )
    return snapshots;
  return snapshots.map((snapshot) =>
    snapshot.id === focusedThreadId
      ? {
          ...snapshot,
          status: "needs-input",
          detail:
            liveInput.inputKind === "approval"
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
  return supportedReasoningForModel(parsed, model);
}

export type FileIdentity = {
  dev?: number;
  ino?: number;
  size: number;
  mtimeMs: number;
};

export function observeFile(path: string): FileIdentity | undefined {
  try {
    const stat = statSync(path);
    return {
      ...(Number.isFinite(stat.dev) ? { dev: stat.dev } : {}),
      ...(Number.isFinite(stat.ino) ? { ino: stat.ino } : {}),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return undefined;
  }
}

function sameFile(
  left: FileIdentity | undefined,
  right: FileIdentity | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
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
    | {
        at: number;
        threadId?: string;
        availability: Availability<ContextSnapshot>;
      }
    | undefined;
  readonly #activeThreadId: () => string | undefined;
  readonly #liveComposerReader: (
    threadId: string,
  ) => Promise<LiveComposerState | undefined>;
  readonly #approvalCycler: (threadId: string) => Promise<LiveComposerState>;
  #liveComposerCache:
    | {
        at: number;
        state: LiveComposerState;
      }
    | undefined;
  #liveComposerPromise: Promise<void> | undefined;
  #liveComposerFollowup = false;
  #liveComposerReadAt = 0;
  #liveComposerGeneration = 0;
  #liveComposerMutating = false;
  #liveComposerUnavailable = false;
  #liveComposerUnavailableReason: AvailabilityReason = "not-exposed";
  #activeDesktopCache: { at: number; threadId: string | undefined } | undefined;
  #focusedProjectionCache:
    { at: number; threadId: string; snapshot?: AgentSnapshot } | undefined;
  readonly #fileObserver: (path: string) => FileIdentity | undefined;
  readonly #rolloutReader: (path: string) => string;
  readonly #rolloutParser: (content: string) => RolloutEvent[];
  readonly #modelReader: ((path: string) => string) | undefined;
  #rolloutCache = new Map<
    string,
    { identity: FileIdentity; tail: string; events: RolloutEvent[] }
  >();
  #recentRolloutPaths = new Set<string>();
  #focusedRolloutPath: string | undefined;
  #modelCache: { identity: FileIdentity; parsed: unknown } | undefined;

  constructor(
    options: {
      codexHome?: string;
      databasePath?: string;
      activeThreadId?: () => string | undefined;
      liveComposerReader?: (
        threadId: string,
      ) => Promise<LiveComposerState | undefined>;
      approvalCycler?: (threadId: string) => Promise<LiveComposerState>;
      fileObserver?: (path: string) => FileIdentity | undefined;
      rolloutReader?: (path: string) => string;
      rolloutParser?: (content: string) => RolloutEvent[];
      modelReader?: (path: string) => string;
    } = {},
  ) {
    this.codexHome = options.codexHome ?? resolveCodexHome();
    this.databasePath =
      options.databasePath ?? resolveStateDatabase(this.codexHome);
    this.#activeThreadId = options.activeThreadId ?? activeDesktopThreadId;
    this.#liveComposerReader =
      options.liveComposerReader ?? readLiveComposerState;
    this.#approvalCycler = options.approvalCycler ?? cycleLiveApprovalMode;
    this.#fileObserver = options.fileObserver ?? observeFile;
    this.#rolloutReader = options.rolloutReader ?? readFileTail;
    this.#rolloutParser = options.rolloutParser ?? parseRolloutEvents;
    this.#modelReader = options.modelReader;
  }

  close(): void {
    this.#database?.close();
    this.#database = undefined;
  }

  acknowledge(threadId: string, at = Date.now()): void {
    this.#acknowledged.set(threadId, at);
    this.#cache = undefined;
    this.#focusedProjectionCache = undefined;
  }

  #projectThreadRow(row: ThreadRow, now: number): AgentSnapshot {
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
    const rollout = reduceRolloutEvents(
      this.#rolloutEvents(record.rolloutPath),
      {
        now,
        ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
      },
    );
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
    return { ...record, ...rollout, displayTitle: readableThreadTitle(record) };
  }

  #rolloutEvents(path: string): RolloutEvent[] {
    const canonicalPath = resolve(path);
    const identity = this.#fileObserver(canonicalPath);
    const cached = this.#rolloutCache.get(canonicalPath);
    if (cached && sameFile(cached.identity, identity)) return cached.events;
    const tail = this.#rolloutReader(canonicalPath);
    const events = this.#rolloutParser(tail);
    if (identity)
      this.#rolloutCache.set(canonicalPath, { identity, tail, events });
    else this.#rolloutCache.delete(canonicalPath);
    return events;
  }

  #retainRolloutCache(): void {
    const retained = new Set(this.#recentRolloutPaths);
    if (this.#focusedRolloutPath) retained.add(this.#focusedRolloutPath);
    for (const path of this.#rolloutCache.keys()) {
      if (!retained.has(path)) this.#rolloutCache.delete(path);
    }
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
         LIMIT 12`,
      )
      .all(cutoff) as unknown as ThreadRow[];

    const persistedSnapshots = rows.map((row) =>
      this.#projectThreadRow(row, now),
    );
    this.#recentRolloutPaths = new Set(
      rows.map((row) => resolve(row.rollout_path)),
    );
    this.#retainRolloutCache();

    const snapshots = applyFocusedLiveInput(
      persistedSnapshots,
      this.#focusedThreadId(now),
      this.#liveComposerCache && now - this.#liveComposerCache.at < 2_500
        ? this.#liveComposerCache.state
        : undefined,
    );
    this.#cache = { at: now, snapshots };
    return snapshots.slice(0, Math.min(limit, 12));
  }

  latestThread(): AgentSnapshot | undefined {
    return this.recentThreads(1)[0];
  }

  focusedThread(): AgentSnapshot | undefined {
    const now = Date.now();
    const activeId = this.#focusedThreadId(now);
    if (!activeId) return undefined;
    if (
      this.#focusedProjectionCache &&
      this.#focusedProjectionCache.threadId === activeId &&
      now - this.#focusedProjectionCache.at < 700
    ) {
      return this.#focusedProjectionCache.snapshot;
    }
    const row = this.#open()
      .prepare(
        `SELECT
           t.id, t.rollout_path, t.cwd, t.title, t.preview, t.recency_at_ms,
           t.reasoning_effort, t.model, e.status AS spawn_status
         FROM threads t
         LEFT JOIN thread_spawn_edges e ON e.child_thread_id = t.id
         WHERE t.archived = 0 AND t.id = ?
         LIMIT 1`,
      )
      .get(activeId) as unknown as ThreadRow | undefined;
    const persisted = row ? this.#projectThreadRow(row, now) : undefined;
    const liveInput =
      this.#liveComposerCache && now - this.#liveComposerCache.at < 2_500
        ? this.#liveComposerCache.state
        : undefined;
    const snapshot = persisted
      ? applyFocusedLiveInput([persisted], activeId, liveInput)[0]
      : undefined;
    this.#focusedProjectionCache = {
      at: now,
      threadId: activeId,
      ...(snapshot ? { snapshot } : {}),
    };
    this.#focusedRolloutPath = row ? resolve(row.rollout_path) : undefined;
    this.#retainRolloutCache();
    return snapshot;
  }

  liveComposerState(): LiveComposerState | undefined {
    return this.#liveComposerUnavailable
      ? undefined
      : this.#liveComposerCache?.state;
  }

  liveComposerAvailability(): Availability<LiveComposerState> {
    const now = Date.now();
    if (!this.focusedThread()?.id) return unavailable("no-focus", now);
    const state = this.liveComposerState();
    return state
      ? ready(state, now)
      : unavailable(this.#liveComposerUnavailableReason, now);
  }

  permissionAvailability(): Availability<CodexApprovalMode> {
    const now = Date.now();
    const composer = this.liveComposerAvailability();
    if (composer.state === "unavailable") return composer;
    return composer.value.approvalMode
      ? ready(composer.value.approvalMode, now)
      : unavailable("not-exposed", now);
  }

  async refreshLiveComposer(force = false): Promise<void> {
    if (this.#liveComposerPromise) {
      if (force) this.#liveComposerFollowup = true;
      return this.#liveComposerPromise;
    }
    const threadId = this.#resolveFocusedThreadId();
    if (!threadId) {
      this.#liveComposerUnavailable = true;
      this.#liveComposerUnavailableReason = "no-focus";
      return;
    }
    if (
      !force &&
      this.#liveComposerReadAt > 0 &&
      Date.now() - this.#liveComposerReadAt < LIVE_COMPOSER_CACHE_MS &&
      this.#liveComposerCache?.state.conversationId === threadId
    )
      return;
    const readOnce = async (): Promise<void> => {
      const generation = this.#liveComposerGeneration;
      const requestedThreadId = this.#resolveFocusedThreadId();
      if (!requestedThreadId) {
        this.#liveComposerUnavailable = true;
        this.#liveComposerUnavailableReason = "no-focus";
        this.#liveComposerReadAt = Date.now();
        return;
      }
      let state: LiveComposerState | undefined;
      try {
        state = await this.#liveComposerReader(requestedThreadId);
      } catch (error) {
        this.#liveComposerUnavailable = true;
        this.#liveComposerUnavailableReason =
          availabilityReasonFromError(error);
        throw error;
      }
      this.#liveComposerReadAt = Date.now();
      if (
        generation === this.#liveComposerGeneration &&
        !this.#liveComposerMutating
      ) {
        if (state && state.conversationId === requestedThreadId) {
          this.#setLiveComposer(state);
        } else {
          // Keep a confirmed snapshot for projection/race protection, but
          // expose this failed observation as Unknown to live controls.
          this.#liveComposerUnavailable = true;
          this.#liveComposerUnavailableReason = state
            ? "target-mismatch"
            : "not-exposed";
        }
      }
    };
    const promise = (async () => {
      do {
        this.#liveComposerFollowup = false;
        await readOnce();
      } while (this.#liveComposerFollowup);
    })().finally(() => {
      if (this.#liveComposerPromise === promise) {
        this.#liveComposerPromise = undefined;
      }
    });
    this.#liveComposerPromise = promise;
    return promise;
  }

  async cycleLiveComposerApprovalMode(): Promise<CodexApprovalMode> {
    const threadId = this.#resolveFocusedThreadId();
    if (!threadId) throw new Error("No focused Codex task is available.");
    const generation = ++this.#liveComposerGeneration;
    this.#liveComposerMutating = true;
    try {
      const cycle = await this.#approvalCycler(threadId);
      if (
        !cycle.approvalMode ||
        cycle.conversationId !== threadId ||
        !cycle.rendererWindowId
      ) {
        throw new Error(
          "The permission change did not confirm its focused task.",
        );
      }
      if (this.#resolveFocusedThreadId() !== threadId) {
        throw new Error(
          "The focused Codex task changed during the permission update.",
        );
      }
      const postRead = await this.#liveComposerReader(threadId);
      if (
        !postRead ||
        postRead.conversationId !== threadId ||
        postRead.conversationId !== cycle.conversationId ||
        postRead.rendererWindowId !== cycle.rendererWindowId ||
        postRead.approvalMode !== cycle.approvalMode ||
        this.#resolveFocusedThreadId() !== threadId ||
        generation !== this.#liveComposerGeneration
      ) {
        throw new Error(
          "The permission update could not be verified in the focused composer.",
        );
      }
      this.#setLiveComposer(postRead);
      return cycle.approvalMode;
    } catch (error) {
      this.#liveComposerCache = undefined;
      this.#liveComposerUnavailable = true;
      this.#liveComposerUnavailableReason = availabilityReasonFromError(error);
      this.#cache = undefined;
      this.#focusedProjectionCache = undefined;
      throw error;
    } finally {
      this.#liveComposerMutating = false;
    }
  }

  #setLiveComposer(state: LiveComposerState): void {
    const now = Date.now();
    this.#liveComposerCache = { at: now, state };
    this.#liveComposerReadAt = now;
    this.#liveComposerUnavailable = false;
    this.#liveComposerUnavailableReason = "not-exposed";
    this.#cache = undefined;
    this.#focusedProjectionCache = undefined;
  }

  #resolveFocusedThreadId(): string | undefined {
    const threadId = this.#activeThreadId();
    this.#activeDesktopCache = { at: Date.now(), threadId };
    return threadId;
  }

  #focusedThreadId(now: number): string | undefined {
    if (!this.#activeDesktopCache || now - this.#activeDesktopCache.at >= 700) {
      this.#activeDesktopCache = {
        at: now,
        threadId: this.#activeThreadId(),
      };
    }
    const threadId = this.#activeDesktopCache.threadId;
    if (!threadId) {
      this.#focusedProjectionCache = undefined;
      this.#focusedRolloutPath = undefined;
      this.#retainRolloutCache();
    }
    return threadId;
  }

  sessions(limit = 8): SessionSnapshot[] {
    const threads = this.recentThreads(limit);
    const activeId = this.focusedThread()?.id;
    return projectSessions(threads, activeId);
  }

  contextAvailability(): Availability<ContextSnapshot> {
    const now = Date.now();
    const thread = this.focusedThread();
    if (!thread) return unavailable("no-focus", now);
    if (
      this.#contextCache &&
      this.#contextCache.threadId === thread.id &&
      now - this.#contextCache.at < 1_000
    ) {
      return this.#contextCache.availability;
    }
    const availability = contextAvailabilityFromLines(
      this.#rolloutReader(thread.rolloutPath),
      thread.id,
      now,
    );
    this.#contextCache = {
      at: now,
      threadId: thread.id,
      availability,
    };
    return availability;
  }

  contextSnapshot(): ContextSnapshot | undefined {
    const availability = this.contextAvailability();
    return availability.state === "ready" ? availability.value : undefined;
  }

  reasoningSnapshot(): ReasoningSnapshot {
    // Picker state is displayed only for the task that is actually focused.
    // A selected/recent task is useful navigation context, never mutation
    // identity.
    const thread = this.focusedThread();
    const current = thread?.reasoningEffort || "medium";
    const levels = supportedReasoningLevels(
      this.#modelCatalog(),
      thread?.model,
    );
    return {
      current,
      levels,
      ...(thread?.id ? { threadId: thread.id } : {}),
      ...(thread?.model ? { model: thread.model } : {}),
    };
  }

  reasoningAvailability(): Availability<ReasoningSnapshot> {
    const snapshot = this.reasoningSnapshot();
    if (!snapshot.threadId) return unavailable("no-focus");
    if (snapshot.levels.length === 0) return unavailable("unsupported-schema");
    return ready(snapshot);
  }

  modelSnapshot(): ModelSnapshot {
    const thread = this.focusedThread();
    const current = thread?.model ?? "";
    try {
      const options = supportedModelOptions(this.#modelCatalog());
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

  modelAvailability(): Availability<ModelSnapshot> {
    const snapshot = this.modelSnapshot();
    if (!snapshot.threadId) return unavailable("no-focus");
    if (snapshot.options.length === 0) return unavailable("unsupported-schema");
    return ready(snapshot);
  }

  #modelCatalog(): unknown {
    const path = join(this.codexHome, "models_cache.json");
    const identity = this.#fileObserver(path);
    if (this.#modelCache && sameFile(this.#modelCache.identity, identity)) {
      return this.#modelCache.parsed;
    }
    try {
      const content = this.#modelReader
        ? this.#modelReader(path)
        : readFileSync(join(this.codexHome, "models_cache.json"), "utf8");
      const parsed = JSON.parse(content) as unknown;
      if (identity) this.#modelCache = { identity, parsed };
      else this.#modelCache = undefined;
      return parsed;
    } catch {
      if (identity) this.#modelCache = { identity, parsed: undefined };
      else this.#modelCache = undefined;
      return undefined;
    }
  }

  invalidate(): void {
    this.#cache = undefined;
    this.#focusedProjectionCache = undefined;
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

  async usageAvailability(): Promise<Availability<UsageSnapshot>> {
    try {
      const snapshot = await this.usageSnapshot();
      return snapshot
        ? ready(snapshot, snapshot.observedAt)
        : unavailable("not-exposed");
    } catch (error) {
      return unavailable(availabilityReasonFromError(error));
    }
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
