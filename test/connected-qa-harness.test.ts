import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});
