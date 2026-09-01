import { describe, expect, it } from "vitest";
const liveStateJournal = await import(
  new URL("../scripts/lib/live-state-journal.mjs", import.meta.url).href
);
const {
  createLiveStateRestorer,
  requireConnectedQaTarget,
  restoreLiveState,
  snapshotLiveState,
} = liveStateJournal;

describe("transactional live-state journal", () => {
  it("requires the explicit disposable target when one is configured", () => {
    expect(requireConnectedQaTarget("qa-task", "qa-task")).toBe("qa-task");
    expect(() => requireConnectedQaTarget(undefined, "qa-task")).toThrow(
      "focused primary",
    );
    expect(() =>
      requireConnectedQaTarget("coordinator-task", "qa-task"),
    ).toThrow("explicit disposable target");
  });

  it("requires and preserves the exact task identity", () => {
    expect(() => snapshotLiveState(() => ({}))).toThrow("task ID");

    const calls: Array<[string, string | undefined, string | undefined]> = [];
    const native = (action: string, value?: string, threadId?: string) => {
      calls.push([action, value, threadId]);
      if (action === "read") return { model: "5.6 Sol", effort: "Medium" };
      return { active: action === "mode-read" ? value === "plan" : false };
    };
    const snapshot = snapshotLiveState(native, "fixture-task-id");

    expect(snapshot.threadId).toBe("fixture-task-id");
    expect(calls).toEqual(
      expect.arrayContaining([
        ["read", undefined, "fixture-task-id"],
        ["mode-read", "plan", "fixture-task-id"],
        ["mode-read", "fast", "fixture-task-id"],
      ]),
    );
  });

  it("fails restoration when no task identity was captured", () => {
    expect(restoreLiveState(() => ({}), {})).toEqual([
      "task: no exact focused task ID was captured for restoration",
    ]);
  });

  it("snapshots and restores only modes owned by the caller", () => {
    const calls: Array<[string, string | undefined, string | undefined]> = [];
    const native = (action: string, value?: string, threadId?: string) => {
      calls.push([action, value, threadId]);
      if (action === "read") return { model: "Sol", effort: "High" };
      if (action === "mode-read") return { active: false };
      return {};
    };
    const snapshot = snapshotLiveState(native, "fixture-task-id", {
      modes: ["plan"],
    });

    expect(snapshot.plan).toBe(false);
    expect(snapshot.fast).toBeUndefined();
    expect(calls).toContainEqual(["mode-read", "plan", "fixture-task-id"]);
    expect(calls).not.toContainEqual(["mode-read", "fast", "fixture-task-id"]);
    calls.length = 0;
    expect(restoreLiveState(native, snapshot)).toEqual([]);
    expect(calls).not.toContainEqual(["mode-read", "fast", "fixture-task-id"]);
  });

  it("restores a captured state at most once", () => {
    const calls: Array<[string, string | undefined, string | undefined]> = [];
    const native = (action: string, value?: string, threadId?: string) => {
      calls.push([action, value, threadId]);
      if (action === "read") return { model: "Terra", effort: "Light" };
      if (action === "mode-read") return { active: true };
      return {};
    };
    const restore = createLiveStateRestorer(native, {
      threadId: "fixture-task-id",
      plan: false,
      fast: false,
      model: "Sol",
      reasoning: "High",
      modelSelection: { value: "gpt-5.6-sol", label: "Sol" },
      reasoningSelection: { value: "high", label: "High" },
    });

    expect(restore()).toEqual([]);
    const callsAfterFirstRestore = calls.length;
    expect(restore()).toEqual([]);
    expect(calls).toHaveLength(callsAfterFirstRestore);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["mode-toggle", "plan", "fixture-task-id"],
        ["mode-toggle", "fast", "fixture-task-id"],
        ["model", expect.any(String), "fixture-task-id"],
        ["reasoning", expect.any(String), "fixture-task-id"],
      ]),
    );
  });
});
