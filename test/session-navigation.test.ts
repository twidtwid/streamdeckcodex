import { describe, expect, it } from "vitest";
import type { AgentSnapshot } from "../src/types.js";
import {
  resolveSessionNeighbor,
  type SessionDirection,
} from "../src/lib/session-navigation.js";
import { sessionNavigationKeySvg } from "../src/lib/visuals.js";

function session(id: string, recencyAtMs: number): AgentSnapshot {
  return {
    id,
    rolloutPath: `/tmp/${id}.jsonl`,
    cwd: "/tmp",
    title: id,
    preview: id,
    recencyAtMs,
    displayTitle: id,
    status: "idle",
    detail: "Idle",
    lastEventAt: recencyAtMs,
  };
}

const sessions = [
  session("newest", 300),
  session("current", 200),
  session("oldest", 100),
];

describe("session navigation", () => {
  it("selects the immediately older and newer sessions", () => {
    expect(resolveSessionNeighbor(sessions, "current", "older")).toMatchObject({
      status: "available",
      target: { id: "oldest" },
      currentIndex: 1,
      targetIndex: 2,
    });
    expect(resolveSessionNeighbor(sessions, "current", "newer")).toMatchObject({
      status: "available",
      target: { id: "newest" },
      currentIndex: 1,
      targetIndex: 0,
    });
  });

  it("never wraps at either end", () => {
    expect(resolveSessionNeighbor(sessions, "oldest", "older")).toEqual({
      status: "unavailable",
      reason: "end-of-list",
    });
    expect(resolveSessionNeighbor(sessions, "newest", "newer")).toEqual({
      status: "unavailable",
      reason: "end-of-list",
    });
  });

  it("never guesses when the focused session is missing", () => {
    for (const focused of [undefined, "not-in-list"]) {
      expect(resolveSessionNeighbor(sessions, focused, "older")).toEqual({
        status: "unavailable",
        reason: "no-focused-session",
      });
    }
  });

  it("handles empty and one-session lists without inventing a target", () => {
    expect(resolveSessionNeighbor([], undefined, "older")).toEqual({
      status: "unavailable",
      reason: "no-focused-session",
    });
    const only = [session("only", 1)];
    for (const direction of ["older", "newer"] as const) {
      expect(resolveSessionNeighbor(only, "only", direction)).toEqual({
        status: "unavailable",
        reason: "end-of-list",
      });
    }
  });

  it("renders compact unclipped labels and explicit failure states", () => {
    const cases: Array<[SessionDirection, string, string]> = [
      ["older", "available", "PREVIOUS"],
      ["newer", "available", "NEXT"],
      ["older", "oldest", "OLDEST"],
      ["newer", "newest", "NEWEST"],
      ["older", "no-chat", "NO CHAT"],
      ["newer", "failed", "FAILED"],
    ];
    for (const [direction, state, label] of cases) {
      const svg = sessionNavigationKeySvg(
        direction,
        state as Parameters<typeof sessionNavigationKeySvg>[1],
      );
      expect(svg).toContain(label);
      expect(svg).not.toContain("...");
      expect(svg).not.toContain("Accept");
      expect(svg).not.toContain("Reject");
    }
  });
});
