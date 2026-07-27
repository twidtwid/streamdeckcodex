import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  activeDesktopThreadId,
  parseActiveDesktopThreadId,
  parseActiveDesktopWitness,
} from "../src/lib/desktop-active.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    spawnSync("trash", [path]);
  }
});

describe("active Codex desktop task targeting", () => {
  it("uses the latest focused primary thread activity event", () => {
    const visible = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
    const background = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const log = [
      `thread_stream_view_activity_changed active=true conversationId=${background} rendererWindowId=window-background rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=true conversationId=${visible} rendererWindowId=window-visible rendererWindowAppearance=primary rendererWindowFocused=true`,
      `background_task_changed conversationId=${background} rendererWindowAppearance=primary rendererWindowFocused=true`,
    ].join("\n");

    expect(parseActiveDesktopThreadId(log)).toBe(visible);
  });

  it("ignores secondary, unfocused, and inactive view events", () => {
    const valid = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
    const ignored = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const log = [
      `thread_stream_view_activity_changed active=true conversationId=${valid} rendererWindowId=window-valid rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=false conversationId=${ignored} rendererWindowId=window-ignored rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=true conversationId=${ignored} rendererWindowId=window-ignored rendererWindowAppearance=primary rendererWindowFocused=false`,
      `thread_stream_view_activity_changed active=true conversationId=${ignored} rendererWindowId=window-ignored rendererWindowAppearance=secondary rendererWindowFocused=true`,
    ].join("\n");

    expect(parseActiveDesktopThreadId(log)).toBe(valid);
  });

  it("retains the exact renderer-window witness only from a focused primary event", () => {
    const thread = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
    const stale = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const log = [
      `thread_stream_view_activity_changed active=true conversationId=${stale} rendererWindowId=window-a rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=true conversationId=${thread} rendererWindowId=window-b rendererWindowAppearance=primary rendererWindowFocused=true`,
    ].join("\n");

    expect(parseActiveDesktopWitness(log, 123)).toMatchObject({
      conversationId: thread,
      rendererWindowId: "window-b",
      observedAt: 123,
    });
  });

  it("reads the UTC log day when local time is still on the prior date", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-desktop-logs-"));
    temporaryRoots.push(root);
    const directory = join(root, "2026", "07", "26");
    const active = "019f9c13-ce4e-7f01-bf9c-311e5262b4ce";
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "codex-desktop.log"),
      `thread_stream_view_activity_changed active=true conversationId=${active} rendererWindowId=window-active rendererWindowAppearance=primary rendererWindowFocused=true`,
    );

    expect(activeDesktopThreadId(root, new Date("2026-07-26T02:00:00Z"))).toBe(
      active,
    );
  });

  it("finds the focused task before megabytes of unrelated diagnostics", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-desktop-logs-"));
    temporaryRoots.push(root);
    const directory = join(root, "2026", "07", "26");
    const active = "019f9c13-ce4e-7f01-bf9c-311e5262b4ce";
    const replacement = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const path = join(directory, "codex-desktop.log");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path,
      `thread_stream_view_activity_changed active=true conversationId=${active} rendererWindowId=window-active rendererWindowAppearance=primary rendererWindowFocused=true\n${"diagnostic filler\n".repeat(330_000)}`,
    );

    expect(activeDesktopThreadId(root, new Date("2026-07-26T04:00:00Z"))).toBe(
      active,
    );

    appendFileSync(
      path,
      `thread_stream_view_activity_changed active=true conversationId=${replacement} rendererWindowId=window-replacement rendererWindowAppearance=primary rendererWindowFocused=true\n`,
    );
    expect(activeDesktopThreadId(root, new Date("2026-07-26T04:01:00Z"))).toBe(
      replacement,
    );
  });

  it("chooses the newest focus event across logs instead of the chattiest file", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-desktop-logs-"));
    temporaryRoots.push(root);
    const directory = join(root, "2026", "07", "26");
    const visible = "019f9c13-ce4e-7f01-bf9c-311e5262b4ce";
    const stale = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const visibleLog = join(directory, "visible.log");
    const noisyLog = join(directory, "noisy.log");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      visibleLog,
      `2026-07-26T04:02:00.000Z thread_stream_view_activity_changed active=true conversationId=${visible} rendererWindowId=window-visible rendererWindowAppearance=primary rendererWindowFocused=true`,
    );
    writeFileSync(
      noisyLog,
      `2026-07-26T04:01:00.000Z thread_stream_view_activity_changed active=true conversationId=${stale} rendererWindowId=window-stale rendererWindowAppearance=primary rendererWindowFocused=true\nbackground diagnostics`,
    );
    utimesSync(noisyLog, new Date(), new Date());

    expect(activeDesktopThreadId(root, new Date("2026-07-26T04:03:00Z"))).toBe(
      visible,
    );
  });
});
