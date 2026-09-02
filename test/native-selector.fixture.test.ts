import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

type FixtureAction =
  | "--composer-draft-fixture"
  | "--composer-witness-argument-fixture"
  | "--selector-fixture"
  | "--transaction-fixture"
  | "--mode-transition-fixture"
  | "--picker-selection-fixture"
  | "--picker-label-fixture"
  | "--picker-wait-fixture"
  | "--ultra-confirmation-fixture"
  | "--power-fixture"
  | "--approval-cycle-fixture"
  | "--workspace-shortcut-fixture";

function run(action: FixtureAction, scenario: string) {
  const result = spawnSync(native, [action, scenario], { encoding: "utf8" });
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: JSON.parse(result.stdout) as {
      ok: boolean;
      message: string;
    },
  };
}

describe("native single-pass AX selectors", () => {
  it.each([
    "one-composer",
    "composer-visible",
    "zero-composers",
    "two-composers",
    "two-visible-composers",
    "composer-hidden-ancestor",
    "composer-offwindow",
    "permission-inside",
    "permission-outside",
    "permission-hidden-ancestor",
    "permission-offwindow",
    "mode-inside",
    "mode-outside",
    "mode-hidden-ancestor",
    "mode-offwindow",
  ])("selects composer-owned controls fail-closed: %s", (scenario) => {
    expect(run("--selector-fixture", scenario).status).toBe(0);
  });

  it.each([
    "confirmation-valid",
    "confirmation-nested",
    "confirmation-ambiguous",
    "confirmation-sibling-unequal",
    "confirmation-missing-cancel",
    "confirmation-hidden",
    "confirmation-offwindow",
    "confirmation-off-owner-button",
    "confirmation-descendant-labels",
    "confirmation-descendant-hidden-label",
    "confirmation-descendant-off-owner-child",
    "confirmation-descendant-off-owner-button",
    "confirmation-descendant-duplicate-confirm",
  ])("requires a unique smallest Confirm + Cancel owner: %s", (scenario) => {
    expect(run("--selector-fixture", scenario).status).toBe(0);
  });

  it.each([
    "add-project",
    "add-project-sidebar",
    "add-project-unrelated",
    "add-project-sibling-unequal",
    "add-project-hidden",
    "add-project-offwindow",
  ])("distinguishes Add Project presentation ownership: %s", (scenario) => {
    expect(run("--selector-fixture", scenario).status).toBe(0);
  });

  it("structurally rejects a second capture in the selector poll", () => {
    const result = run("--selector-fixture", "single-snapshot");
    expect(result.status).toBe(0);
    expect(result.output.message).toBe(
      "selector fixture rejected a second capture",
    );
  });

  it("rejects a second capture in the same selector poll", () => {
    expect(run("--selector-fixture", "double-snapshot").status).toBe(0);
  });
});

describe("native compiled action decisions", () => {
  it.each(["missing", "empty-placeholder", "encoded-witness"])(
    "distinguishes a fresh composer capture from witness reuse: %s",
    (scenario) => {
      expect(run("--composer-witness-argument-fixture", scenario).status).toBe(
        0,
      );
    },
  );

  it.each([
    "chromium-placeholder",
    "chatgpt-placeholder",
    "current-codex-placeholder",
    "plan-placeholder",
    "description-placeholder",
    "real-draft",
    "placeholder-with-draft",
  ])(
    "preserves drafts while recognizing Codex's empty placeholder: %s",
    (scenario) => {
      expect(run("--composer-draft-fixture", scenario).status).toBe(0);
    },
  );

  it.each([
    "plan-on",
    "plan-off",
    "fast-changed",
    "draft-present",
    "unchanged",
  ])("requires a visible Plan/Fast transition: %s", (scenario) => {
    expect(run("--mode-transition-fixture", scenario).status).toBe(0);
  });

  it.each(["model-confirmed", "reasoning-confirmed", "model-unchanged"])(
    "requires the requested live picker postcondition: %s",
    (scenario) => {
      expect(run("--picker-selection-fixture", scenario).status).toBe(0);
    },
  );

  it.each(["versioned-model", "annotated-ultra", "unrelated"])(
    "matches current picker labels without accepting unrelated values: %s",
    (scenario) => {
      expect(run("--picker-label-fixture", scenario).status).toBe(0);
    },
  );

  it.each([
    "valid",
    "spatial-siblings",
    "missing-full-access",
    "duplicate-continue",
  ])("selects only the bounded Ultra Continue confirmation: %s", (scenario) => {
    expect(run("--ultra-confirmation-fixture", scenario).status).toBe(0);
  });

  it.each([
    "selection-delayed",
    "selection-unchanged",
    "fast-delayed",
    "fast-unavailable",
  ])("waits for bounded picker state without inventing it: %s", (scenario) => {
    expect(run("--picker-wait-fixture", scenario).status).toBe(0);
  });

  it.each(["review-panel", "browser", "files", "side-chat"])(
    "uses the typed native workspace shortcut registry: %s",
    (scenario) => {
      expect(run("--workspace-shortcut-fixture", scenario).status).toBe(0);
    },
  );
});

describe("native exact-target transaction", () => {
  it.each([
    "valid",
    "workspace-frontmost",
    "preflight-changed",
    "postflight-changed",
    "wrong-order",
    "duplicate-operation",
  ])("enforces preflight, operation, postflight ordering: %s", (scenario) => {
    expect(run("--transaction-fixture", scenario).status).toBe(0);
  });
});

describe("native Add Project ownership", () => {
  it.each(["add-project-owned", "add-project-sibling-window"])(
    "accepts only retained-window ownership: %s",
    (scenario) => {
      expect(run("--selector-fixture", scenario).status).toBe(0);
    },
  );
});

describe("native picker ladder and approval cycle", () => {
  it("reads the picker title and maps effort to Power segments", () => {
    for (const scenario of [
      "title-medium",
      "title-extra-high",
      "title-light",
      "title-unreadable",
      "readout",
      "step",
    ]) {
      expect(run("--power-fixture", scenario).status, scenario).toBe(0);
    }
  });

  it("cycles only through the approval modes Codex offers", () => {
    for (const scenario of [
      "three-modes",
      "with-custom",
      "single-mode",
      "unknown-current",
      "nested-confirm-label",
    ]) {
      expect(run("--approval-cycle-fixture", scenario).status, scenario).toBe(
        0,
      );
    }
  });
});
