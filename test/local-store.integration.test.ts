import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { CodexStore, resolveStateDatabase } from "../src/lib/codex-store.js";
import { parseRolloutEvents } from "../src/lib/rollout-status.js";

describe("local Codex state integration", () => {
  it("selects Context and live input from only the focused task", async () => {
    const root = mkdtempSync(join(tmpdir(), "streamdeck-context-"));
    const databasePath = join(root, "state.sqlite");
    const focusedRollout = join(root, "focused.jsonl");
    const unrelatedRollout = join(root, "unrelated.jsonl");
    const observedAt = new Date().toISOString();
    const tokenEvent = (used: number) =>
      JSON.stringify({
        timestamp: observedAt,
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { total_tokens: used },
            model_context_window: 258_400,
          },
        },
      });
    writeFileSync(focusedRollout, tokenEvent(82_256));
    writeFileSync(unrelatedRollout, tokenEvent(200_000));

    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
        preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
        model TEXT, archived INTEGER
      );
      CREATE TABLE thread_spawn_edges (
        child_thread_id TEXT, status TEXT
      );
    `);
    const insert = database.prepare(
      `INSERT INTO threads
       (id, rollout_path, cwd, title, preview, recency_at_ms,
        reasoning_effort, model, archived)
       VALUES (?, ?, '/tmp', ?, ?, ?, 'high', 'gpt-5.6-sol', 0)`,
    );
    insert.run("focused", focusedRollout, "Focused", "Focused", Date.now() - 1);
    insert.run(
      "unrelated",
      unrelatedRollout,
      "Unrelated",
      "Unrelated",
      Date.now(),
    );
    database.close();

    let pendingApproval = true;
    const store = new CodexStore({
      databasePath,
      activeThreadId: () => "focused",
      liveComposerReader: async () => ({
        pendingInput: pendingApproval,
        inputKind: "approval",
        conversationId: "focused",
        rendererWindowId: "renderer-focused",
      }),
    });
    try {
      await store.refreshLiveComposer(true);
      expect(store.contextSnapshot()).toMatchObject({
        threadId: "focused",
        usedTokens: 82_256,
      });
      expect(
        store.sessions(8).map((session) => ({
          id: session.id,
          label: session.sessionLabel,
          active: session.isActive,
        })),
      ).toEqual([
        { id: "unrelated", label: "Unrelat", active: false },
        { id: "focused", label: "Focused", active: true },
      ]);
      expect(store.focusedThread()).toMatchObject({
        id: "focused",
        status: "needs-input",
        detail: "Approval required",
      });
      expect(
        store.recentThreads(8).find((thread) => thread.id === "unrelated"),
      ).not.toHaveProperty("status", "needs-input");

      pendingApproval = false;
      await store.refreshLiveComposer(true);
      expect(store.focusedThread()?.status).not.toBe("needs-input");
    } finally {
      store.close();
    }
  });

  it.runIf(existsSync(resolveStateDatabase()))(
    "reads recent threads without writing to Codex state",
    () => {
      const store = new CodexStore();
      try {
        const threads = store.recentThreads(3);
        expect(threads.length).toBeGreaterThan(0);
        expect(threads[0]?.id).toMatch(/^[0-9a-f-]+$/i);
        expect(threads[0]?.rolloutPath).toContain("rollout-");
        expect([
          "idle",
          "unread",
          "thinking",
          "running",
          "needs-input",
          "error",
        ]).toContain(threads[0]?.status);
      } finally {
        store.close();
      }
    },
  );

  it("projects the exact focused row outside the 12-row list and fails closed for archived or missing rows", async () => {
    const root = mkdtempSync(join(tmpdir(), "streamdeck-focused-row-"));
    const databasePath = join(root, "state.sqlite");
    const rollout = join(root, "rollout.jsonl");
    writeFileSync(rollout, "");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
        preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
        model TEXT, archived INTEGER
      );
      CREATE TABLE thread_spawn_edges (child_thread_id TEXT, status TEXT);
    `);
    const insert = database.prepare(
      `INSERT INTO threads VALUES (?, ?, '/tmp', ?, ?, ?, 'medium', 'gpt-5.6-sol', ?)`,
    );
    insert.run(
      "focused",
      rollout,
      "Focused old task",
      "",
      Date.now() - 1000,
      0,
    );
    for (let index = 0; index < 13; index += 1) {
      insert.run(
        `newer-${index}`,
        rollout,
        `Newer ${index}`,
        "preview",
        Date.now() + index,
        0,
      );
    }
    insert.run("archived", rollout, "Archived", "preview", Date.now(), 1);
    database.close();

    const focused = new CodexStore({
      databasePath,
      activeThreadId: () => "focused",
      liveComposerReader: async () => ({
        pendingInput: true,
        inputKind: "approval",
        conversationId: "background",
        rendererWindowId: "renderer-background",
      }),
    });
    const archived = new CodexStore({
      databasePath,
      activeThreadId: () => "archived",
    });
    const missing = new CodexStore({
      databasePath,
      activeThreadId: () => "missing",
    });
    try {
      expect(focused.recentThreads(50)).toHaveLength(12);
      expect(
        focused.recentThreads(12).map((thread) => thread.id),
      ).not.toContain("focused");
      await focused.refreshLiveComposer();
      expect(focused.focusedThread()).toMatchObject({ id: "focused" });
      expect(focused.focusedThread()?.status).not.toBe("needs-input");
      expect(archived.focusedThread()).toBeUndefined();
      expect(missing.focusedThread()).toBeUndefined();
    } finally {
      focused.close();
      archived.close();
      missing.close();
    }
  });

  it("reuses unchanged rollout events but reduces fresh acknowledgement state", () => {
    const root = mkdtempSync(join(tmpdir(), "streamdeck-rollout-cache-"));
    const databasePath = join(root, "state.sqlite");
    const rollout = join(root, "rollout.jsonl");
    const completedAt = new Date().toISOString();
    writeFileSync(
      rollout,
      JSON.stringify({
        timestamp: completedAt,
        type: "event_msg",
        payload: { type: "task_complete" },
      }),
    );
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
        preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
        model TEXT, archived INTEGER
      );
      CREATE TABLE thread_spawn_edges (child_thread_id TEXT, status TEXT);
    `);
    database
      .prepare(
        `INSERT INTO threads VALUES ('thread', ?, '/tmp', 'Thread', 'preview', ?, 'medium', 'gpt-5.6-sol', 0)`,
      )
      .run(rollout, Date.now());
    database.close();

    let reads = 0;
    let parses = 0;
    const store = new CodexStore({
      databasePath,
      rolloutReader: (path) => {
        reads += 1;
        return readFileSync(path, "utf8");
      },
      rolloutParser: (content) => {
        parses += 1;
        return parseRolloutEvents(content);
      },
    });
    try {
      expect(store.recentThreads()[0]?.status).toBe("unread");
      store.invalidate();
      store.recentThreads();
      expect(reads).toBe(1);
      expect(parses).toBe(1);

      store.acknowledge("thread", Date.parse(completedAt));
      expect(store.recentThreads()[0]?.status).toBe("idle");
      expect(reads).toBe(1);
      expect(parses).toBe(1);

      appendFileSync(
        rollout,
        `\n${JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })}`,
      );
      store.invalidate();
      store.recentThreads();
      expect(reads).toBe(2);
      expect(parses).toBe(2);

      writeFileSync(rollout, "");
      store.invalidate();
      store.recentThreads();
      expect(reads).toBe(3);
      expect(parses).toBe(3);

      const replacement = join(root, "replacement.jsonl");
      writeFileSync(
        replacement,
        JSON.stringify({
          type: "event_msg",
          payload: { type: "task_started" },
        }),
      );
      renameSync(replacement, rollout);
      store.invalidate();
      store.recentThreads();
      expect(reads).toBe(4);
      expect(parses).toBe(4);
    } finally {
      store.close();
    }
  });

  it("evicts rollout events that are neither recent nor focused", () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), "streamdeck-rollout-eviction-"));
    const databasePath = join(root, "state.sqlite");
    const firstRollout = join(root, "first.jsonl");
    const secondRollout = join(root, "second.jsonl");
    writeFileSync(firstRollout, "");
    writeFileSync(secondRollout, "");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
        preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
        model TEXT, archived INTEGER
      );
      CREATE TABLE thread_spawn_edges (child_thread_id TEXT, status TEXT);
    `);
    const insert = database.prepare(
      `INSERT INTO threads VALUES (?, ?, '/tmp', ?, 'preview', ?, 'medium', 'gpt-5.6-sol', 0)`,
    );
    insert.run("first", firstRollout, "First", Date.now());
    insert.run("second", secondRollout, "Second", Date.now() - 1);
    database.close();

    let activeId: string | undefined = "first";
    let reads = 0;
    let parses = 0;
    const store = new CodexStore({
      databasePath,
      activeThreadId: () => activeId,
      rolloutReader: (path) => {
        reads += 1;
        return readFileSync(path, "utf8");
      },
      rolloutParser: (content) => {
        parses += 1;
        return parseRolloutEvents(content);
      },
    });
    try {
      store.recentThreads();
      store.focusedThread();
      expect([reads, parses]).toEqual([2, 2]);

      const update = new DatabaseSync(databasePath);
      update
        .prepare("UPDATE threads SET archived = 1 WHERE id = 'first'")
        .run();
      update.close();
      activeId = undefined;
      vi.advanceTimersByTime(701);
      store.invalidate();
      store.recentThreads();

      const restore = new DatabaseSync(databasePath);
      restore
        .prepare("UPDATE threads SET archived = 0 WHERE id = 'first'")
        .run();
      restore.close();
      store.invalidate();
      store.recentThreads();
      expect([reads, parses]).toEqual([3, 3]);
    } finally {
      store.close();
      vi.useRealTimers();
    }
  });
});
