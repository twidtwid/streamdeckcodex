import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CodexStore } from "../src/lib/codex-store.js";

describe("model catalog cache", () => {
  it("shares one file-version read between model and reasoning snapshots", () => {
    const root = mkdtempSync(join(tmpdir(), "streamdeck-model-cache-"));
    const databasePath = join(root, "state.sqlite");
    const catalogPath = join(root, "models_cache.json");
    const database = new DatabaseSync(databasePath);
    database.exec(
      `CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT, preview TEXT, recency_at_ms INTEGER, reasoning_effort TEXT, model TEXT, archived INTEGER); CREATE TABLE thread_spawn_edges (child_thread_id TEXT, status TEXT);`,
    );
    database
      .prepare(
        `INSERT INTO threads VALUES ('thread', '', '/tmp', 'Thread', 'preview', ?, 'high', 'gpt-5.6-sol', 0)`,
      )
      .run(Date.now());
    database.close();
    writeFileSync(
      catalogPath,
      JSON.stringify({
        models: [
          {
            slug: "gpt-5.6-sol",
            supported_reasoning_levels: [{ effort: "high" }],
          },
        ],
      }),
    );
    let reads = 0;
    const store = new CodexStore({
      codexHome: root,
      databasePath,
      activeThreadId: () => "thread",
      modelReader: (path) => {
        reads += 1;
        return readFileSync(path, "utf8");
      },
    });
    try {
      expect(store.modelSnapshot().options).toHaveLength(1);
      expect(store.reasoningSnapshot().levels).toContain("high");
      expect(reads).toBe(1);
      store.modelSnapshot();
      expect(reads).toBe(1);

      writeFileSync(catalogPath, "{");
      expect(store.modelSnapshot().options).toEqual([]);
      expect(reads).toBe(2);
      writeFileSync(
        catalogPath,
        JSON.stringify({
          models: [
            {
              slug: "gpt-5.6-terra",
              supported_reasoning_levels: [{ effort: "medium" }],
            },
          ],
        }),
      );
      expect(store.modelSnapshot().options[0]?.slug).toBe("gpt-5.6-terra");
      expect(reads).toBe(3);
    } finally {
      store.close();
    }
  });
});
