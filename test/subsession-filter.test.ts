import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CodexStore } from "../src/lib/codex-store.js";

type ExtraColumn = "thread_source" | "source" | "agent_path";

type FixtureThread = {
  id: string;
  title: string;
  preview?: string;
  recencyAtMs: number;
  archived?: number;
  threadSource?: string | null;
  source?: string | null;
  agentPath?: string | null;
  spawnParentId?: string;
};

function createFixture(options: {
  extraColumns?: ExtraColumn[];
  spawnEdges?: boolean;
  threads: FixtureThread[];
}): { databasePath: string; close: () => void } {
  const root = mkdtempSync(join(tmpdir(), "streamdeck-subsession-"));
  const databasePath = join(root, "state.sqlite");
  const rollout = join(root, "rollout.jsonl");
  writeFileSync(rollout, "");
  const extra = new Set(options.extraColumns ?? []);
  const extraDefs = [
    extra.has("thread_source") ? "thread_source TEXT" : undefined,
    extra.has("source") ? "source TEXT" : undefined,
    extra.has("agent_path") ? "agent_path TEXT" : undefined,
  ]
    .filter((column): column is string => column !== undefined)
    .map((column) => `, ${column}`)
    .join("");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
      preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
      model TEXT, archived INTEGER${extraDefs}
    );
  `);
  if (options.spawnEdges !== false) {
    database.exec(
      `CREATE TABLE thread_spawn_edges (
         parent_thread_id TEXT,
         child_thread_id TEXT,
         status TEXT
       )`,
    );
  }
  const insertColumns = [
    "id",
    "rollout_path",
    "cwd",
    "title",
    "preview",
    "recency_at_ms",
    "reasoning_effort",
    "model",
    "archived",
    ...(extra.has("thread_source") ? ["thread_source"] : []),
    ...(extra.has("source") ? ["source"] : []),
    ...(extra.has("agent_path") ? ["agent_path"] : []),
  ];
  const insert = database.prepare(
    `INSERT INTO threads (${insertColumns.join(", ")})
     VALUES (${insertColumns.map(() => "?").join(", ")})`,
  );
  const spawn =
    options.spawnEdges === false
      ? undefined
      : database.prepare(
          `INSERT INTO thread_spawn_edges
           (parent_thread_id, child_thread_id, status)
           VALUES (?, ?, 'running')`,
        );
  for (const thread of options.threads) {
    const values: Array<string | number | null> = [
      thread.id,
      rollout,
      "/tmp",
      thread.title,
      thread.preview ?? "preview",
      thread.recencyAtMs,
      "medium",
      "gpt-5.6-sol",
      thread.archived ?? 0,
    ];
    if (extra.has("thread_source")) values.push(thread.threadSource ?? "user");
    if (extra.has("source")) values.push(thread.source ?? "cli");
    if (extra.has("agent_path")) values.push(thread.agentPath ?? "/root");
    insert.run(...values);
    if (spawn && thread.spawnParentId) {
      spawn.run(thread.spawnParentId, thread.id);
    }
  }
  database.close();
  return {
    databasePath,
    close() {
      // CodexStore.close() is the caller's responsibility.
    },
  };
}

function storeFor(databasePath: string, activeId?: string): CodexStore {
  return new CodexStore({
    databasePath,
    ...(activeId ? { activeThreadId: () => activeId } : {}),
  });
}

const FULL_SCHEMA: ExtraColumn[] = ["thread_source", "source", "agent_path"];

describe("user-facing thread filter", () => {
  it("excludes a Guardian sub-session marked by thread_source", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "user",
          title: "Ship the release",
          recencyAtMs: now,
          threadSource: "user",
        },
        {
          id: "guardian-source",
          title: "Ship the release",
          recencyAtMs: now + 1,
          threadSource: "subagent",
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "user",
      ]);
    } finally {
      store.close();
    }
  });

  it("excludes Guardian and Guardian2 reviewers via source.subagent JSON", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "user",
          title: "Guardian",
          recencyAtMs: now,
          source: "cli",
        },
        {
          id: "guardian",
          title: "User chat about reviews",
          recencyAtMs: now + 1,
          source: JSON.stringify({ subagent: { other: "guardian" } }),
        },
        {
          id: "guardian2",
          title: "User chat about reviews",
          recencyAtMs: now + 2,
          source: JSON.stringify({ subagent: { other: "guardian2" } }),
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "user",
      ]);
    } finally {
      store.close();
    }
  });

  it("excludes a nested agent_path sub-session without using its title", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "user",
          title: "Investigate agent_path",
          recencyAtMs: now,
          agentPath: "/root",
        },
        {
          id: "nested",
          title: "Investigate agent_path",
          recencyAtMs: now + 1,
          agentPath: "/root/guardian",
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "user",
      ]);
    } finally {
      store.close();
    }
  });

  it("excludes a spawn-edge child even when other metadata looks like a user chat", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "parent",
          title: "Parent chat",
          recencyAtMs: now,
        },
        {
          id: "child",
          title: "Parent chat",
          recencyAtMs: now + 1,
          threadSource: "user",
          source: "cli",
          agentPath: "/root",
          spawnParentId: "parent",
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "parent",
      ]);
    } finally {
      store.close();
    }
  });

  it("keeps a genuine user chat titled Guardian", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "named-guardian",
          title: "Guardian",
          recencyAtMs: now,
          threadSource: "user",
          source: "cli",
          agentPath: "/root",
        },
        {
          id: "internal",
          title: "Guardian",
          recencyAtMs: now + 1,
          threadSource: "subagent",
          source: JSON.stringify({ subagent: { other: "guardian" } }),
          agentPath: "/root/guardian",
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "named-guardian",
      ]);
    } finally {
      store.close();
    }
  });

  it("fills the 12-row limit with user threads even when newer sub-sessions exist", () => {
    const now = Date.now();
    const threads: FixtureThread[] = [];
    for (let index = 0; index < 20; index += 1) {
      threads.push({
        id: `sub-${index}`,
        title: "Guardian",
        recencyAtMs: now + 100 + index,
        threadSource: "subagent",
        source: JSON.stringify({ subagent: { other: "guardian" } }),
        agentPath: "/root/guardian",
      });
    }
    for (let index = 0; index < 12; index += 1) {
      threads.push({
        id: `user-${index}`,
        title: `User ${index}`,
        recencyAtMs: now + index,
        threadSource: "user",
        source: "cli",
        agentPath: "/root",
      });
    }
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads,
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual(
        Array.from({ length: 12 }, (_, index) => `user-${11 - index}`),
      );
    } finally {
      store.close();
    }
  });

  it("still lists threads on an older schema that lacks the extra columns", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: [],
      threads: [
        { id: "older", title: "Older schema chat", recencyAtMs: now },
        { id: "guardian-title", title: "Guardian", recencyAtMs: now + 1 },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "guardian-title",
        "older",
      ]);
    } finally {
      store.close();
    }
  });

  it("still lists threads when thread_spawn_edges is absent", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      spawnEdges: false,
      threads: [
        {
          id: "user",
          title: "No spawn table",
          recencyAtMs: now,
          threadSource: "user",
        },
        {
          id: "sub",
          title: "No spawn table",
          recencyAtMs: now + 1,
          threadSource: "subagent",
        },
      ],
    });
    const store = storeFor(databasePath);
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "user",
      ]);
    } finally {
      store.close();
    }
  });

  it("keeps a parent chat once when a Guardian child has duplicate spawn edges", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "parent",
          title: "Parent chat",
          recencyAtMs: now,
          threadSource: "user",
          source: "cli",
          agentPath: "/root",
        },
        {
          id: "guardian-child",
          title: "User work",
          recencyAtMs: now + 2,
          threadSource: "subagent",
          source: JSON.stringify({ subagent: { other: "guardian" } }),
          agentPath: "/root/guardian",
          spawnParentId: "parent",
        },
      ],
    });
    const extra = new DatabaseSync(databasePath);
    extra
      .prepare(
        `INSERT INTO thread_spawn_edges
         (parent_thread_id, child_thread_id, status)
         VALUES ('parent', 'guardian-child', 'running')`,
      )
      .run();
    extra.close();
    const store = storeFor(databasePath, "guardian-child");
    try {
      expect(store.recentThreads(12).map((thread) => thread.id)).toEqual([
        "parent",
      ]);
      expect(store.focusedThread()).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("skips a focused Guardian sub-session and still returns a user chat titled Guardian", () => {
    const now = Date.now();
    const { databasePath } = createFixture({
      extraColumns: FULL_SCHEMA,
      threads: [
        {
          id: "named-guardian",
          title: "Guardian",
          recencyAtMs: now,
          threadSource: "user",
          source: "cli",
          agentPath: "/root",
        },
        {
          id: "focused-sub",
          title: "Focused user work",
          recencyAtMs: now + 1,
          threadSource: "subagent",
          source: JSON.stringify({ subagent: { other: "guardian" } }),
          agentPath: "/root/guardian",
        },
      ],
    });
    const skipped = storeFor(databasePath, "focused-sub");
    const focusedUser = storeFor(databasePath, "named-guardian");
    try {
      expect(skipped.focusedThread()).toBeUndefined();
      expect(focusedUser.focusedThread()).toMatchObject({
        id: "named-guardian",
        title: "Guardian",
      });
    } finally {
      skipped.close();
      focusedUser.close();
    }
  });
});
