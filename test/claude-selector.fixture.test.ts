import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const helper = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);
function fixture(input: Record<string, string>) {
  return JSON.parse(
    execFileSync(
      helper,
      [
        "fixture-claude-policy",
        Buffer.from(JSON.stringify(input)).toString("base64"),
      ],
      { encoding: "utf8", timeout: 5000 },
    ),
  );
}
const id = "11111111-2222-4333-a444-555555555555";
describe("Claude native selector policy", () => {
  it.each([
    [321001, "ACCEPTED"],
    [4 * 1024 * 1024, "ACCEPTED"],
    [4 * 1024 * 1024 + 1, "REJECTED"],
  ])("bounds real metadata reads of %i bytes", (size, expected) => {
    expect(fixture({ kind: "metadata-size", text: String(size) }).model).toBe(
      expected,
    );
  });
  it.each([
    [{ console: "true", locked: "false" }, "READY"],
    [{ console: "true", locked: "true" }, "LOCKED"],
    [{ console: "false", locked: "false" }, "NO DESKTOP"],
    [{ missing: "true" }, "NO DESKTOP"],
  ])("rejects inactive desktop state %j", (state, expected) => {
    expect(fixture({ kind: "desktop", ...state }).model).toBe(expected);
  });
  it("recognizes observed Desktop local session IDs and prefixed picker labels", () => {
    expect(
      fixture({ url: `https://claude.ai/epitaxy/local_${id}` }).conversationId,
    ).toBe(`local_${id}`);
    expect(
      fixture({ url: `https://claude.ai/epitaxy/local_bad-id` }).conversationId,
    ).toBeUndefined();
    expect(fixture({ kind: "model", text: "Model: Fable 5.1" }).model).toBe(
      "Fable 5.1",
    );
    expect(fixture({ kind: "reasoning", text: "Effort: Extra" }).model).toBe(
      "Extra",
    );
  });
  it.each([
    [
      "Auto , teach auto mode about your environment Claude handles permission decisions",
      "Auto",
    ],
    ["Manual Always ask before making changes", "Manual"],
    ["Accept edits Automatically accept all file edits", "Accept edits"],
    ["Plan Create a plan before making changes", "Plan"],
    [
      "Bypass permissions Accepts all permissions Default",
      "Bypass permissions",
    ],
  ])("reads the semantic permission row %s", (text, expected) => {
    expect(fixture({ kind: "permission-row", text }).model).toBe(expected);
  });
  it("rejects unrelated permission-looking row text", () => {
    expect(
      fixture({ kind: "permission-row", text: "Plan something else" }).model,
    ).toBeUndefined();
  });
  it("reads context and the selected weekly bucket from the observed Usage control", () => {
    const state = fixture({
      kind: "usage",
      text: "Usage: Weekly · Fable: 31%, Resets Mon 2:00 PM, Context 161.3k / 1M (16%)",
    }).providerState;
    expect(state).toMatchObject({
      weeklyUsedPercent: 31,
      weeklyBucket: "Fable",
      contextUsedPercent: 16,
    });
    expect(
      fixture({
        kind: "usage",
        text: "Usage: Weekly · all models: 0%, Resets Mon 2:00 PM",
      }).providerState.weeklyUsedPercent,
    ).toBe(0);
  });
  it.each([
    "",
    "31%",
    "Usage: Weekly · Fable: 120%, Resets Monday",
    "Not Usage: Weekly · Fable: 31%, Resets Monday",
  ])("does not invent usage from %s", (text) => {
    expect(
      fixture({ kind: "usage", text }).providerState.weeklyUsedPercent,
    ).toBeUndefined();
  });
  it("preserves word boundaries in Claude control labels", () => {
    expect(
      fixture({ kind: "control-label", text: " Enable  fast mode " }).model,
    ).toBe("enable fast mode");
    expect(fixture({ kind: "control-label", text: "Hide sidebar" }).model).toBe(
      "hide sidebar",
    );
  });
  it("cycles offered permission modes without opening Bypass confirmation", () => {
    const choices = "Auto|Manual|Accept edits|Plan|Bypass permissions";
    expect(
      fixture({ kind: "permission-next", choices, text: "Plan" }).model,
    ).toBe("Auto");
    expect(
      fixture({ kind: "permission-next", choices, text: "Bypass permissions" })
        .model,
    ).toBe("Auto");
    expect(
      fixture({ kind: "permission-next", choices, text: "Manual" }).model,
    ).toBe("Accept edits");
    expect(
      fixture({ kind: "permission-next", choices: "Plan", text: "Plan" }).model,
    ).toBeUndefined();
  });
  it.each(["code", "epitaxy", "claude-code-desktop"])(
    "recognizes the %s Code root with a full UUID",
    (path) => {
      expect(
        fixture({ url: `https://claude.ai/${path}/${id}` }).conversationId,
      ).toBe(id);
    },
  );
  it.each([
    `https://example.com/code/${id}`,
    `https://claude.ai/chat/${id}`,
    `https://claude.ai/cowork/${id}`,
    `https://claude.ai/code/${id}/other`,
    `https://claude.ai/code/not-a-session`,
    `file:///code/${id}`,
    `https://claude.ai.example.com/code/${id}`,
  ])("rejects unrelated or ambiguous identity %s", (url) => {
    expect(fixture({ url }).conversationId).toBeUndefined();
  });
  it.each(["Fable 5.1", "Opus 4.6", "Sonnet 4.6", "Claude Haiku 4.5"])(
    "recognizes offered model label %s without a Codex model list",
    (text) => {
      expect(fixture({ kind: "model", text }).model).toBe(text);
    },
  );
  it("rejects transcript-like strings and unrecognized permission semantics", () => {
    expect(
      fixture({ kind: "model", text: "Please pick Fable 5.1" }).model,
    ).toBeUndefined();
    expect(
      fixture({ kind: "permission", text: "Full access" }).model,
    ).toBeUndefined();
    expect(fixture({ kind: "permission", text: "Auto" }).model).toBe("Auto");
    expect(fixture({ kind: "reasoning", text: "High" }).model).toBe("High");
  });
});
