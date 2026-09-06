import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  observation: {} as any,
  read: vi.fn(),
  perform: vi.fn(),
  focused: { id: "codex-1" },
  composer: { rendererWindowId: "window-1" },
  actions: [] as any[],
}));
vi.mock("../src/lib/providers/claude.js", () => ({
  claudeProvider: {
    read: () => fake.read(),
    perform: (...args: any[]) => fake.perform(...args),
  },
}));
vi.mock("../src/lib/codex-store.js", () => ({
  codexStore: {
    focusedThread: () => fake.focused,
    liveComposerState: () => fake.composer,
  },
}));
vi.mock("@elgato/streamdeck", () => ({
  SingletonAction: class {
    get actions() {
      return fake.actions;
    }
  },
  default: { logger: { warn: vi.fn() } },
}));
import { SingletonAction } from "@elgato/streamdeck";
import {
  ProviderAction,
  observeProviders,
} from "../src/lib/providers/router.js";
import {
  FakeStreamDeckAction,
  keyEvent,
} from "./helpers/fake-streamdeck-action.js";

const target = {
  provider: "claude",
  windowId: "4:8",
  sessionId: "claude-1",
  environment: "local",
};
function action(kind: string) {
  class Legacy extends SingletonAction<any> {
    override manifestId = `com.todd.streamdeckcodex.${kind}`;
    onKeyDown = vi.fn();
    onKeyUp = vi.fn();
    onDialUp = vi.fn();
    onDialRotate = vi.fn();
    onWillAppear = vi.fn();
    onDidReceiveSettings = vi.fn();
    onWillDisappear = vi.fn();
    refreshAll = vi.fn(async () => {
      for (const a of this.actions) await a.setTitle("codex");
    });
  }
  const legacy = new Legacy();
  return { legacy, router: new ProviderAction(legacy) };
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.actions.splice(0);
  fake.observation = {
    foreground: "claude",
    target,
    model: "Fable 5.1",
    effort: "High",
    permission: "Auto",
    capabilities: ["send"],
    observedAt: Date.now(),
  };
  fake.read.mockImplementation(async () => ({
    ...fake.observation,
    observedAt: Date.now(),
  }));
  fake.perform.mockImplementation(async () => ({
    ...fake.observation,
    observedAt: Date.now(),
  }));
});
describe("shared action adapter", () => {
  it("preserves legacy Codex events even when Claude is foreground", async () => {
    const { legacy, router } = action("command");
    const key = new FakeStreamDeckAction({ commandId: "send" });
    await router.onWillAppear(keyEvent(key));
    await router.onKeyDown(keyEvent(key));
    expect(legacy.onKeyDown).toHaveBeenCalledTimes(1);
    expect(fake.perform).not.toHaveBeenCalled();
  });
  it.each([
    "command",
    "keycap",
    "workflow",
    "approval-mode",
    "model",
    "reasoning",
    "agent-status",
    "agent-navigator",
    "usage",
    "context",
    "health",
  ])("never dispatches a Claude %s to Codex", async (kind) => {
    const { legacy, router } = action(kind);
    const key = new FakeStreamDeckAction({
      provider: "claude",
      commandId: "send",
      action: "command:send",
      workflowId: "debug",
    });
    await router.onWillAppear(keyEvent(key));
    await router.onKeyDown(keyEvent(key));
    expect(legacy.onKeyDown).not.toHaveBeenCalled();
    expect(legacy.onWillAppear).not.toHaveBeenCalled();
  });
  it("does not reuse an automatic binding after switching to another app", async () => {
    const { legacy, router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "auto",
      commandId: "send",
    });
    await router.onWillAppear(keyEvent(key));
    fake.observation = {};
    await router.onKeyDown(keyEvent(key));
    expect(legacy.onKeyDown).not.toHaveBeenCalled();
    expect(fake.perform).not.toHaveBeenCalled();
    expect(key.calls.some((c) => c.method === "showAlert")).toBe(true);
  });
  it("returns key release to Codex after switching provider", async () => {
    fake.observation.foreground = "codex";
    const { legacy, router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "auto",
      commandId: "dictate",
    });
    await router.onWillAppear(keyEvent(key));
    await router.onKeyDown(keyEvent(key));
    fake.observation.foreground = "claude";
    await router.onKeyUp(keyEvent(key));
    expect(legacy.onKeyUp).toHaveBeenCalledTimes(1);
  });
  it("cancels a model preview when the session changes before press", async () => {
    fake.perform.mockImplementation(async () => ({
      ...fake.observation,
      observedAt: Date.now(),
      options: [
        { value: "Fable 5.1", label: "Fable 5.1" },
        { value: "Sonnet 4.6", label: "Sonnet 4.6" },
      ],
    }));
    const { router } = action("model");
    const dial = new FakeStreamDeckAction({ provider: "auto" }, "dial");
    await router.onWillAppear(keyEvent(dial));
    await router.onDialRotate({
      ...keyEvent(dial),
      payload: { settings: { provider: "auto" }, ticks: 1 },
    });
    fake.observation.target = { ...target, sessionId: "other" };
    await router.onDialUp(keyEvent(dial));
    expect(fake.perform.mock.calls.map((c) => c[0].operation)).toEqual([
      "model-options",
    ]);
  });
  it("excludes Claude keys from legacy refresh and renders a provider badge", async () => {
    const { router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "claude",
      commandId: "send",
    });
    fake.actions.push(key);
    await router.onWillAppear(keyEvent(key));
    await observeProviders();
    await router.refreshAll();
    expect(
      key.calls.filter((c) => c.method === "setTitle" && c.value === "codex"),
    ).toHaveLength(0);
    const image = key.calls.find((c) => c.method === "setImage")!
      .value as string;
    expect(Buffer.from(image.split(",")[1]!, "base64").toString()).toContain(
      ">CLAUDE</text>",
    );
  });
  it("remembers a prior permission mode per exact session for Plan toggle", async () => {
    const { router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "claude",
      commandId: "plan",
    });
    await router.onWillAppear(keyEvent(key));
    await router.onKeyDown(keyEvent(key));
    fake.observation.permission = "Plan";
    await router.onKeyDown(keyEvent(key));
    expect(fake.perform.mock.calls.at(-1)![0].value).toBe("Auto");
    fake.observation.target = { ...target, sessionId: "other" };
    await router.onKeyDown(keyEvent(key));
    expect(fake.perform).toHaveBeenCalledTimes(2);
    // A second press after the new target is rendered cannot restore the old
    // session's permission mode.
    await router.onKeyDown(keyEvent(key));
    expect(fake.perform.mock.calls.at(-1)![0].value).toBeUndefined();
  });
  it("releases Codex PTT with its original settings while a provider read is pending", async () => {
    const { legacy, router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "codex",
      commandId: "dictate",
    });
    await router.onWillAppear(keyEvent(key));
    await router.onKeyDown(keyEvent(key));
    let release!: () => void;
    fake.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ...fake.observation, observedAt: Date.now() });
        }),
    );
    const other = action("model");
    const dial = new FakeStreamDeckAction({ provider: "claude" }, "dial");
    const pending = other.router.onWillAppear(keyEvent(dial));
    await Promise.resolve();
    await Promise.resolve();
    await router.onKeyUp({
      action: key,
      payload: { settings: { provider: "claude", commandId: "send" } },
    });
    expect(legacy.onKeyUp).toHaveBeenCalledTimes(1);
    expect(
      (legacy.onKeyUp.mock.calls[0] as any)[0].payload.settings.commandId,
    ).toBe("dictate");
    release();
    await pending;
  });
  it("does not start automatic PTT after its key was released during target observation", async () => {
    fake.observation.foreground = "codex";
    const { legacy, router } = action("command");
    const key = new FakeStreamDeckAction({
      provider: "auto",
      commandId: "dictate",
    });
    await router.onWillAppear(keyEvent(key));
    let release!: () => void;
    fake.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ...fake.observation, observedAt: Date.now() });
        }),
    );
    const down = router.onKeyDown(keyEvent(key));
    await Promise.resolve();
    await Promise.resolve();
    const up = router.onKeyUp(keyEvent(key));
    release();
    await down;
    await up;
    expect(legacy.onKeyDown).not.toHaveBeenCalled();
  });
});
