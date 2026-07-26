import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live activity feed", () => {
  it("renders the newest activity timestamp instead of stale milestone data", () => {
    const dashboard = readFileSync("dashboard/index.html", "utf8");

    expect(dashboard).toContain(
      "const newestActivityAt = entries[0]?.at || data.updatedAt",
    );
  });

  it("renews a work lease on every transition and heartbeats while active", () => {
    const server = readFileSync("scripts/progress-server.mjs", "utf8");

    expect(server).toContain('if (kind === "transition")');
    expect(server).toContain("activityLeaseUntil = Date.now() + 5 * 60_000");
    expect(server).toContain("if (Date.now() > activityLeaseUntil) return");
    expect(server).toContain("Still working — ${latestWorkLine}");
    expect(server).not.toContain(
      "Number(status.phaseIndex) >= Number(status.phaseCount)",
    );
  });
});
