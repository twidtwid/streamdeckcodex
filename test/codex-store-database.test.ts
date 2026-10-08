import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CodexStore, resolveStateDatabase } from "../src/lib/codex-store.js";
import { collectHealth } from "../src/lib/health.js";

const previousSqliteHome = process.env["CODEX_SQLITE_HOME"];

afterEach(() => {
  if (previousSqliteHome === undefined) {
    delete process.env["CODEX_SQLITE_HOME"];
  } else {
    process.env["CODEX_SQLITE_HOME"] = previousSqliteHome;
  }
});

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "streamdeck-sqlite-"));
}

function writeState(directory: string, generation: number): string {
  const path = join(directory, `state_${generation}.sqlite`);
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE threads (id TEXT);");
  database.close();
  return path;
}

describe("Codex SQLite path discovery", () => {
  it("keeps state_5 as the default when it exists beside a newer file", () => {
    delete process.env["CODEX_SQLITE_HOME"];
    const root = tempRoot();
    const preferred = writeState(root, 5);
    writeState(root, 9);
    expect(resolveStateDatabase(root)).toBe(preferred);
  });

  it("falls back to the highest-numbered state_*.sqlite when state_5 is missing", () => {
    delete process.env["CODEX_SQLITE_HOME"];
    const root = tempRoot();
    writeState(root, 4);
    const newest = writeState(root, 10);
    writeState(root, 9);
    expect(resolveStateDatabase(root)).toBe(newest);
  });

  it("still names state_5 when no generationed databases exist", () => {
    delete process.env["CODEX_SQLITE_HOME"];
    const root = tempRoot();
    expect(resolveStateDatabase(root)).toBe(join(root, "state_5.sqlite"));
  });

  it("honors CODEX_SQLITE_HOME files and directory fallback", () => {
    const root = tempRoot();
    const file = writeState(root, 2);
    process.env["CODEX_SQLITE_HOME"] = file;
    expect(resolveStateDatabase(tempRoot())).toBe(file);

    const directory = tempRoot();
    writeState(directory, 3);
    const newest = writeState(directory, 8);
    process.env["CODEX_SQLITE_HOME"] = directory;
    expect(resolveStateDatabase(tempRoot())).toBe(newest);
  });

  it("honors config.toml sqlite_home with the same state_5-then-fallback rule", () => {
    delete process.env["CODEX_SQLITE_HOME"];
    const codexHome = tempRoot();
    const sqliteHome = tempRoot();
    writeState(sqliteHome, 2);
    const newest = writeState(sqliteHome, 6);
    writeFileSync(
      join(codexHome, "config.toml"),
      `sqlite_home = "${sqliteHome}"\n`,
    );
    expect(resolveStateDatabase(codexHome)).toBe(newest);

    writeState(sqliteHome, 5);
    expect(resolveStateDatabase(codexHome)).toBe(
      join(sqliteHome, "state_5.sqlite"),
    );
  });
});

describe("Codex SQLite fail-safe", () => {
  it("maps a missing database to unsupported-schema without throwing", () => {
    const store = new CodexStore({
      databasePath: join(tempRoot(), "missing.sqlite"),
      activeThreadId: () => "focused",
    });
    try {
      expect(() => store.recentThreads()).not.toThrow();
      expect(() => store.focusedThread()).not.toThrow();
      expect(store.recentThreads()).toEqual([]);
      expect(store.focusedThread()).toBeUndefined();
      expect(store.storeAvailability()).toMatchObject({
        state: "unavailable",
        reason: "unsupported-schema",
      });
      expect(collectHealth(store).components.store).toMatchObject({
        state: "unavailable",
        reason: "unsupported-schema",
      });
    } finally {
      store.close();
    }
  });

  it("maps a schema change or corrupt file to unsupported-schema", () => {
    const root = tempRoot();
    const incompatible = join(root, "incompatible.sqlite");
    const corrupt = join(root, "corrupt.sqlite");
    const database = new DatabaseSync(incompatible);
    database.exec("CREATE TABLE unrelated (id TEXT);");
    database.close();
    writeFileSync(corrupt, "not a sqlite database");

    for (const databasePath of [incompatible, corrupt]) {
      const store = new CodexStore({
        databasePath,
        activeThreadId: () => "focused",
      });
      try {
        expect(() => store.recentThreads()).not.toThrow();
        expect(() => store.focusedThread()).not.toThrow();
        expect(store.storeAvailability()).toMatchObject({
          state: "unavailable",
          reason: "unsupported-schema",
        });
      } finally {
        store.close();
      }
    }
  });

  it("reports a readable store once the expected tables exist", () => {
    const root = tempRoot();
    const databasePath = join(root, "state.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT,
        preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT,
        model TEXT, archived INTEGER
      );
      CREATE TABLE thread_spawn_edges (child_thread_id TEXT, status TEXT);
    `);
    database.close();
    const store = new CodexStore({ databasePath });
    try {
      expect(store.storeAvailability()).toMatchObject({
        state: "ready",
        value: "readable",
      });
      expect(store.recentThreads()).toEqual([]);
    } finally {
      store.close();
    }
  });
});
