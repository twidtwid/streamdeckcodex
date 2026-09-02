import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodexStore } from "../src/lib/codex-store.js";
import {
  parseLatestUsage,
  toggleUsageView,
  usageFromRateLimitsResult,
} from "../src/lib/usage.js";
import type { UsageSnapshot } from "../src/types.js";
import { usageKeySvg } from "../src/lib/visuals.js";

describe("usage refresh off the tick", () => {
  function storeWith(fetcher: () => Promise<UsageSnapshot>) {
    return new CodexStore({
      usageFetcher: fetcher,
      databasePath: join(
        mkdtempSync(join(tmpdir(), "usage-")),
        "missing.sqlite",
      ),
    });
  }

  it("serves the last snapshot synchronously while a refresh is in flight", async () => {
    let now = 100_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const pending: Array<(snapshot: UsageSnapshot) => void> = [];
    const fetcher = vi.fn(
      () => new Promise<UsageSnapshot>((resolve) => pending.push(resolve)),
    );
    const store = storeWith(fetcher);
    try {
      expect(store.usageSnapshotCached()).toBeUndefined();
      expect(store.usageAvailabilityCached()).toMatchObject({
        state: "unavailable",
        reason: "not-exposed",
      });

      const first = store.usageSnapshot();
      pending[0]!({ usedPercent: 20, observedAt: 1 });
      await expect(first).resolves.toMatchObject({ usedPercent: 20 });
      expect(store.usageSnapshotCached()).toMatchObject({ usedPercent: 20 });

      now += 30_001;
      const second = store.usageSnapshot();
      const third = store.usageSnapshot();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(store.usageSnapshotCached()).toMatchObject({ usedPercent: 20 });
      pending[1]!({ usedPercent: 25, observedAt: 2 });
      await Promise.all([second, third]);
      expect(store.usageSnapshotCached()).toMatchObject({ usedPercent: 25 });
    } finally {
      clock.mockRestore();
      store.close();
    }
  });

  it("records a structured reason when the fetch and the rollout fallback both fail", async () => {
    const store = storeWith(async () => {
      throw new Error("Codex app server timed out during initialize");
    });
    try {
      await expect(store.usageSnapshot()).resolves.toBeUndefined();
      expect(store.usageSnapshotCached()).toBeUndefined();
      expect(store.usageAvailabilityCached()).toMatchObject({
        state: "unavailable",
        reason: "timeout",
      });
    } finally {
      store.close();
    }
  });
});

describe("live Codex usage", () => {
  it("toggles between weekly capacity and banked resets", () => {
    expect(toggleUsageView("weekly")).toBe("resets");
    expect(toggleUsageView("resets")).toBe("weekly");
  });

  it("selects the longest account window and authoritative reset count", () => {
    expect(
      usageFromRateLimitsResult(
        {
          rateLimits: {
            primary: {
              usedPercent: 80,
              windowDurationMins: 300,
              resetsAt: 100,
            },
            secondary: {
              usedPercent: 52,
              windowDurationMins: 10080,
              resetsAt: 200,
            },
          },
          rateLimitResetCredits: { availableCount: 2 },
        },
        50,
      ),
    ).toEqual({
      usedPercent: 52,
      observedAt: 50,
      windowMinutes: 10080,
      resetsAt: 200,
      resetsAvailable: 2,
    });
  });

  it("reads the newest rate-limit event", () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-07-25T16:00:00Z",
        payload: {
          type: "token_count",
          rate_limits: {
            primary: {
              used_percent: 41,
              window_minutes: 10080,
              resets_at: 1785259094,
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: "2026-07-25T17:00:00Z",
        payload: {
          type: "token_count",
          rate_limits: {
            primary: {
              used_percent: 42,
              window_minutes: 10080,
              resets_at: 1785259094,
            },
          },
        },
      }),
    ].join("\n");

    expect(parseLatestUsage(lines)).toMatchObject({
      usedPercent: 42,
      windowMinutes: 10080,
      resetsAt: 1785259094,
    });
  });

  it("ignores malformed and incomplete events", () => {
    expect(
      parseLatestUsage('not json\n{"payload":{"type":"token_count"}}'),
    ).toBe(undefined);
  });

  it("renders percent and reset information without external requests", () => {
    const svg = usageKeySvg(
      {
        usedPercent: 42,
        observedAt: Date.parse("2026-07-25T17:00:00Z"),
        resetsAt: Date.parse("2026-07-28T17:00:00Z") / 1000,
      },
      "weekly",
      Date.parse("2026-07-25T17:00:00Z"),
    );

    expect(svg).toContain(">58%</text>");
    expect(svg).toContain(">RESET 3D</text>");
    expect(svg).toContain("#35C759");
  });

  it("uses plain hours near the natural weekly reset", () => {
    const now = Date.parse("2026-07-25T17:00:00Z");
    const svg = usageKeySvg(
      {
        usedPercent: 42,
        observedAt: now,
        resetsAt: (now + 5 * 60 * 60 * 1000) / 1000,
      },
      "weekly",
      now,
    );

    expect(svg).toContain(">RESET 5H</text>");
  });

  it("renders the authoritative banked reset count in the pressed view", () => {
    const svg = usageKeySvg(
      {
        usedPercent: 42,
        observedAt: Date.parse("2026-07-25T17:00:00Z"),
        resetsAvailable: 3,
      },
      "resets",
    );

    expect(svg).toContain(">RESETS</text>");
    expect(svg).toContain(">3</text>");
    expect(svg).toContain(">AVAILABLE</text>");
  });
});
