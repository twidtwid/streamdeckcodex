import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CodexStore, resolveStateDatabase } from "../src/lib/codex-store.js";

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
      liveInputReader: async () => ({
        pending: pendingApproval,
        kind: "approval",
      }),
    });
    try {
      await store.refreshLiveInput();
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
      await store.refreshLiveInput();
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

  it.runIf(existsSync(resolveStateDatabase()))(
    "keeps task-scoped controls bound to the focused primary Codex chat",
    () => {
      const store = new CodexStore();
      try {
        const threads = store.recentThreads(3);
        expect(threads.length).toBeGreaterThan(1);
        const selected = threads[1]!;
        store.selectThread(selected.id);
        const control = store.controlThread();
        expect(control?.id).toMatch(/^[0-9a-f-]+$/i);
        expect(store.recentThreads(12).map((thread) => thread.id)).toContain(
          control?.id,
        );
        expect(store.modelSnapshot().threadId).toBe(control?.id);
        expect(store.reasoningSnapshot().threadId).toBe(control?.id);
      } finally {
        store.close();
      }
    },
  );
});
