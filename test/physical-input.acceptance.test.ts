import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";
import { WORKFLOWS } from "../src/lib/workflows.js";
import { agentKeySvg } from "../src/lib/visuals.js";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function methodBlock(
  contents: string,
  method: string,
  nextMethod: string,
): string {
  return contents.slice(
    contents.indexOf(`async ${method}`),
    contents.indexOf(`async ${nextMethod}`),
  );
}

describe("physical input acceptance", () => {
  it("maps the documented Codex Micro command payloads", () => {
    const byId = Object.fromEntries(
      COMMANDS.map((command) => [command.id, command]),
    );

    expect(byId.accept).toMatchObject({
      mode: "shortcut",
      value: "accept",
    });
    expect(byId.reject).toMatchObject({
      mode: "shortcut",
      value: "reject",
    });
    expect(byId.dictate).toMatchObject({
      mode: "shortcut",
      value: "dictation-down",
    });
    expect(byId["new-chat"]).toMatchObject({
      mode: "deep-link",
      value: "codex://threads/new",
    });
    expect(byId.fast).toMatchObject({
      mode: "mode-toggle",
      value: "fast",
    });
    expect(byId.plan).toMatchObject({
      mode: "mode-toggle",
      value: "plan",
    });
  });

  it("keeps command rotation side-effect free and separates dial press", () => {
    const contents = source("src/actions/command.ts");
    const rotate = methodBlock(contents, "onDialRotate", "onDialDown");
    const down = methodBlock(contents, "onDialDown", "onDialUp");
    const up = methodBlock(contents, "onDialUp", "onTouchTap");

    expect(rotate).not.toContain("this.execute");
    expect(rotate).not.toContain("runControl");
    expect(down).toContain('command.id === "dictate"');
    expect(down).toContain("this.execute");
    expect(up).toContain("endDictation");
    expect(up).toContain("this.execute");
  });

  it("implements held push-to-talk on key and dial without a stuck key", () => {
    const contents = source("src/actions/command.ts");
    const keyDown = methodBlock(contents, "onKeyDown", "onKeyUp");
    const keyUp = methodBlock(contents, "onKeyUp", "private async execute");
    const script = source(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
    );

    expect(keyDown).toContain("this.execute");
    expect(keyUp).toContain("endDictation");
    expect(script).toContain('key down "d"');
    expect(script).toContain('key up "d"');
    expect(script).toContain("key up shift");
    expect(script).toContain("key up control");
  });

  it("focuses a Codex task before dispatching task-scoped commands", () => {
    const automation = source("src/lib/automation.ts");
    const commands = source("src/actions/command.ts");

    expect(commands).toContain("codexStore.controlThread()?.id");
    expect(automation).toContain("if (threadId)");
    expect(automation).toContain("await openThread(threadId)");
    expect(automation.indexOf("await openThread(threadId)")).toBeLessThan(
      automation.indexOf("await runControl(command.mode, command.value)"),
    );
  });

  it("never uses the generic command palette for Plan or Fast", () => {
    const script = source(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
    );
    const automation = source("src/lib/automation.ts");

    expect(script).not.toContain('controlMode is "command-menu"');
    expect(script).not.toContain("Toggle Fast mode");
    expect(script).not.toContain('keystroke "k" using {command down}');
    expect(script).not.toContain("Toggle plan mode");
    expect(automation).toContain('command.mode === "mode-toggle"');
    expect(automation).toContain("toggleLiveMode");
  });

  it("toggles Plan and Fast only through the visible composer adapter", () => {
    const automation = source("src/lib/automation.ts");
    const liveControl = source("src/lib/codex-ui-control.ts");
    const native = source("native/CodexUIControl.swift");
    const command = source("src/actions/command.ts");

    expect(automation).toContain('command.mode === "mode-toggle"');
    expect(liveControl).toContain('invoke("mode-read", mode)');
    expect(liveControl).toContain('invoke("mode-toggle", mode)');
    expect(native).toContain('case "mode-read"');
    expect(native).toContain('case "mode-toggle"');
    expect(native).toContain('try typeCommandAndReturn("/plan")');
    expect(native).toContain("visible composer contains a draft");
    expect(native).toContain("generateaplan");
    expect(native).toContain("composerModeControl");
    expect(native).toContain("Fast mode is unsupported");
    expect(command).toContain('result.active ? "ACTIVE" : "OFF"');
    expect(command).toContain("pickerFailureLabel(error)");
  });

  it("keeps skill rotation local and launches only on press or tap", () => {
    const contents = source("src/actions/workflow.ts");
    const rotate = methodBlock(contents, "onDialRotate", "onDialUp");
    const press = methodBlock(contents, "onDialUp", "onTouchTap");

    expect(rotate).not.toContain("this.launch");
    expect(press).toContain("this.launch");
    expect(WORKFLOWS.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(["pr-review", "debug", "refactor"]),
    );
  });

  it("uses the third encoder for model selection, not duplicate skills", () => {
    const contents = source("src/actions/model.ts");
    const rotate = methodBlock(contents, "onDialRotate", "onDialUp");
    const press = methodBlock(contents, "onDialUp", "onTouchTap");

    expect(rotate).not.toContain("applyModel");
    expect(press).toContain("applyPreview");
  });

  it("pairs every native synthesized input down with an unconditional up", () => {
    const native = source("native/CodexUIControl.swift");

    expect(native).toContain("var postedDown = false");
    expect(native).toContain("defer {");
    expect(native).toContain("up.post(tap: .cghidEventTap)");
    expect(native).toContain("mouseType: .leftMouseDown");
    expect(native).toContain("mouseType: .leftMouseUp");
    expect(native).toContain("keyDown: true");
    expect(native).toContain("keyDown: false");
  });

  it("requires a visible live-picker postcondition before reporting active", () => {
    const model = source("src/actions/model.ts");
    const reasoning = source("src/actions/reasoning.ts");
    const native = source("native/CodexUIControl.swift");

    expect(model).toContain("Live Codex picker retained");
    expect(reasoning).toContain("Live Codex picker retained");
    expect(native).toContain("readPickerState(appElement)");
    expect(native).toContain("Codex still shows");
  });

  it("opens and acknowledges assigned agent keys and handles empty slots", () => {
    const contents = source("src/actions/agent-status.ts");
    const keyDown = methodBlock(contents, "onKeyDown", "refreshAll");

    expect(keyDown).toContain("codexStore.acknowledge");
    expect(keyDown).toContain("openThread");
    expect(keyDown).toContain("openNewChat");
    expect(keyDown).toContain("showAlert");
  });

  it("exposes a visible alert path for every external action family", () => {
    for (const path of [
      "src/actions/agent-status.ts",
      "src/actions/agent-navigator.ts",
      "src/actions/command.ts",
      "src/actions/workflow.ts",
      "src/actions/model.ts",
      "src/actions/reasoning.ts",
    ]) {
      expect(source(path), path).toContain("showAlert");
    }
  });

  it("keeps touch-strip labels static, compact, and meaningful", () => {
    const navigator = source("src/actions/agent-navigator.ts");
    const commands = source("src/actions/command.ts");
    const models = source("src/actions/model.ts");

    expect(navigator).toContain("`SESSION ${index + 1}/${sessions.length}`");
    expect(navigator).toContain("selected.sessionLabel");
    expect(navigator).toContain("codexStore.sessions(8)");
    expect(navigator).toContain('statusIndicator(selected?.status ?? "off")');
    expect(navigator).not.toContain("selected.displayTitle");
    expect(navigator).not.toContain("marqueeText");
    expect(commands).toContain("command.dialLabel ?? command.label");
    expect(commands).not.toContain("marqueeText");
    expect(models).not.toContain("marqueeText");
    expect(
      COMMANDS.map((command) => command.dialLabel ?? command.label).every(
        (label) => label.length <= 7,
      ),
    ).toBe(true);
  });

  it("toggles the usage key without consuming a banked reset", () => {
    const usage = source("src/actions/usage.ts");

    expect(usage).toContain("toggleUsageView(current)");
    expect(usage).toContain("codexStore.usageSnapshot()");
    expect(usage).not.toContain("rateLimitResetCredit/consume");
  });

  it("keeps the Context key read-only and scoped to the focused chat", () => {
    const context = source("src/actions/context.ts");
    const store = source("src/lib/codex-store.ts");

    expect(context).toContain("toggleContextView(current)");
    expect(context).toContain("codexStore.contextSnapshot()");
    expect(context).not.toContain("executeCommand");
    expect(context).not.toContain("openThread");
    expect(store).toContain("focusedThread()");
    expect(store).toContain("if (!activeId) return undefined");
    expect(store).not.toContain(
      "contextSnapshot(): ContextSnapshot | undefined {\n    const now = Date.now();\n    const thread = this.controlThread()",
    );
  });

  it("uses the shared compact session label and marks the active key", () => {
    const svg = agentKeySvg(
      {
        id: "thread",
        rolloutPath: "/tmp/thread.jsonl",
        cwd: "/tmp",
        title: "Work directly in the saved project",
        preview: "",
        recencyAtMs: 1,
        displayTitle: "Work directly in the saved project",
        status: "idle",
        detail: "Idle",
        lastEventAt: 1,
        sessionLabel: "SDCodex",
        sessionIndex: 0,
        isActive: true,
      },
      0,
    );

    expect(svg).toContain(">SDCodex</text>");
    expect(svg).toContain(">NOW</text>");
    expect(svg).not.toContain("Work directly");
  });
});
