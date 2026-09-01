import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) spawnSync("trash", [root]);
});

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
    expect(server).toContain("await syncExternalTransition()");
    expect(server).toContain('join(root, ".cache", "progress")');
    expect(server).not.toContain('join(dashboard, "activity.jsonl")');
    expect(server).not.toContain(
      "Number(status.phaseIndex) >= Number(status.phaseCount)",
    );
  });

  it("durably appends a transition when localhost is unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-progress-log-"));
    temporaryRoots.push(root);
    const activityPath = join(root, "activity.jsonl");
    const result = spawnSync(
      process.execPath,
      ["scripts/progress-log.mjs", "Fallback transition"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_PROGRESS_PORT: "1",
          CODEX_PROGRESS_ACTIVITY_PATH: activityPath,
        },
      },
    );

    expect(result.status).toBe(0);
    const entries = readFileSync(activityPath, "utf8")
      .trim()
      .split("\n")
      .map((entry) => JSON.parse(entry));
    expect(entries).toEqual([
      expect.objectContaining({
        kind: "transition",
        line: "Fallback transition",
      }),
    ]);
  });
});
