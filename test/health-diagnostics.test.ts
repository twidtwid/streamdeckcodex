import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CodexStore } from "../src/lib/codex-store.js";
import {
  availabilityReasonFromError,
  ready,
  unavailable,
} from "../src/lib/availability.js";
import { callReadOnlyAppServer } from "../src/lib/app-server.js";
import {
  CONTEXT_STALE_MS,
  contextAvailabilityFromLines,
} from "../src/lib/context.js";
import {
  HEALTH_COMPONENTS,
  HealthTransitionLogger,
  collectHealth,
  type HealthSnapshot,
} from "../src/lib/health.js";

function contextLine(timestamp: string, info: unknown): string {
  return JSON.stringify({
    timestamp,
    payload: { type: "token_count", info },
  });
}

describe("reason-coded health diagnostics", () => {
  it("runs bundled entries with the build identity and the caller's environment", async () => {
    // The doctor and qa:store both go through this runner; it must embed the
    // same build identity as the plugin bundle and forward env such as the
    // native helper path.
    const { runBundled } = await import(
      new URL("../scripts/lib/bundle-entry.mjs", import.meta.url).href
    );
    const directory = mkdtempSync(join(tmpdir(), "streamdeck-bundle-entry-"));
    const entry = join(directory, "entry.mjs");
    const report = join(directory, "report.json");
    writeFileSync(
      entry,
      [
        'import { writeFileSync } from "node:fs";',
        "writeFileSync(process.env.FIXTURE_REPORT, JSON.stringify({",
        "  helper: process.env.CODEX_UI_CONTROL,",
        "  build: __STREAMDECK_CODEX_BUILD__,",
        "}));",
      ].join("\n"),
    );
    const status = await runBundled({
      root: process.cwd(),
      entry,
      cacheName: "bundle-entry-test",
      env: {
        CODEX_UI_CONTROL: "/fixture/codex-ui-control",
        FIXTURE_REPORT: report,
      },
    });
    expect(status).toBe(0);
    const written = JSON.parse(readFileSync(report, "utf8"));
    expect(written.helper).toBe("/fixture/codex-ui-control");
    expect(written.build).toMatchObject({
      schemaVersion: 1,
      pluginVersion: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/),
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(["clean", "dirty"]).toContain(written.build.treeState);
    spawnSync("trash", [directory]);
  });

  it("summarizes only what the store has observed", async () => {
    const root = mkdtempSync(join(tmpdir(), "streamdeck-health-"));
    const databasePath = join(root, "state.sqlite");
    const rollout = join(root, "focused.jsonl");
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
    database
      .prepare(
        `INSERT INTO threads VALUES ('focused', ?, '/tmp', 'Focused', 'Focused', ?, 'high', 'gpt-5.6-sol', 0)`,
      )
      .run(rollout, Date.now());
    database.close();

    const reader = vi.fn(async () => ({
      pendingInput: false,
      approvalMode: "ask" as const,
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    }));
    const fetcher = vi.fn(async () => ({ usedPercent: 30, observedAt: 5 }));
    const store = new CodexStore({
      databasePath,
      activeThreadId: () => "focused",
      liveComposerReader: reader,
      usageFetcher: fetcher,
    });
    try {
      const cached = collectHealth(store);
      expect(reader).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(cached.components.focus).toMatchObject({
        state: "unavailable",
        reason: "not-exposed",
      });
      expect(cached.components.usage).toMatchObject({
        state: "unavailable",
        reason: "not-exposed",
      });

      await store.refreshLiveComposer();
      await store.usageSnapshot();
      const live = collectHealth(store);
      expect(reader).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(live.components.focus).toMatchObject({
        state: "ready",
        value: "focused",
      });
      expect(live.components.permissions).toMatchObject({
        state: "ready",
        value: "ask",
      });
      expect(live.components.usage).toMatchObject({
        state: "ready",
        value: "70% left",
      });
    } finally {
      store.close();
      spawnSync("trash", [root]);
    }
  });

  it("distinguishes missing, malformed, stale, and ready context", () => {
    const now = Date.parse("2026-08-31T20:00:00Z");
    expect(contextAvailabilityFromLines("", "thread", now)).toMatchObject({
      state: "unavailable",
      reason: "not-exposed",
    });
    expect(
      contextAvailabilityFromLines(
        contextLine("2026-08-31T19:59:00Z", { model_context_window: "bad" }),
        "thread",
        now,
      ),
    ).toMatchObject({ state: "unavailable", reason: "unsupported-schema" });
    expect(
      contextAvailabilityFromLines(
        contextLine(new Date(now - CONTEXT_STALE_MS - 1).toISOString(), {
          last_token_usage: { total_tokens: 100 },
          model_context_window: 1_000,
        }),
        "thread",
        now,
      ),
    ).toMatchObject({ state: "unavailable", reason: "stale" });
    expect(
      contextAvailabilityFromLines(
        contextLine("2026-08-31T19:59:00Z", {
          last_token_usage: { total_tokens: 250 },
          model_context_window: 1_000,
        }),
        "thread",
        now,
      ),
    ).toMatchObject({
      state: "ready",
      value: { remainingPercent: 75, threadId: "thread" },
    });
  });

  it("maps native failures without exposing raw messages", () => {
    expect(
      availabilityReasonFromError(
        Object.assign(new Error("private content"), {
          reasonCode: "TARGET_MISMATCH",
        }),
      ),
    ).toBe("target-mismatch");
    expect(availabilityReasonFromError(new Error("Accessibility denied"))).toBe(
      "accessibility",
    );
  });

  it("refuses mutating app-server methods before spawning a process", async () => {
    await expect(
      callReadOnlyAppServer("thread/settings/update", { threadId: "private" }),
    ).rejects.toThrow("Refusing non-read-only");
  });

  it("logs only component health transitions", () => {
    const logger = new HealthTransitionLogger();
    const log = vi.fn();
    const components = Object.fromEntries(
      HEALTH_COMPONENTS.map((component) => [component, ready("ok", 1)]),
    ) as HealthSnapshot["components"];
    const snapshot: HealthSnapshot = {
      build: {
        schemaVersion: 1,
        pluginVersion: "fixture",
        commit: "fixture",
        treeState: "clean",
      },
      observedAt: 1,
      components,
    };
    logger.observe(snapshot, log);
    logger.observe(snapshot, log);
    expect(log).toHaveBeenCalledTimes(HEALTH_COMPONENTS.length);

    logger.observe(
      {
        ...snapshot,
        components: { ...components, context: unavailable("stale", 2) },
      },
      log,
    );
    expect(log).toHaveBeenCalledTimes(HEALTH_COMPONENTS.length + 1);
    expect(log).toHaveBeenLastCalledWith(
      "Health context changed to unavailable:stale",
    );
  });
});
