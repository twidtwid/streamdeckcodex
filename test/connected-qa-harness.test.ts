import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These scripts run connected QA at import time, so the guard below has to
// read them as text rather than import them. It is the one deliberate
// source-text assertion in the suite.
describe("shared connected-action harness", () => {
  it("backs both dial and mode gates without duplicated transports", () => {
    for (const script of [
      "scripts/qa-dial-events.mjs",
      "scripts/qa-mode-events.mjs",
    ]) {
      const source = readFileSync(script, "utf8");
      expect(source).toContain("createStreamDeckActionHarness");
      expect(source).not.toContain("new WebSocketServer");
      expect(source).not.toContain('"registerPlugin"');
      expect(source).not.toContain("child.stdout.on");
    }
  });

  it("exposes the embedded Node runtime to the native-call proxy", () => {
    const source = readFileSync("scripts/qa-mode-events.mjs", "utf8");

    expect(source).toContain("dirname(process.execPath)");
    expect(source).toContain('process.env.PATH ?? ""');
  });
});
