import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFocusedLiveInput } from "../src/lib/codex-store.js";
import type { AgentSnapshot } from "../src/types.js";

function snapshot(id: string, status: AgentSnapshot["status"]): AgentSnapshot {
  return {
    id,
    rolloutPath: `/tmp/${id}.jsonl`,
    cwd: "/tmp/streamdeckcodex",
    title: id,
    preview: id,
    displayTitle: id,
    recencyAtMs: 1,
    lastEventAt: 1,
    status,
    detail: status,
  };
}

describe("focused native approval status", () => {
  it("overrides only the focused running task while approval is pending", () => {
    const result = applyFocusedLiveInput(
      [snapshot("focused", "running"), snapshot("background", "unread")],
      "focused",
      { pending: true, kind: "approval" },
    );

    expect(result).toMatchObject([
      {
        id: "focused",
        status: "needs-input",
        detail: "Approval required",
      },
      { id: "background", status: "unread", detail: "unread" },
    ]);
  });

  it("restores the rollout-derived state when the live prompt clears", () => {
    const persisted = [snapshot("focused", "running")];
    const pending = applyFocusedLiveInput(persisted, "focused", {
      pending: true,
      kind: "approval",
    });
    const cleared = applyFocusedLiveInput(persisted, "focused", {
      pending: false,
    });

    expect(pending[0]?.status).toBe("needs-input");
    expect(cleared[0]).toBe(persisted[0]);
    expect(cleared[0]?.status).toBe("running");
  });

  it("attributes a separate pending approval to its visible chat title", () => {
    const sessions = [
      { ...snapshot("newest", "running"), title: "Different focused chat" },
      {
        ...snapshot("approval-owner", "running"),
        title: "Make an interactive HTML page that labels chocolates",
      },
    ];

    const result = applyFocusedLiveInput(sessions, "newest", {
      pending: true,
      kind: "approval",
      title: "Make an interactive HTML page that labels chocolates",
    });

    expect(result[0]?.status).toBe("running");
    expect(result[1]).toMatchObject({
      id: "approval-owner",
      status: "needs-input",
    });
  });

  it("fails closed for unknown input state or an unrelated focused task", () => {
    const persisted = [snapshot("visible", "thinking")];

    expect(applyFocusedLiveInput(persisted, "visible", undefined)).toBe(
      persisted,
    );
    expect(
      applyFocusedLiveInput(persisted, "other", {
        pending: true,
        kind: "approval",
      }),
    ).toEqual(persisted);
  });

  it("keeps the native read path observation-only", () => {
    const source = readFileSync("native/CodexUIControl.swift", "utf8");
    const readStart = source.indexOf('if action == "input-read"');
    const navigationStart = source.indexOf("try focusCodex", readStart);
    const readPath = source.slice(readStart, navigationStart);

    expect(readStart).toBeGreaterThan(-1);
    expect(navigationStart).toBeGreaterThan(readStart);
    expect(readPath).toContain("hasPendingApproval");
    expect(readPath).not.toContain("click(");
    expect(readPath).not.toContain("CGEvent");
    expect(readPath).not.toContain("NSWorkspace.shared.open");

    // The live native sheet exposes this state in the selected task row even
    // when its Allow/Deny controls are absent from the AX tree.
    expect(source).toContain("awaitingapproval");
  });
});
