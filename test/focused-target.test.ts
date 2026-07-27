import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseActiveDesktopWitness } from "../src/lib/desktop-active.js";
import { executeCommand } from "../src/lib/automation.js";
import { COMMANDS } from "../src/lib/commands.js";

const taskA = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
const taskB = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";

function witnessLine(task: string, rendererWindowId: string): string {
  return `thread_stream_view_activity_changed active=true conversationId=${task} rendererWindowId=${rendererWindowId} rendererWindowAppearance=primary rendererWindowFocused=true`;
}

describe("focused target witness", () => {
  it("rejects events without a renderer-window identity", () => {
    expect(
      parseActiveDesktopWitness(
        `thread_stream_view_activity_changed active=true conversationId=${taskA} rendererWindowAppearance=primary rendererWindowFocused=true`,
      ),
    ).toBeUndefined();
  });

  it("refuses a generic shortcut mutation before any external dispatch without a target", async () => {
    const accept = COMMANDS.find(({ id }) => id === "accept");
    expect(accept).toBeDefined();
    await expect(executeCommand(accept!)).rejects.toThrow(
      "No focused Codex task is available.",
    );
  });

  it("captures current-task mutations without deep-link navigation", () => {
    const native = readFileSync("native/CodexUIControl.swift", "utf8");
    expect(native).toContain("let currentTaskActions = Set([");
    expect(native).toContain("target = try captureCurrentCodex(");
    expect(native).toContain('let navigationActions = Set(["target-check"])');
    expect(native).toContain("for path in desktopLogFiles()");
    expect(native).toContain("desktopLogFiles().contains(expected.path)");
    expect(native).toContain("kAXFocusedWindowAttribute as CFString");
    expect(native).toContain(
      "windows.contains(where: { sameElement($0, focusedWindow) })",
    );
    expect(native).toContain("func focusedCodexWindow(");
    expect(native).toContain("activate: true");
    expect(native).not.toContain("after == before");
    expect(native).not.toContain("desktopLogFiles().first == expected.path");
    expect(native).not.toContain(
      'let target = action == "read" || action == "target-verify"',
    );
  });
});
