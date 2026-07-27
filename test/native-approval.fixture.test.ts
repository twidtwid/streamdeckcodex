import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

function fixture(
  action: "--approval-mode-fixture" | "--approval-confirmation-fixture",
  expected: string,
  value: string,
): number | null {
  const result = spawnSync(native, [action, expected, value], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result.status;
}

function composerFixture(scenario: string): {
  ok: boolean;
  conversationId?: string;
  rendererWindowId?: string;
  approvalMode?: string;
  pendingInput?: boolean;
  inputTitle?: string;
} {
  const result = spawnSync(native, ["--composer-read-fixture", scenario], {
    encoding: "utf8",
  });
  return JSON.parse(result.stdout) as ReturnType<typeof composerFixture>;
}

describe("native approval-mode fixtures", () => {
  it.each([
    ["ask", "ask"],
    ["approve", "approve"],
    ["yolo", "yolo"],
    ["custom", "custom"],
  ])("returns one exact-focused composer snapshot for %s", (scenario, mode) => {
    expect(composerFixture(scenario)).toMatchObject({
      ok: true,
      conversationId: "task-a",
      rendererWindowId: "renderer-a",
      approvalMode: mode,
    });
  });

  it("keeps pending input usable when the approval control is unavailable", () => {
    expect(composerFixture("pending-without-approval-control")).toMatchObject({
      ok: true,
      pendingInput: true,
      conversationId: "task-a",
      rendererWindowId: "renderer-a",
    });
  });

  it("fails closed for a task-mismatch envelope", () => {
    expect(composerFixture("task-mismatch").ok).toBe(false);
  });

  it.each(["hidden", "frameless", "offwindow", "spatially-unrelated-buttons"])(
    "rejects %s as a pending state",
    (scenario) => {
      expect(composerFixture(scenario)).toMatchObject({
        ok: true,
        pendingInput: false,
      });
    },
  );

  it.each([
    ["owner-title-sibling", "Sibling owner title"],
    ["owner-title-row", "Enclosing row owner"],
  ])("returns the owner title from %s", (scenario, inputTitle) => {
    expect(composerFixture(scenario)).toMatchObject({
      ok: true,
      pendingInput: true,
      inputTitle,
    });
  });

  it("maps a descendant-only permission label with no child frame", () => {
    expect(composerFixture("descendant-yolo")).toMatchObject({
      ok: true,
      approvalMode: "yolo",
    });
  });

  it.each([
    [true, "Awaiting approval", true, false, true],
    [true, "Awaiting permission", true, false, true],
    [false, "Awaiting approval", false, false, true],
    [false, "Awaiting approval", true, true, true],
    [false, "Awaiting approval", true, false, false],
    [false, "Running", true, false, true],
  ])(
    "recognizes a visible pending label without AX selected/focused state",
    (expected, value, hasFrame, hidden, intersectsWindow) => {
      expect(
        spawnSync(
          native,
          [
            "--pending-approval-label-fixture",
            String(expected),
            value,
            String(hasFrame),
            String(hidden),
            String(intersectsWindow),
          ],
          { encoding: "utf8" },
        ).status,
      ).toBe(0);
    },
  );

  it.each([
    ["ask", "Change permissions Ask for approval"],
    ["approve", "Change permissions Approve for me"],
    ["yolo", "Change permissions Full access"],
    ["custom", "Change permissions Custom"],
    ["ask", "Ask"],
    ["approve", "Approve"],
    ["yolo", "YOLO"],
    ["custom", "Custom"],
    ["unknown", "Change permissions"],
  ])("maps the current approval label %s", (expected, value) => {
    expect(fixture("--approval-mode-fixture", expected, value)).toBe(0);
  });

  it("accepts the current Confirm label and the legacy Full Access label", () => {
    expect(fixture("--approval-confirmation-fixture", "true", "Confirm")).toBe(
      0,
    );
    expect(
      fixture("--approval-confirmation-fixture", "true", "Turn on Full Access"),
    ).toBe(0);
    expect(fixture("--approval-confirmation-fixture", "false", "Cancel")).toBe(
      0,
    );
  });
});
