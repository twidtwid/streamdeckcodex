import { describe, expect, it } from "vitest";
import {
  parseLatestUsage,
  toggleUsageView,
  usageFromRateLimitsResult,
} from "../src/lib/usage.js";
import { usageKeySvg } from "../src/lib/visuals.js";

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
