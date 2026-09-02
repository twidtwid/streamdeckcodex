import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStreamDeckAction } from "./helpers/fake-streamdeck-action.js";

const harness = vi.hoisted(() => ({
  applyModel: vi.fn(async () => ({ model: "5.6 Terra", effort: "Medium" })),
  applyReasoning: vi.fn(async () => ({ model: "5.6 Sol", effort: "Light" })),
  invalidate: vi.fn(),
  modelSnapshot: vi.fn(),
  reasoningSnapshot: vi.fn(),
}));

vi.mock("../src/lib/automation.js", () => ({
  applyModel: harness.applyModel,
  applyReasoning: harness.applyReasoning,
}));
vi.mock("../src/lib/codex-store.js", () => ({
  codexStore: {
    invalidate: harness.invalidate,
    modelSnapshot: harness.modelSnapshot,
    reasoningSnapshot: harness.reasoningSnapshot,
  },
}));
vi.mock("../src/lib/codex-ui-control.js", () => ({
  pickerFailureLabel: () => "VERIFY FAIL",
}));
vi.mock("../src/lib/render-cache.js", () => ({
  renderFeedback: (action: FakeStreamDeckAction, value: unknown) =>
    action.setFeedback(value),
}));
vi.mock("@elgato/streamdeck", () => ({
  action: () => () => undefined,
  default: {
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
  SingletonAction: class {
    readonly actions = [];
  },
}));

import { ModelAction } from "../src/actions/model.js";
import { ReasoningAction } from "../src/actions/reasoning.js";

const options = [
  {
    slug: "gpt-5.6-luna",
    label: "LUNA",
    displayName: "GPT-5.6-Luna",
    pickerLabel: "Luna",
    defaultReasoning: "medium",
    supportedReasoning: ["low", "medium"],
  },
  {
    slug: "gpt-5.6-terra",
    label: "TERRA",
    displayName: "GPT-5.6-Terra",
    pickerLabel: "Terra",
    defaultReasoning: "medium",
    supportedReasoning: ["low", "medium"],
  },
  {
    slug: "gpt-5.6-sol",
    label: "SOL",
    displayName: "GPT-5.6-Sol",
    pickerLabel: "Sol",
    defaultReasoning: "medium",
    supportedReasoning: ["low", "medium", "high"],
  },
];

function dialEvent(
  action: FakeStreamDeckAction,
  ticks?: number,
): Record<string, unknown> {
  return {
    action,
    payload: {
      settings: action.currentSettings(),
      ...(ticks === undefined ? {} : { ticks }),
    },
  };
}

describe("real dial action event path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.modelSnapshot.mockReturnValue({
      current: "gpt-5.6-sol",
      options,
      threadId: "focused-task",
    });
    harness.reasoningSnapshot.mockReturnValue({
      current: "medium",
      levels: ["low", "medium", "high"],
      model: "gpt-5.6-sol",
      threadId: "focused-task",
    });
  });

  it("previews Model on rotation and dispatches one targeted apply on press", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const handler = new ModelAction();
    await handler.onWillAppear(dialEvent(action) as never);
    await handler.onDialRotate(dialEvent(action, -1) as never);

    expect(harness.applyModel).not.toHaveBeenCalled();
    expect(action.currentSettings()).toMatchObject({
      selectedModel: "gpt-5.6-terra",
      appliedModel: "gpt-5.6-sol",
    });

    await handler.onDialUp(dialEvent(action) as never);
    expect(harness.applyModel).toHaveBeenCalledTimes(1);
    expect(harness.applyModel).toHaveBeenCalledWith(
      "gpt-5.6-terra",
      "Terra",
      "focused-task",
    );
  });

  it("previews Reasoning on rotation and dispatches one targeted apply on press", async () => {
    const action = new FakeStreamDeckAction({}, "dial");
    const handler = new ReasoningAction();
    await handler.onWillAppear(dialEvent(action) as never);
    await handler.onDialRotate(dialEvent(action, -1) as never);

    expect(harness.applyReasoning).not.toHaveBeenCalled();
    expect(action.currentSettings()).toMatchObject({
      selectedLevel: "low",
      appliedLevel: "medium",
    });

    await handler.onDialUp(dialEvent(action) as never);
    expect(harness.applyReasoning).toHaveBeenCalledTimes(1);
    expect(harness.applyReasoning).toHaveBeenCalledWith(
      "low",
      "Light",
      "focused-task",
    );
  });
});
