import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";

const source = (path: string): string => readFileSync(path, "utf8");

describe("active-chat mode acceptance", () => {
  it("routes Plan and Fast through the shared native mode adapter", () => {
    expect(COMMANDS.find((command) => command.id === "plan")).toMatchObject({
      mode: "mode-toggle",
      value: "plan",
    });
    expect(COMMANDS.find((command) => command.id === "fast")).toMatchObject({
      mode: "mode-toggle",
      value: "fast",
    });
    expect(source("src/lib/commands.ts")).not.toContain("Toggle plan mode");
    expect(
      source(
        "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
      ),
    ).not.toContain("Toggle plan mode");
  });

  it("reads, toggles, and verifies both directions in the visible composer", () => {
    const native = source("native/CodexUIControl.swift");
    const toggle = native.slice(
      native.indexOf("func toggleMode"),
      native.indexOf("func applySelection"),
    );

    expect(toggle).toContain("let current = try readMode");
    expect(toggle).toContain("let requestedState = !current");
    expect(toggle).toContain("waitUntil");
    expect(toggle).toContain("== requestedState");
    expect(toggle).toContain("did not confirm");
  });

  it("scopes mode controls to the composer and preserves drafts", () => {
    const native = source("native/CodexUIControl.swift");
    const mode = native.slice(
      native.indexOf("func composerModeControl"),
      native.indexOf("func applySelection"),
    );

    expect(mode).toContain("region.intersects(elementFrame)");
    expect(mode).toContain("composerDraft(composer).isEmpty");
    expect(mode.indexOf("composerDraft(composer).isEmpty")).toBeLessThan(
      mode.indexOf('try typeCommandAndReturn("/plan")'),
    );
    expect(mode).toContain("generateaplan");
    expect(mode).toContain("Fast mode is unsupported");
  });

  it("exposes symmetric ACTIVE/OFF and explicit failure feedback", () => {
    const command = source("src/actions/command.ts");
    const liveControl = source("src/lib/codex-ui-control.ts");

    expect(command).toContain('result.active ? "ACTIVE" : "OFF"');
    expect(command).toContain('result.active ? "#35C759" : "#8B949E"');
    expect(command).toContain('bar_fill_c: "#FF453A"');
    expect(liveControl).toContain('return "HAS DRAFT"');
    expect(liveControl).toContain('return "UNSUPPORTED"');
    expect(liveControl).toContain('return "VERIFY FAIL"');
  });
});
