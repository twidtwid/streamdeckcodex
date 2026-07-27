import { describe, expect, it } from "vitest";
import {
  compactContext,
  CONTEXT_STALE_MS,
  parseLatestContext,
  toggleContextView,
} from "../src/lib/context.js";
import { contextKeySvg } from "../src/lib/visuals.js";

const now = Date.parse("2026-07-25T18:00:00Z");
const threadId = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";

function tokenEvent(
  timestamp: string,
  usedTokens: number,
  maxTokens: number,
): string {
  return JSON.stringify({
    timestamp,
    payload: {
      type: "token_count",
      info: {
        last_token_usage: { total_tokens: usedTokens },
        model_context_window: maxTokens,
      },
    },
  });
}

describe("focused-chat context", () => {
  it("reads only a verified fresh snapshot for the supplied task", () => {
    expect(
      parseLatestContext(
        tokenEvent("2026-07-25T17:59:00Z", 82_256, 258_400),
        threadId,
        now,
      ),
    ).toEqual({
      threadId,
      usedTokens: 82_256,
      maxTokens: 258_400,
      remainingPercent: 68,
      observedAt: Date.parse("2026-07-25T17:59:00Z"),
    });
  });

  it("rejects missing, malformed, future, and stale values", () => {
    expect(parseLatestContext("", threadId, now)).toBeUndefined();
    expect(
      parseLatestContext(
        '{"payload":{"type":"token_count","info":{}}}',
        threadId,
        now,
      ),
    ).toBeUndefined();
    expect(
      parseLatestContext(
        tokenEvent("2026-07-25T18:02:00Z", 1, 100),
        threadId,
        now,
      ),
    ).toBeUndefined();
    expect(
      parseLatestContext(
        tokenEvent(new Date(now - CONTEXT_STALE_MS - 1).toISOString(), 1, 100),
        threadId,
        now,
      ),
    ).toBeUndefined();
  });

  it("toggles locally between remaining and exact compact views", () => {
    expect(toggleContextView("remaining")).toBe("exact");
    expect(toggleContextView("exact")).toBe("remaining");
    const snapshot = parseLatestContext(
      tokenEvent("2026-07-25T17:59:00Z", 82_256, 258_400),
      threadId,
      now,
    );
    expect(compactContext(snapshot)).toBe("82K/258K");

    const remaining = contextKeySvg(snapshot, "remaining");
    expect(remaining).toContain(">CONTEXT LEFT</text>");
    expect(remaining).toContain(">68%</text>");
    expect(remaining).not.toContain("BAR");

    const exact = contextKeySvg(snapshot, "exact");
    expect(exact).toContain(">82K <tspan");
    expect(exact).toContain(">258K <tspan");
    expect(exact).toContain(">USED</tspan>");
    expect(exact).toContain(">MAX</tspan>");
    expect(exact).not.toContain("BAR");
    expect(exact).not.toContain(">LEFT</text>");
    expect(exact).not.toContain("...");
  });

  it("fills the meter by used percentage in both views", () => {
    const snapshot = parseLatestContext(
      tokenEvent("2026-07-25T17:59:00Z", 82_256, 258_400),
      threadId,
      now,
    );
    for (const view of ["remaining", "exact"] as const) {
      const svg = contextKeySvg(snapshot, view);
      expect(svg).toContain('width="33" height="8"');
    }
    expect(contextKeySvg(snapshot, "remaining")).not.toContain("BAR");
  });

  it("renders unknown instead of a sample number", () => {
    for (const mode of ["remaining", "exact"] as const) {
      const svg = contextKeySvg(undefined, mode);
      expect(svg).toContain(">CONTEXT</text>");
      expect(svg).toContain(">NO DATA</text>");
      expect(svg).not.toContain(">--");
      expect(svg).not.toContain(">USED</tspan>");
      expect(svg).not.toContain(">MAX</tspan>");
      expect(svg).not.toMatch(/>\d+%<\/text>/);
    }
  });
});
