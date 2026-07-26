import { describe, expect, it } from "vitest";
import { modelFeedback } from "../src/lib/model.js";
import { reasoningFeedback } from "../src/lib/reasoning.js";
import type { SessionSnapshot } from "../src/types.js";
import {
  agentKeySvg,
  STATUS_COLOR,
  statusIndicator,
} from "../src/lib/visuals.js";

const PENDING_AMBER = "#F4B740";

function needsInputSession(isActive: boolean): SessionSnapshot {
  return {
    id: isActive ? "active-needs-input" : "inactive-needs-input",
    rolloutPath: "/tmp/needs-input.jsonl",
    cwd: "/tmp/streamdeckcodex",
    title: "Approval color verification",
    preview: "Approval color verification",
    recencyAtMs: 1,
    displayTitle: "Approval color verification",
    status: "needs-input",
    detail: "Needs input",
    lastEventAt: 1,
    sessionLabel: "Approve",
    sessionIndex: 0,
    isActive,
  };
}

describe("official Codex Micro session status palette", () => {
  it("uses every exact official live-status color", () => {
    expect(STATUS_COLOR).toMatchObject({
      idle: "#FFFFFF",
      unread: "#9BF396",
      thinking: "#9CD5FE",
      running: "#9CD5FE",
      "needs-input": "#FFD0B8",
      error: "#FF7373",
    });
  });

  it("keeps needs-input distinct from Model and Reasoning pending amber", () => {
    expect(STATUS_COLOR["needs-input"]).not.toBe(PENDING_AMBER);
    expect(
      modelFeedback({ selected: "gpt-5.6-terra", applied: "gpt-5.6-sol" }, [
        { slug: "gpt-5.6-sol", label: "SOL" },
        { slug: "gpt-5.6-terra", label: "TERRA" },
      ]).indicator.bar_fill_c,
    ).toBe(PENDING_AMBER);
    expect(
      reasoningFeedback({ selected: "high", applied: "medium" }, [
        "low",
        "medium",
        "high",
      ]).indicator.bar_fill_c,
    ).toBe(PENDING_AMBER);
  });

  it("renders inactive and active needs-input fixtures with readable contrast", () => {
    const inactive = agentKeySvg(needsInputSession(false), 0);
    const active = agentKeySvg(needsInputSession(true), 0);

    expect(inactive).toContain('stroke="#FFD0B8"');
    expect(inactive).toContain('fill="#9A5B45"');
    expect(inactive).toContain('fill="#E7A589"');
    expect(inactive).not.toContain(PENDING_AMBER);
    expect(inactive).not.toContain("...");

    expect(active).toContain('fill="#FFFFFF"');
    expect(active).toContain('stroke="#FFD0B8"');
    expect(active).not.toContain(PENDING_AMBER);
    expect(active).not.toContain("...");
  });

  it("uses the shared palette for Dial 1", () => {
    for (const [status, color] of Object.entries(STATUS_COLOR)) {
      expect(
        statusIndicator(status as keyof typeof STATUS_COLOR).bar_fill_c,
      ).toBe(color);
    }
  });
});
