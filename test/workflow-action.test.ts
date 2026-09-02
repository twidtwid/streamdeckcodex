import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStreamDeckAction } from "./helpers/fake-streamdeck-action.js";

const harness = vi.hoisted(() => ({
  launchWorkflow: vi.fn(async () => undefined),
  focusedThread: vi.fn<() => { id: string; cwd: string } | undefined>(),
}));

vi.mock("../src/lib/automation.js", () => ({
  launchWorkflow: harness.launchWorkflow,
}));
vi.mock("../src/lib/codex-store.js", () => ({
  codexStore: { focusedThread: harness.focusedThread },
}));
vi.mock("../src/lib/render-cache.js", () => ({
  renderFeedback: (action: FakeStreamDeckAction, value: unknown) =>
    action.setFeedback(value),
  renderKey: (action: FakeStreamDeckAction, image: string) =>
    action.setImage(image),
}));
vi.mock("@elgato/streamdeck", () => ({
  action: () => () => undefined,
  default: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
  SingletonAction: class {
    readonly actions = [];
  },
}));

import { WorkflowAction } from "../src/actions/workflow.js";
import { WORKFLOWS } from "../src/lib/workflows.js";

function event(action: FakeStreamDeckAction, ticks?: number): never {
  return {
    action,
    payload: {
      settings: action.currentSettings(),
      ...(ticks === undefined ? {} : { ticks }),
    },
  } as never;
}

describe("workflow launcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.focusedThread.mockReturnValue({
      id: "thread-1",
      cwd: "/tmp/project",
    });
  });

  it("dial rotation previews the next workflow without launching", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const launcher = new WorkflowAction();
    await launcher.onWillAppear(event(action));
    await launcher.onDialRotate(event(action, 1));

    expect(action.currentSettings()).toMatchObject({ workflowIndex: 1 });
    expect(harness.launchWorkflow).not.toHaveBeenCalled();
  });

  it("dial press launches the previewed workflow once in the focused project", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const launcher = new WorkflowAction();
    await launcher.onWillAppear(event(action));
    await launcher.onDialRotate(event(action, 1));
    await launcher.onDialUp(event(action));

    expect(harness.launchWorkflow).toHaveBeenCalledTimes(1);
    expect(harness.launchWorkflow).toHaveBeenCalledWith(
      WORKFLOWS[1],
      "thread-1",
      "/tmp/project",
    );
  });

  it("a key launches its configured workflow and prefers a configured path", async () => {
    const action = new FakeStreamDeckAction({
      workflowId: "tests",
      path: "/tmp/other",
    });
    const launcher = new WorkflowAction();
    await launcher.onWillAppear(event(action));
    await launcher.onKeyDown(event(action));

    expect(harness.launchWorkflow).toHaveBeenCalledWith(
      WORKFLOWS.find(({ id }) => id === "tests"),
      "thread-1",
      "/tmp/other",
    );
    expect(action.calls.map(({ method }) => method)).toContain("showOk");
  });

  it("refuses to launch without a focused chat and alerts", async () => {
    harness.focusedThread.mockReturnValue(undefined);
    const action = new FakeStreamDeckAction({ path: "/tmp/other" });
    const launcher = new WorkflowAction();
    await launcher.onKeyDown(event(action));

    expect(harness.launchWorkflow).not.toHaveBeenCalled();
    expect(action.calls.map(({ method }) => method)).toContain("showAlert");
  });
});
