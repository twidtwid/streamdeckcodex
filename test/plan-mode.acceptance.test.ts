import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";
import {
  __liveModeTest,
  pickerFailureLabel,
} from "../src/lib/codex-ui-control.js";
import { commandKeySvg } from "../src/lib/visuals.js";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

function fixture(action: string, scenario: string): number | null {
  return spawnSync(native, [action, scenario], { encoding: "utf8" }).status;
}

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
  });

  it("gives the verified mode transaction its full bounded native budget", async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      action: "mode-toggle",
      mode: "fast",
      active: true,
      message: "fixture",
    });

    await expect(
      __liveModeTest.toggleWithInvoker("fast", "fixture-task", invoke as never),
    ).resolves.toEqual({ mode: "fast", active: true });
    expect(invoke).toHaveBeenCalledWith(
      "mode-toggle",
      "fast",
      12_000,
      "fixture-task",
    );
  });

  it.each(["plan-on", "plan-off", "fast-changed"])(
    "accepts a proved visible transition: %s",
    (scenario) => {
      expect(fixture("--mode-transition-fixture", scenario)).toBe(0);
    },
  );

  it.each(["draft-present", "unchanged"])(
    "fails closed before or after an unproved transition: %s",
    (scenario) => {
      expect(fixture("--mode-transition-fixture", scenario)).toBe(0);
    },
  );

  it("scopes mode controls to the unique composer region", () => {
    expect(fixture("--selector-fixture", "mode-inside")).toBe(0);
    expect(fixture("--selector-fixture", "mode-outside")).toBe(0);
  });

  it("renders symmetric ACTIVE/OFF states and explicit failure labels", () => {
    expect(commandKeySvg("Plan", "#A970FF", "plan", "ACTIVE")).toContain(
      ">ACTIVE</text>",
    );
    expect(commandKeySvg("Plan", "#A970FF", "plan", "OFF")).toContain(
      ">OFF</text>",
    );
    expect(pickerFailureLabel(new Error("draft present"))).toBe("HAS DRAFT");
    expect(pickerFailureLabel(new Error("unsupported mode"))).toBe(
      "UNSUPPORTED",
    );
    expect(pickerFailureLabel(new Error("did not confirm"))).toBe(
      "VERIFY FAIL",
    );
  });
});
