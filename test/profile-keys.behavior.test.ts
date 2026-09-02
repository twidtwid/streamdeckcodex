import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeStreamDeckAction,
  keyDown,
  keyUp,
} from "./helpers/fake-streamdeck-action.js";
import {
  PROFILE_KEY_CONTRACT,
  assertProfileContract,
  type ProfileKeyContract,
} from "./helpers/profile-key-contract.js";

const harness = vi.hoisted(() => {
  const state = { approvalMode: "yolo" };
  return {
    state,
    registrations: [] as unknown[],
    executeCommand: vi.fn(async () => undefined),
    launchWorkflow: vi.fn(async () => undefined),
    openNewChat: vi.fn(async () => undefined),
    openNewProject: vi.fn(async () => undefined),
    openSkills: vi.fn(async () => undefined),
    openThread: vi.fn(async () => undefined),
    startDictation: vi.fn(async () => undefined),
    endDictation: vi.fn(async () => undefined),
    cleanupDictation: vi.fn(async () => ({
      ok: true,
      released: false,
      record: {
        sequence: 1,
        action: "push-to-talk",
        phase: "release",
        reason: "action-disappear",
        result: "not-held",
      },
    })),
    store: {
      acknowledge: vi.fn(),
      close: vi.fn(),
      contextSnapshot: vi.fn(() => ({
        remainingPercent: 60,
        totalTokens: 1000,
      })),
      contextAvailability: vi.fn(() => ({
        state: "ready",
        value: { remainingPercent: 60 },
        observedAt: 1,
      })),
      focusedThread: vi.fn<() => { id: string; cwd: string } | undefined>(
        () => ({
          id: "thread-1",
          cwd: "/tmp/project",
        }),
      ),
      latestThread: vi.fn(() => ({ cwd: "/tmp/project" })),
      sessions: vi.fn<() => unknown[]>(() => []),
      refreshLiveComposer: vi.fn(async () => undefined),
      liveComposerState: vi.fn(() => ({ approvalMode: state.approvalMode })),
      liveComposerAvailability: vi.fn(() => ({
        state: "ready",
        value: {
          approvalMode: state.approvalMode,
          conversationId: "thread-1",
          rendererWindowId: "window-1",
          pendingInput: false,
        },
        observedAt: 1,
      })),
      permissionAvailability: vi.fn(() => ({
        state: "ready",
        value: state.approvalMode,
        observedAt: 1,
      })),
      cycleLiveComposerApprovalMode: vi.fn(async () => {
        const modes = ["ask", "approve", "yolo", "custom"] as const;
        const index = modes.indexOf(
          state.approvalMode as (typeof modes)[number],
        );
        const mode = modes[(index + 1) % modes.length] ?? "ask";
        state.approvalMode = mode;
        return mode;
      }),
      usageSnapshot: vi.fn(async () => ({
        weekly: { usedPercent: 20 },
        fiveHour: { usedPercent: 10 },
      })),
      modelSnapshot: vi.fn(() => ({ current: "", options: [] })),
      modelAvailability: vi.fn(() => ({
        state: "unavailable",
        reason: "unsupported-schema",
        observedAt: 1,
      })),
      reasoningSnapshot: vi.fn(() => ({ current: "medium", levels: [] })),
      reasoningAvailability: vi.fn(() => ({
        state: "unavailable",
        reason: "unsupported-schema",
        observedAt: 1,
      })),
      usageAvailability: vi.fn(async () => ({
        state: "ready",
        value: { usedPercent: 20, observedAt: 1 },
        observedAt: 1,
      })),
    },
  };
});

vi.mock("../src/lib/automation.js", () => ({
  cleanupDictation: harness.cleanupDictation,
  endDictation: harness.endDictation,
  executeCommand: harness.executeCommand,
  launchWorkflow: harness.launchWorkflow,
  openNewChat: harness.openNewChat,
  openNewProject: harness.openNewProject,
  openSkills: harness.openSkills,
  openThread: harness.openThread,
  releaseSynthesizedKeysSync: vi.fn(),
  inputReleaseSnapshot: vi.fn(() => ({ held: false })),
  startDictation: harness.startDictation,
}));
vi.mock("../src/lib/codex-store.js", () => ({ codexStore: harness.store }));
vi.mock("../src/lib/codex-ui-control.js", () => ({
  pickerFailureLabel: () => "FAILED",
}));
vi.mock("@elgato/streamdeck", () => ({
  action: () => () => undefined,
  DeviceType: { StreamDeckPlus: "plus" },
  default: {
    actions: {
      registerAction: (handler: unknown) => harness.registrations.push(handler),
    },
    connect: vi.fn(async () => undefined),
    devices: [],
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      setLevel: vi.fn(),
      warn: vi.fn(),
    },
    profiles: { switchToProfile: vi.fn(async () => undefined) },
    settings: {
      getGlobalSettings: vi.fn(async () => ({})),
      setGlobalSettings: vi.fn(async () => undefined),
    },
  },
  SingletonAction: class {
    readonly actions = [];
  },
}));
vi.mock("../src/lib/refresh-coordinator.js", () => ({
  createRefreshCoordinator: () => ({
    runNow: vi.fn(async () => undefined),
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

import { AgentStatusAction } from "../src/actions/agent-status.js";
import { ApprovalModeAction } from "../src/actions/approval-mode.js";
import { CommandAction } from "../src/actions/command.js";
import { ContextAction } from "../src/actions/context.js";
import { KeycapAction } from "../src/actions/keycap.js";
import { UsageAction } from "../src/actions/usage.js";
import { COMMANDS } from "../src/lib/commands.js";
import { KEYCAP_WORKFLOWS } from "../src/lib/keycap-workflows.js";

function actionFor(row: ProfileKeyContract) {
  switch (row.behavior) {
    case "agent":
      return new AgentStatusAction();
    case "approval":
      return new ApprovalModeAction();
    case "command":
      return new CommandAction();
    case "context":
      return new ContextAction();
    case "keycap":
      return new KeycapAction();
    case "usage":
      return new UsageAction();
  }
}

describe("executable 50-key profile contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.state.approvalMode = "yolo";
    harness.store.refreshLiveComposer.mockImplementation(async () => undefined);
    harness.store.liveComposerState.mockImplementation(() => ({
      approvalMode: harness.state.approvalMode,
    }));
    harness.store.cycleLiveComposerApprovalMode.mockImplementation(async () => {
      const modes = ["ask", "approve", "yolo", "custom"] as const;
      const index = modes.indexOf(
        harness.state.approvalMode as (typeof modes)[number],
      );
      const mode = modes[(index + 1) % modes.length] ?? "ask";
      harness.state.approvalMode = mode;
      return mode;
    });
    harness.store.focusedThread.mockReturnValue({
      id: "thread-1",
      cwd: "/tmp/project",
    });
    harness.store.sessions.mockReturnValue(
      Array.from({ length: 8 }, (_, index) => ({
        completedAt: 0,
        id: `agent-${index + 1}`,
        cwd: `/tmp/agent-${index + 1}`,
        detail: "waiting",
        displayTitle: `Agent ${index + 1}`,
        isActive: false,
        lastEventAt: 0,
        preview: "waiting",
        recencyAtMs: 0,
        rolloutPath: "/tmp/rollout.jsonl",
        sessionIndex: index,
        sessionLabel: `Agent ${index + 1}`,
        status: "idle",
        title: `Agent ${index + 1}`,
      })),
    );
    harness.store.cycleLiveComposerApprovalMode.mockImplementation(async () => {
      const modes = ["ask", "approve", "yolo", "custom"] as const;
      const index = modes.indexOf(
        harness.state.approvalMode as (typeof modes)[number],
      );
      const mode = modes[(index + 1) % modes.length] ?? "ask";
      harness.state.approvalMode = mode;
      return mode;
    });
  });

  it("matches every literal contract row to the seven-page profile", () => {
    assertProfileContract();
  });

  it("does not poll static keycaps but still renders them when they appear", async () => {
    const { refresh } = await import("../src/plugin.js");
    const keycap = harness.registrations.find(
      (handler) => handler instanceof KeycapAction,
    ) as KeycapAction;
    const action = new FakeStreamDeckAction({
      label: "Static",
      description: "KEY",
      icon: "command",
    });
    await keycap.onWillAppear(keyDown(action) as never);
    expect(action.calls.map(({ method }) => method)).toEqual([
      "getSettings",
      "setImage",
      "setTitle",
    ]);

    action.calls.splice(0);
    (keycap as unknown as { actions: unknown[] }).actions.push(action);
    await refresh();
    await refresh();
    expect(action.calls).toEqual([]);
  });

  it("deduplicates unchanged live action transports and sends status changes", async () => {
    const action = new FakeStreamDeckAction({ slot: 1 });
    const handler = new AgentStatusAction();
    const snapshot = {
      id: "agent-1",
      cwd: "/tmp/agent-1",
      displayTitle: "Agent 1",
      isActive: false,
      lastEventAt: 0,
      preview: "waiting",
      recencyAtMs: 0,
      rolloutPath: "/tmp/rollout.jsonl",
      sessionIndex: 0,
      sessionLabel: "Agent 1",
      status: "idle" as const,
      title: "Agent 1",
    };
    harness.store.sessions.mockReturnValue([snapshot]);
    (handler as unknown as { actions: unknown[] }).actions.push(action);

    await handler.refreshAll();
    await handler.refreshAll();
    harness.store.sessions.mockReturnValue([
      { ...snapshot, status: "running" },
    ]);
    await handler.refreshAll();

    expect(
      action.calls.filter(({ method }) => method === "setImage"),
    ).toHaveLength(2);
    expect(
      action.calls.filter(({ method }) => method === "setTitle"),
    ).toHaveLength(1);
  });

  it("records an exact success boundary call and success feedback", async () => {
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.behavior === "approval",
    )!;
    const action = new FakeStreamDeckAction(row.settings);
    await new ApprovalModeAction().onKeyDown(keyDown(action) as never);

    expect(harness.store.cycleLiveComposerApprovalMode).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.store.refreshLiveComposer).not.toHaveBeenCalled();
    expect(action.calls).toContainEqual({
      method: "setSettings",
      value: { mode: "custom" },
    });
    expect(action.calls.map(({ method }) => method)).toContain("showOk");
    expect(action.calls.map(({ method }) => method)).not.toContain("showAlert");
  });

  it("records a rejected boundary as alert-only, never false success", async () => {
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.behavior === "approval",
    )!;
    harness.store.cycleLiveComposerApprovalMode.mockRejectedValueOnce(
      new Error("denied"),
    );
    const action = new FakeStreamDeckAction(row.settings);
    await new ApprovalModeAction().onKeyDown(keyDown(action) as never);

    expect(harness.store.cycleLiveComposerApprovalMode).toHaveBeenCalledTimes(
      1,
    );
    expect(action.calls.map(({ method }) => method)).toContain("showAlert");
    expect(action.calls.map(({ method }) => method)).not.toContain("showOk");
  });

  it("uses one focused store cycle without a separate action reader", async () => {
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.behavior === "approval",
    )!;
    const action = new FakeStreamDeckAction(row.settings);
    await new ApprovalModeAction().onKeyDown(keyDown(action) as never);

    expect(harness.store.cycleLiveComposerApprovalMode).toHaveBeenCalledTimes(
      1,
    );
    expect(action.calls.map(({ method }) => method)).toContain("showOk");
    expect(action.calls.map(({ method }) => method)).not.toContain("showAlert");
  });

  it("alerts when the focused cycle fails", async () => {
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.behavior === "approval",
    )!;
    harness.store.cycleLiveComposerApprovalMode.mockRejectedValueOnce(
      new Error("TARGET_MISMATCH"),
    );
    const action = new FakeStreamDeckAction(row.settings);
    await new ApprovalModeAction().onKeyDown(keyDown(action) as never);

    expect(action.calls.map(({ method }) => method)).toContain("showAlert");
    expect(action.calls.map(({ method }) => method)).not.toContain("showOk");
  });

  it.each(PROFILE_KEY_CONTRACT)(
    "invokes Page $page / $position / $label through its real keypad handler",
    async (row) => {
      const action = new FakeStreamDeckAction(row.settings);
      const handler = actionFor(row);
      await handler.onKeyDown(keyDown(action) as never);

      expect(action.calls.map(({ method }) => method)).not.toContain(
        "showAlert",
      );
      if (row.behavior === "agent") {
        const slot = Number(row.settings.slot);
        expect(harness.store.acknowledge).toHaveBeenCalledWith(`agent-${slot}`);
        expect(harness.openThread).toHaveBeenCalledWith(`agent-${slot}`);
        expect(harness.openNewChat).not.toHaveBeenCalled();
      } else if (row.behavior === "approval") {
        expect(harness.store.cycleLiveComposerApprovalMode).toHaveBeenCalled();
        expect(action.calls.map(({ method }) => method)).toContain("showOk");
      } else if (row.behavior === "usage" || row.behavior === "context") {
        expect(action.calls.map(({ method }) => method)).toContain("setImage");
      } else if (row.behavior === "command") {
        if (row.settings.commandId === "dictate") {
          expect(harness.startDictation).toHaveBeenCalledWith("thread-1");
          await (handler as CommandAction).onKeyUp(keyUp(action) as never);
          expect(harness.endDictation).toHaveBeenCalledOnce();
        } else {
          const command = COMMANDS.find(
            ({ id }) => id === row.settings.commandId,
          )!;
          const args =
            row.settings.commandId === "new-chat"
              ? [command]
              : [command, "thread-1"];
          expect(harness.executeCommand).toHaveBeenCalledWith(...args);
          expect(action.calls.map(({ method }) => method)).toContain("showOk");
        }
      } else if (row.settings.action === "new-project") {
        expect(harness.openNewProject).toHaveBeenCalledOnce();
      } else if (row.settings.action === "skills") {
        expect(harness.openSkills).toHaveBeenCalledOnce();
      } else if (String(row.settings.action).startsWith("workflow:")) {
        const workflow = KEYCAP_WORKFLOWS.find(
          ({ id }) => id === String(row.settings.action).slice(9),
        )!;
        expect(harness.launchWorkflow).toHaveBeenCalledWith(
          workflow,
          "thread-1",
          "/tmp/project",
        );
      } else if (String(row.settings.action).startsWith("command:")) {
        const command = COMMANDS.find(
          ({ id }) => id === String(row.settings.action).slice(8),
        )!;
        expect(harness.executeCommand).toHaveBeenCalledWith(
          command,
          "thread-1",
        );
      }
    },
  );

  it("uses keypad keyDown, not dial events, for Plan Mode and FAST", async () => {
    for (const commandId of ["plan", "fast"]) {
      const row = PROFILE_KEY_CONTRACT.find(
        (candidate) => candidate.settings.commandId === commandId,
      )!;
      const action = new FakeStreamDeckAction(row.settings);
      await new CommandAction().onKeyDown(keyDown(action) as never);
      expect(action.isKey()).toBe(true);
      expect(harness.executeCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: commandId }),
        "thread-1",
      );
    }
  });

  it("alerts on post-dispatch failure for every mutating key family", async () => {
    const cases = [
      {
        label: "Agent 1",
        reject: () =>
          harness.openThread.mockRejectedValueOnce(new Error("open")),
        called: () =>
          expect(harness.openThread).toHaveBeenCalledWith("agent-1"),
      },
      {
        label: "Plan Mode",
        reject: () =>
          harness.executeCommand.mockRejectedValueOnce(new Error("command")),
        called: () =>
          expect(harness.executeCommand).toHaveBeenCalledWith(
            COMMANDS.find(({ id }) => id === "plan"),
            "thread-1",
          ),
      },
      {
        label: "Permissions",
        reject: () =>
          harness.store.cycleLiveComposerApprovalMode.mockRejectedValueOnce(
            new Error("approval"),
          ),
        called: () =>
          expect(
            harness.store.cycleLiveComposerApprovalMode,
          ).toHaveBeenCalled(),
      },
      {
        label: "Branch info",
        reject: () =>
          harness.launchWorkflow.mockRejectedValueOnce(new Error("workflow")),
        called: () =>
          expect(harness.launchWorkflow).toHaveBeenCalledWith(
            KEYCAP_WORKFLOWS.find(({ id }) => id === "branch"),
            "thread-1",
            "/tmp/project",
          ),
      },
      {
        label: "New project",
        reject: () =>
          harness.openNewProject.mockRejectedValueOnce(new Error("project")),
        called: () => expect(harness.openNewProject).toHaveBeenCalledOnce(),
      },
      {
        label: "Skills",
        reject: () =>
          harness.openSkills.mockRejectedValueOnce(new Error("skills")),
        called: () => expect(harness.openSkills).toHaveBeenCalledOnce(),
      },
    ];

    for (const scenario of cases) {
      vi.clearAllMocks();
      harness.store.focusedThread.mockReturnValue({
        id: "thread-1",
        cwd: "/tmp/project",
      });
      harness.store.sessions.mockReturnValue(
        Array.from({ length: 8 }, (_, index) => ({
          id: `agent-${index + 1}`,
          cwd: `/tmp/agent-${index + 1}`,
          displayTitle: `Agent ${index + 1}`,
          isActive: false,
          lastEventAt: 0,
          preview: "waiting",
          recencyAtMs: 0,
          rolloutPath: "/tmp/rollout.jsonl",
          sessionIndex: index,
          sessionLabel: `Agent ${index + 1}`,
          status: "idle",
          title: `Agent ${index + 1}`,
        })),
      );
      harness.store.liveComposerState.mockReturnValue({ approvalMode: "yolo" });
      scenario.reject();
      const row = PROFILE_KEY_CONTRACT.find(
        (candidate) => candidate.label === scenario.label,
      )!;
      const action = new FakeStreamDeckAction(row.settings);
      await actionFor(row).onKeyDown(keyDown(action) as never);

      scenario.called();
      expect(action.calls.map(({ method }) => method)).toContain("showAlert");
      expect(action.calls.map(({ method }) => method)).not.toContain("showOk");
      expect(action.calls.map(({ method }) => method)).not.toContain(
        "setSettings",
      );
    }
  });

  it("cleans up PTT on key-up even when key-down dispatch fails", async () => {
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.settings.commandId === "dictate",
    )!;
    harness.startDictation.mockRejectedValueOnce(
      new Error("microphone failed"),
    );
    harness.endDictation.mockRejectedValueOnce(new Error("release failed"));
    const action = new FakeStreamDeckAction(row.settings);
    const handler = new CommandAction();
    await handler.onKeyDown(keyDown(action) as never);
    await handler.onKeyUp(keyUp(action) as never);

    expect(harness.startDictation).toHaveBeenCalledWith("thread-1");
    expect(harness.endDictation).toHaveBeenCalledOnce();
    expect(action.calls.map(({ method }) => method)).toEqual([
      "showAlert",
      "showAlert",
    ]);
  });

  it.each(PROFILE_KEY_CONTRACT.filter((row) => row.behavior === "agent"))(
    "opens the exact assigned task for Agent $settings.slot",
    async (row) => {
      const action = new FakeStreamDeckAction(row.settings);
      await new AgentStatusAction().onKeyDown(keyDown(action) as never);
      const slot = Number(row.settings.slot);
      expect(harness.openNewChat).not.toHaveBeenCalled();
      expect(harness.store.acknowledge).toHaveBeenCalledWith(`agent-${slot}`);
      expect(harness.openThread).toHaveBeenCalledWith(`agent-${slot}`);
    },
  );

  it("opens New Chat from the latest project only when an Agent slot is empty", async () => {
    harness.store.sessions.mockReturnValue([]);
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.label === "Agent 1",
    )!;
    const action = new FakeStreamDeckAction(row.settings);
    await new AgentStatusAction().onKeyDown(keyDown(action) as never);
    expect(harness.openNewChat).toHaveBeenCalledWith("/tmp/project");
    expect(harness.store.acknowledge).not.toHaveBeenCalled();
  });

  it("cycles Permissions through ASK, APPROVE, YOLO, CUSTOM, and ASK", async () => {
    harness.state.approvalMode = "ask";
    const row = PROFILE_KEY_CONTRACT.find(
      (candidate) => candidate.behavior === "approval",
    )!;
    const handler = new ApprovalModeAction();
    for (const expected of ["approve", "yolo", "custom", "ask"]) {
      await handler.onKeyDown(
        keyDown(new FakeStreamDeckAction(row.settings)) as never,
      );
      expect(harness.state.approvalMode).toBe(expected);
      expect(harness.store.cycleLiveComposerApprovalMode).toHaveBeenCalled();
    }
  });

  it("renders Permissions NO CHAT without focus and ignores stale saved state", async () => {
    harness.store.focusedThread.mockReturnValue(undefined);
    const action = new FakeStreamDeckAction({ mode: "yolo" });
    await new ApprovalModeAction().onWillAppear(keyDown(action) as never);
    const image = action.calls.find(({ method }) => method === "setImage")
      ?.value as string;
    expect(
      Buffer.from(image.split(",")[1]!, "base64").toString("utf8"),
    ).toContain("No Chat");
    expect(harness.store.refreshLiveComposer).not.toHaveBeenCalled();
  });

  it("uses the live external Permissions state and single-flights concurrent reads", async () => {
    let resolveRead!: () => void;
    const read = new Promise<undefined>((resolve) => {
      resolveRead = () => resolve(undefined);
    });
    harness.store.refreshLiveComposer.mockImplementation(() => read);
    const handler = new ApprovalModeAction();
    const first = new FakeStreamDeckAction({ mode: "yolo" });
    const second = new FakeStreamDeckAction({ mode: "ask" });
    const pending = Promise.all([
      handler.onWillAppear(keyDown(first) as never),
      handler.onWillAppear(keyDown(second) as never),
    ]);
    await Promise.resolve();
    expect(harness.store.refreshLiveComposer).toHaveBeenCalledTimes(2);
    harness.state.approvalMode = "approve";
    resolveRead();
    await pending;
    for (const action of [first, second]) {
      const image = action.calls
        .filter(({ method }) => method === "setImage")
        .at(-1)?.value as string;
      expect(
        Buffer.from(image.split(",")[1]!, "base64").toString("utf8"),
      ).toContain("Approve");
    }
  });

  it("does not let a pre-confirmation Permissions refresh overwrite the applied state", async () => {
    let resolveStale!: () => void;
    harness.store.refreshLiveComposer
      .mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            resolveStale = () => resolve(undefined);
          }),
      )
      .mockResolvedValueOnce(undefined);
    const handler = new ApprovalModeAction();
    const action = new FakeStreamDeckAction({ mode: "yolo" });
    const staleRefresh = handler.onWillAppear(keyDown(action) as never);
    await Promise.resolve();

    await handler.onKeyDown(keyDown(action) as never);
    resolveStale();
    await staleRefresh;

    const images = action.calls
      .filter(({ method }) => method === "setImage")
      .map(({ value }) =>
        Buffer.from(String(value).split(",")[1]!, "base64").toString("utf8"),
      );
    expect(images.at(-1)).toContain(">Custom</text>");
    expect(images.at(-1)).not.toContain(">Ask</text>");
  });

  it.each([
    ["Quota", UsageAction],
    ["Context", ContextAction],
  ] as const)(
    "toggles %s statefully and returns to its first view after two keypad presses",
    async (label, ActionClass) => {
      const row = PROFILE_KEY_CONTRACT.find(
        (candidate) => candidate.label === label,
      )!;
      const action = new FakeStreamDeckAction(row.settings);
      const handler = new ActionClass();
      await handler.onWillAppear(keyDown(action) as never);
      await handler.onKeyDown(keyDown(action) as never);
      await handler.onKeyDown(keyDown(action) as never);
      const images = action.calls
        .filter(({ method }) => method === "setImage")
        .map(({ value }) => value);
      expect(images).toHaveLength(3);
      expect(images[0]).not.toBe(images[1]);
      expect(images[2]).toBe(images[0]);
    },
  );

  it.each(PROFILE_KEY_CONTRACT.filter((row) => row.target === "focused"))(
    "rejects $label with no focused task and does not dispatch",
    async (row) => {
      harness.store.focusedThread.mockReturnValue(undefined);
      const action = new FakeStreamDeckAction(row.settings);
      const handler = actionFor(row);
      await handler.onKeyDown(keyDown(action) as never);
      expect(action.calls.map(({ method }) => method)).toContain("showAlert");
      expect(harness.executeCommand).not.toHaveBeenCalled();
      expect(harness.launchWorkflow).not.toHaveBeenCalled();
      expect(harness.startDictation).not.toHaveBeenCalled();
      expect(
        harness.store.cycleLiveComposerApprovalMode,
      ).not.toHaveBeenCalled();
    },
  );
});
