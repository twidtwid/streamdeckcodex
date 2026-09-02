import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
  type HealthSnapshot,
} from "../src/lib/health.js";

function contextLine(timestamp: string, info: unknown): string {
  return JSON.stringify({
    timestamp,
    payload: { type: "token_count", info },
  });
}

describe("reason-coded health diagnostics", () => {
  it("runs the doctor against the built plugin helper, not its cache path", () => {
    const runner = readFileSync("scripts/run-doctor.mjs", "utf8");
    expect(runner).toContain("CODEX_UI_CONTROL: resolve(");
    expect(runner).toContain('"com.todd.streamdeckcodex.sdPlugin"');
    expect(runner).toContain('"codex-ui-control"');
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
