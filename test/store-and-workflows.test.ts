import { describe, expect, it } from "vitest";
import { readableThreadTitle } from "../src/lib/codex-store.js";
import { commandAt, COMMANDS } from "../src/lib/commands.js";
import { workflowAt, WORKFLOWS } from "../src/lib/workflows.js";

describe("thread display", () => {
  it("extracts concise text from delegated input markup", () => {
    expect(
      readableThreadTitle({
        title:
          "<codex_delegation><input>Fix the dashboard now</input></codex_delegation>",
        preview: "",
      }),
    ).toBe("Fix the dashboard now");
  });
});

describe("rotary selections", () => {
  it("wraps commands in both directions", () => {
    expect(commandAt(COMMANDS.length).id).toBe(COMMANDS[0]!.id);
    expect(commandAt(-1).id).toBe(COMMANDS.at(-1)!.id);
  });

  it("wraps workflows in both directions", () => {
    expect(workflowAt(WORKFLOWS.length).id).toBe(WORKFLOWS[0]!.id);
    expect(workflowAt(-1).id).toBe(WORKFLOWS.at(-1)!.id);
  });
});
