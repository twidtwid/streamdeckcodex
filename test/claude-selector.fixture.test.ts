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
