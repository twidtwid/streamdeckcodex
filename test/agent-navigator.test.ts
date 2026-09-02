import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStreamDeckAction } from "./helpers/fake-streamdeck-action.js";

const harness = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  openNewChat: vi.fn(async () => undefined),
  openThread: vi.fn(async () => undefined),
  sessions: vi.fn<() => unknown[]>(() => []),
}));

vi.mock("../src/lib/automation.js", () => ({
  openNewChat: harness.openNewChat,
  openThread: harness.openThread,
}));
vi.mock("../src/lib/codex-store.js", () => ({
  codexStore: {
    acknowledge: harness.acknowledge,
    sessions: harness.sessions,
  },
}));
vi.mock("../src/lib/render-cache.js", () => ({
  renderFeedback: (action: FakeStreamDeckAction, value: unknown) =>
    action.setFeedback(value),
}));
vi.mock("@elgato/streamdeck", () => ({
  action: () => () => undefined,
  default: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
  SingletonAction: class {
    readonly actions = [];
  },
}));

import { AgentNavigatorAction } from "../src/actions/agent-navigator.js";

function session(index: number, isActive = false) {
  return {
    id: `thread-${index}`,
    sessionLabel: `Chat ${index}`,
    sessionIndex: index,
    isActive,
    status: "idle",
  };
}

function dialEvent(action: FakeStreamDeckAction, ticks?: number) {
  return {
    action,
    payload: {
      settings: action.currentSettings(),
      ...(ticks === undefined ? {} : { ticks }),
    },
  } as never;
}

function lastFeedback(action: FakeStreamDeckAction) {
  return action.calls.filter(({ method }) => method === "setFeedback").at(-1)
    ?.value as { title: string; value: string };
}

describe("agent navigator dial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.sessions.mockReturnValue([
      session(0),
      session(1, true),
      session(2),
    ]);
  });

  it("starts on the focused chat and rotation only moves the local selection", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const dial = new AgentNavigatorAction();
    await dial.onWillAppear(dialEvent(action));
    expect(lastFeedback(action)).toMatchObject({
      title: "SESSION 2/3",
      value: "Chat 1",
    });

    await dial.onDialRotate(dialEvent(action, 1));
    expect(lastFeedback(action)).toMatchObject({
      title: "SESSION 3/3",
      value: "Chat 2",
    });
    await dial.onDialRotate(dialEvent(action, 1));
    expect(lastFeedback(action)).toMatchObject({ title: "SESSION 1/3" });
    expect(harness.openThread).not.toHaveBeenCalled();
    expect(harness.acknowledge).not.toHaveBeenCalled();
  });

  it("press opens exactly the selected chat and acknowledges it", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const dial = new AgentNavigatorAction();
    await dial.onWillAppear(dialEvent(action));
    await dial.onDialRotate(dialEvent(action, 1));
    await dial.onDialUp(dialEvent(action));

    expect(harness.acknowledge).toHaveBeenCalledWith("thread-2");
    expect(harness.openThread).toHaveBeenCalledTimes(1);
    expect(harness.openThread).toHaveBeenCalledWith("thread-2");
    expect(harness.openNewChat).not.toHaveBeenCalled();
  });

  it("press on an empty list starts a new chat", async () => {
    harness.sessions.mockReturnValue([]);
    const action = new FakeStreamDeckAction({}, "dial");
    const dial = new AgentNavigatorAction();
    await dial.onWillAppear(dialEvent(action));
    expect(lastFeedback(action)).toMatchObject({
      title: "SESSION",
      value: "NEW",
    });

    await dial.onDialUp(dialEvent(action));
    expect(harness.openNewChat).toHaveBeenCalledTimes(1);
    expect(harness.openThread).not.toHaveBeenCalled();
  });

  it("shows an alert when the open fails", async () => {
    harness.openThread.mockRejectedValueOnce(new Error("no witness"));
    const action = new FakeStreamDeckAction({}, "dial");
    const dial = new AgentNavigatorAction();
    await dial.onWillAppear(dialEvent(action));
    await dial.onDialUp(dialEvent(action));
    expect(action.calls.map(({ method }) => method)).toContain("showAlert");
  });
});
