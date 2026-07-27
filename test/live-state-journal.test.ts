import { describe, expect, it } from "vitest";
const liveStateJournal = await import(
  new URL("../scripts/lib/live-state-journal.mjs", import.meta.url).href
);
const { restoreLiveState, snapshotLiveState } = liveStateJournal;

describe("transactional live-state journal", () => {
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
});
