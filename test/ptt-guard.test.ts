import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const guardScript = "com.todd.streamdeckcodex.sdPlugin/scripts/ptt-guard.mjs";

function fixture(): { directory: string; log: string; runner: string } {
  const directory = mkdtempSync(join(tmpdir(), "streamdeckcodex-ptt-"));
  const log = join(directory, "events.log");
  const runner = join(directory, "runner.sh");
  writeFileSync(
    runner,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$STREAMDECK_PTT_TEST_LOG"
if [ "$STREAMDECK_PTT_FAIL_DOWN" = "1" ] && [ "$2" = "shortcut" ]; then
  exit 7
fi
if [ "$STREAMDECK_PTT_FAIL_TARGET" = "1" ] && [ "$1" = "target-verify" ]; then
  exit 8
fi
exit 0
`,
  );
  chmodSync(runner, 0o700);
  return { directory, log, runner };
}

function runGuard(options: {
  closeAfterReady?: boolean;
  failDown?: boolean;
  failTarget?: boolean;
  maxHoldMs?: number;
  targetWitness?: boolean;
}): Promise<{ code: number | null; lines: string[]; ready: boolean }> {
  const { log, runner } = fixture();
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [guardScript, "control.applescript"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          STREAMDECK_PTT_RUNNER: runner,
          STREAMDECK_PTT_TEST_LOG: log,
          STREAMDECK_PTT_MAX_HOLD_MS: String(options.maxHoldMs ?? 2_000),
          ...(options.failDown ? { STREAMDECK_PTT_FAIL_DOWN: "1" } : {}),
          ...(options.failTarget ? { STREAMDECK_PTT_FAIL_TARGET: "1" } : {}),
          ...(options.targetWitness
            ? {
                STREAMDECK_PTT_TARGET_RUNNER: runner,
                STREAMDECK_PTT_WITNESS_TOKEN: "opaque-witness-token",
              }
            : {}),
        },
      },
    );
    let ready = false;
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (!chunk.includes("READY")) return;
      ready = true;
      if (options.closeAfterReady) child.stdin.end();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      const lines = readFileSync(log, "utf8").trim().split("\n");
      if (code !== 0 && !options.failDown && !options.failTarget) {
        reject(new Error(stderr || `Guard exited with ${code}`));
        return;
      }
      resolve({ code, lines, ready });
    });
  });
}

describe("push-to-talk key lease", () => {
  it("releases the accelerator when the parent closes its pipe", async () => {
    const result = await runGuard({ closeAfterReady: true });

    expect(result.ready).toBe(true);
    expect(result.code).toBe(0);
    expect(result.lines).toEqual([
      "control.applescript shortcut dictation-down",
      "control.applescript dictation-up",
    ]);
  });

  it("releases after a partially failing key-down attempt", async () => {
    const result = await runGuard({ failDown: true });

    expect(result.ready).toBe(false);
    expect(result.code).not.toBe(0);
    expect(result.lines).toEqual([
      "control.applescript shortcut dictation-down",
      "control.applescript dictation-up",
    ]);
  });

  it("releases automatically at the maximum hold timeout", async () => {
    const result = await runGuard({ maxHoldMs: 100 });

    expect(result.ready).toBe(true);
    expect(result.code).toBe(0);
    expect(result.lines).toEqual([
      "control.applescript shortcut dictation-down",
      "control.applescript dictation-up",
    ]);
  });

  it("checks the exact task/window witness at PTT key boundaries", async () => {
    const result = await runGuard({
      closeAfterReady: true,
      targetWitness: true,
    });

    expect(result.ready).toBe(true);
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "control.applescript shortcut dictation-down",
      "target-verify opaque-witness-token",
      "control.applescript dictation-up",
    ]);
  });

  it("refuses PTT key-down when the target witness is no longer valid", async () => {
    const result = await runGuard({ failTarget: true, targetWitness: true });

    expect(result.ready).toBe(false);
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "target-verify opaque-witness-token",
      "control.applescript dictation-up",
    ]);
  });

  it("registers startup, process-exit, and page-hide cleanup", () => {
    const plugin = readFileSync("src/plugin.ts", "utf8");
    const command = readFileSync("src/actions/command.ts", "utf8");
    const control = readFileSync(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
      "utf8",
    );

    expect(plugin.match(/releaseSynthesizedKeysSync\(\)/g)).toHaveLength(2);
    expect(plugin).toContain('process.once("exit"');
    expect(command).toContain("async onWillDisappear");
    expect(command).toContain("await endDictation()");
    expect(control.match(/key down/g)).toHaveLength(2);
    expect(control).toContain('if payload is "dictation-down" then');
    expect(control).toContain('key up "d"');
    expect(control).toContain("key up shift");
    expect(control).toContain("key up control");
  });
});
