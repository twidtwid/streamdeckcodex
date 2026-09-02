import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS, DIAL_COMMANDS } from "../src/lib/commands.js";
import { WORKFLOWS } from "../src/lib/workflows.js";
import { agentKeySvg } from "../src/lib/visuals.js";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

function nativeFixture(action: string, scenario: string): number | null {
  return spawnSync(native, [action, scenario], { encoding: "utf8" }).status;
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
    expect(byId["review-panel"]).toMatchObject({
      mode: "shortcut",
      value: "review-panel",
    });
    expect(byId.browser).toMatchObject({
      mode: "shortcut",
      value: "browser",
    });
    expect(byId.files).toMatchObject({
      mode: "shortcut",
      value: "files",
    });
    expect(byId["side-chat"]).toMatchObject({
      mode: "shortcut",
      value: "side-chat",
    });
  });

  it("PTT uses native composer dictation and retains legacy key-up cleanup only", () => {
    const script = source(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
    );
    const guard = source(
      "com.todd.streamdeckcodex.sdPlugin/scripts/ptt-guard.mjs",
    );

    expect(script).not.toContain("key down");
    expect(script).toContain('key up "d"');
    expect(script).toContain("key up shift");
    expect(script).toContain("key up control");
    expect(guard).toContain('runTargetControl("dictation-start"');
    expect(guard).toContain('runTargetControl("dictation-stop")');
  });

  it("requires compiled visible Plan and Fast transitions", () => {
    for (const scenario of ["plan-on", "plan-off", "fast-changed"]) {
      expect(nativeFixture("--mode-transition-fixture", scenario)).toBe(0);
    }
    for (const scenario of ["draft-present", "unchanged"]) {
      expect(nativeFixture("--mode-transition-fixture", scenario)).toBe(0);
    }
  });

  it("lists supported skill workflows as static catalog policy", () => {
    expect(WORKFLOWS.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(["pr-review", "debug", "refactor"]),
    );
  });

  it("static release guard: native synthesized input always has an unconditional release", () => {
    const native = [
      source("native/Accessibility.swift"),
      source("native/ComposerControls.swift"),
    ].join("\n");

    expect(native).toContain("var postedDown = false");
    expect(native).toContain("defer {");
    expect(native).toContain("up.post(tap: .cghidEventTap)");
    expect(native).toContain("mouseType: .leftMouseDown");
    expect(native).toContain("mouseType: .leftMouseUp");
    expect(native).toContain("keyDown: true");
    expect(native).toContain("keyDown: false");
  });

  it("keeps touch-strip labels compact", () => {
    expect(
      DIAL_COMMANDS.map((command) => command.dialLabel ?? command.label).every(
        (label) => label.length <= 9,
      ),
    ).toBe(true);
    expect(
      DIAL_COMMANDS.map((command) => command.dialLabel ?? command.label),
    ).toEqual([
      "Fast",
      "Plan",
      "Compact",
      "Review",
      "Browser",
      "Files",
      "Side chat",
    ]);
  });

  it("keeps touch-strip taps inert so horizontal swipes cannot execute actions", () => {
    const manifest = JSON.parse(
      source("com.todd.streamdeckcodex.sdPlugin/manifest.json"),
    ) as {
      Actions: Array<{
        Encoder?: { TriggerDescription?: Record<string, string> };
      }>;
    };
    for (const action of manifest.Actions.filter((entry) => entry.Encoder)) {
      expect(action.Encoder?.TriggerDescription).not.toHaveProperty("Touch");
      expect(action.Encoder?.TriggerDescription).not.toHaveProperty(
        "LongTouch",
      );
    }
  });

  it("dispatches four typed workspace shortcuts with a compiled visible transition", () => {
    for (const scenario of ["review-panel", "browser", "files", "side-chat"]) {
      expect(nativeFixture("--workspace-shortcut-fixture", scenario)).toBe(0);
    }
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
