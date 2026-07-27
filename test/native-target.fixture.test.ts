import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    spawnSync("trash", [root]);
  }
});

function activity(
  id: string,
  window: string,
  timestamp = "2026-07-26T04:02:00.000Z",
): string {
  return `${timestamp} thread_stream_view_activity_changed active=true conversationId=${id} rendererWindowId=${window} rendererWindowAppearance=primary rendererWindowFocused=true`;
}

function evaluateMulti(
  logs: Array<{ name: string; content: string; mtime?: Date }>,
  threadId: string,
  baseline?: {
    offsets: Record<string, number>;
    identityOverrides?: Record<string, string>;
    expectedRendererWindowId?: string;
  },
): number | null {
  const root = mkdtempSync(join(tmpdir(), "codex-native-target-"));
  temporaryRoots.push(root);
  const paths = logs.map(({ name, content, mtime }) => {
    const path = join(root, name);
    writeFileSync(path, content);
    if (mtime) utimesSync(path, mtime, mtime);
    return path;
  });
  const payload = Buffer.from(
    JSON.stringify({
      paths,
      threadId,
      ...(baseline
        ? {
            baselineOffsets: Object.fromEntries(
              Object.entries(baseline.offsets).map(([name, offset]) => [
                join(root, name),
                offset,
              ]),
            ),
            ...(baseline.identityOverrides
              ? {
                  baselineIdentityOverrides: Object.fromEntries(
                    Object.entries(baseline.identityOverrides).map(
                      ([name, identity]) => [join(root, name), identity],
                    ),
                  ),
                }
              : {}),
            ...(baseline.expectedRendererWindowId
              ? {
                  expectedRendererWindowId: baseline.expectedRendererWindowId,
                }
              : {}),
          }
        : {}),
    }),
  ).toString("base64");
  const result = spawnSync(native, ["--multi-log-fixture", payload], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result.status;
}

function evaluate(
  logState: string,
  frontmost: string,
  allWindows: string,
  focusedWindows: string,
  capturedWindow: string,
  composerCount: number,
): number | null {
  const result = spawnSync(
    native,
    [
      "--target-fixture",
      logState,
      frontmost,
      allWindows,
      focusedWindows,
      capturedWindow,
      String(composerCount),
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  return result.status;
}

describe("native exact-target fixture", () => {
  it("arbitrates the newest focused-primary event globally across separate logs", () => {
    expect(
      evaluateMulti(
        [
          {
            name: "older.log",
            content: activity("task-b", "window-b", "2026-07-26T04:01:00.000Z"),
          },
          {
            name: "newer.log",
            content: activity("task-a", "window-a", "2026-07-26T04:02:00.000Z"),
          },
        ],
        "task-a",
      ),
    ).toBe(0);
  });

  it("rejects an older requested witness when another log has the newer focus", () => {
    expect(
      evaluateMulti(
        [
          {
            name: "older.log",
            content: activity("task-a", "window-a", "2026-07-26T04:01:00.000Z"),
          },
          {
            name: "newer.log",
            content: activity("task-b", "window-b", "2026-07-26T04:02:00.000Z"),
          },
        ],
        "task-a",
      ),
    ).toBe(1);
  });

  it("uses mtime for equal event timestamps and fails closed for a true cross-file tie", () => {
    const timestamp = "2026-07-26T04:02:00.000Z";
    expect(
      evaluateMulti(
        [
          {
            name: "older.log",
            content: activity("task-b", "window-b", timestamp),
            mtime: new Date("2026-07-26T04:03:00.000Z"),
          },
          {
            name: "newer.log",
            content: activity("task-a", "window-a", timestamp),
            mtime: new Date("2026-07-26T04:04:00.000Z"),
          },
        ],
        "task-a",
      ),
    ).toBe(0);
    const tied = new Date("2026-07-26T04:04:00.000Z");
    expect(
      evaluateMulti(
        [
          {
            name: "first.log",
            content: activity("task-a", "window-a", timestamp),
            mtime: tied,
          },
          {
            name: "second.log",
            content: activity("task-b", "window-b", timestamp),
            mtime: tied,
          },
        ],
        "task-a",
      ),
    ).toBe(1);
  });

  it("ignores inactive, secondary, and unfocused events in every file", () => {
    const ignored = [
      "2026-07-26T04:03:00.000Z thread_stream_view_activity_changed active=false conversationId=task-b rendererWindowId=window-b rendererWindowAppearance=primary rendererWindowFocused=true",
      "2026-07-26T04:04:00.000Z thread_stream_view_activity_changed active=true conversationId=task-b rendererWindowId=window-b rendererWindowAppearance=secondary rendererWindowFocused=true",
      "2026-07-26T04:05:00.000Z thread_stream_view_activity_changed active=true conversationId=task-b rendererWindowId=window-b rendererWindowAppearance=primary rendererWindowFocused=false",
    ].join("\n");
    expect(
      evaluateMulti(
        [
          { name: "valid.log", content: activity("task-a", "window-a") },
          { name: "ignored.log", content: ignored },
        ],
        "task-a",
      ),
    ).toBe(0);
  });

  it("invalidates a token history when another file diverts focus, even if it returns", () => {
    const expected = activity("task-a", "window-a");
    expect(
      evaluateMulti(
        [
          { name: "original.log", content: expected },
          {
            name: "other.log",
            content: `${activity("task-b", "window-b", "2026-07-26T04:03:00.000Z")}\n${activity("task-a", "window-a", "2026-07-26T04:04:00.000Z")}`,
          },
        ],
        "task-a",
        { offsets: { "original.log": 0, "other.log": 0 } },
      ),
    ).toBe(1);
  });

  it("rejects a conflicting event from a log created after the cursor baseline", () => {
    const original = activity("task-a", "window-a");
    expect(
      evaluateMulti(
        [
          { name: "original.log", content: original },
          {
            name: "new.log",
            content: activity("task-b", "window-b", "2026-07-26T04:03:00.000Z"),
          },
        ],
        "task-a",
        {
          offsets: { "original.log": original.length },
          expectedRendererWindowId: "window-a",
        },
      ),
    ).toBe(1);
  });

  it("rejects a rotated file whose baseline identity no longer matches", () => {
    expect(
      evaluateMulti(
        [
          {
            name: "rotated.log",
            content: activity("task-a", "window-a"),
          },
        ],
        "task-a",
        {
          offsets: { "rotated.log": 0 },
          identityOverrides: { "rotated.log": "replaced-file-identity" },
          expectedRendererWindowId: "window-a",
        },
      ),
    ).toBe(1);
  });

  it("fails closed when the only focus event lies outside the bounded scan", () => {
    expect(
      evaluateMulti(
        [
          {
            name: "oversized.log",
            content: `${activity("task-a", "window-a")}\n${"diagnostic filler\n".repeat(1_100_000)}`,
          },
        ],
        "task-a",
      ),
    ).toBe(1);
  });

  it("executes the live verifier decision through the compiled native helper", () => {
    expect(existsSync(native)).toBe(true);
    expect(
      evaluate("fresh", "frontmost", "window-a", "window-a", "window-a", 1),
    ).toBe(0);
  });

  it("allows a previous window to remain open when only the captured window is focused", () => {
    expect(
      evaluate(
        "fresh",
        "frontmost",
        "window-a,window-b",
        "window-a",
        "window-a",
        1,
      ),
    ).toBe(0);
  });

  it.each([
    [
      "delayed witness timeout",
      "timeout",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "mismatched task/window",
      "mismatch",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "background Codex",
      "fresh",
      "background",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "two focused AX windows",
      "fresh",
      "frontmost",
      "window-a,window-b",
      "window-a,window-b",
      "window-a",
      1,
    ],
    [
      "focused AX window identity changed",
      "fresh",
      "frontmost",
      "window-a,window-b",
      "window-b",
      "window-a",
      1,
    ],
    [
      "ambiguous composers",
      "fresh",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      2,
    ],
    [
      "rotated or truncated log",
      "rotated",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "same-path replacement changes the file identity",
      "replaced",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "seek or bounded read failure",
      "seek-fail",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "expected then other then expected witness history",
      "history-diverted",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "newer mismatched log cannot fall back to older expected log",
      "newer-mismatch",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
    [
      "out-of-root token is rejected",
      "out-of-root-token",
      "frontmost",
      "window-a",
      "window-a",
      "window-a",
      1,
    ],
  ])(
    "fails closed for %s",
    (
      _label,
      logState,
      frontmost,
      allWindows,
      focusedWindows,
      captured,
      composers,
    ) => {
      expect(
        evaluate(
          logState,
          frontmost,
          allWindows,
          focusedWindows,
          captured,
          composers,
        ),
      ).toBe(1);
    },
  );
});
