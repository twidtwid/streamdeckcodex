import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
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
if [ "$STREAMDECK_PTT_FAIL_DOWN" = "1" ] && [ "$1" = "dictation-start" ]; then
  printf '%s\n' "mock dictation-start failure" >&2
  exit 7
fi
if [ "$STREAMDECK_PTT_FAIL_TARGET" = "1" ] && [ "$1" = "target-verify" ]; then
  printf '%s\n' "mock target failure" >&2
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
}): Promise<{
  code: number | null;
  lines: string[];
  ready: boolean;
  stderr: string;
}> {
  const { log, runner } = fixture();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [guardScript], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        STREAMDECK_PTT_TARGET_RUNNER: runner,
        STREAMDECK_PTT_WITNESS_TOKEN: "opaque-witness-token",
        STREAMDECK_PTT_TEST_LOG: log,
        STREAMDECK_PTT_MAX_HOLD_MS: String(options.maxHoldMs ?? 2_000),
        ...(options.failDown ? { STREAMDECK_PTT_FAIL_DOWN: "1" } : {}),
        ...(options.failTarget ? { STREAMDECK_PTT_FAIL_TARGET: "1" } : {}),
      },
    });
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
      resolve({ code, lines, ready, stderr });
    });
  });
}

describe("push-to-talk dictation lease", () => {
  it("stops native dictation when the parent closes its pipe", async () => {
    const result = await runGuard({ closeAfterReady: true });

    expect(result.ready).toBe(true);
    expect(result.code).toBe(0);
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "dictation-start opaque-witness-token",
      "dictation-stop",
    ]);
  });

  it("releases after a partially failing key-down attempt", async () => {
    const result = await runGuard({ failDown: true });

    expect(result.ready).toBe(false);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("mock dictation-start failure");
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "dictation-start opaque-witness-token",
      "dictation-stop",
    ]);
  });

  it("releases automatically at the maximum hold timeout", async () => {
    const result = await runGuard({ maxHoldMs: 100 });

    expect(result.ready).toBe(true);
    expect(result.code).toBe(0);
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "dictation-start opaque-witness-token",
      "dictation-stop",
    ]);
  });

  it("checks the exact task/window witness before native dictation starts", async () => {
    const result = await runGuard({
      closeAfterReady: true,
      targetWitness: true,
    });

    expect(result.ready).toBe(true);
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "dictation-start opaque-witness-token",
      "dictation-stop",
    ]);
  });

  it("refuses PTT key-down when the target witness is no longer valid", async () => {
    const result = await runGuard({ failTarget: true, targetWitness: true });

    expect(result.ready).toBe(false);
    expect(result.stderr).toContain("mock target failure");
    expect(result.lines).toEqual([
      "target-verify opaque-witness-token",
      "dictation-stop",
    ]);
  });

  it("registers startup, process-exit, and page-hide cleanup", () => {
    const plugin = readFileSync("src/plugin.ts", "utf8");
    const command = readFileSync("src/actions/command.ts", "utf8");
    const automation = readFileSync("src/lib/automation.ts", "utf8");
    const control = readFileSync(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
      "utf8",
    );

    expect(plugin.match(/releaseSynthesizedKeysSync\(\)/g)).toHaveLength(3);
    const connectIndex = plugin.indexOf("await streamDeck.connect()");
    expect(connectIndex).toBeGreaterThan(0);
    expect(
      plugin.indexOf("\nreleaseSynthesizedKeysSync();", connectIndex),
    ).toBeGreaterThan(connectIndex);
    expect(plugin).toContain('process.on("uncaughtExceptionMonitor"');
    expect(plugin).toContain('process.once("exit"');
    expect(command).toContain("async onWillDisappear");
    expect(command).toContain("await endDictation()");
    expect(automation).toContain("await captureLiveTarget(threadId)");
    expect(automation).not.toContain(
      "const witnessToken = await verifyLiveTarget(threadId)",
    );
    expect(control).toContain('tell application id "com.openai.codex"');
    expect(control).not.toContain('application "/Applications/Codex.app"');
    expect(control).not.toContain("key down");
    expect(control).toContain('key up "d"');
    expect(control).toContain("key up shift");
    expect(control).toContain("key up control");
    expect(automation).toContain('stdio: ["pipe", "pipe", "pipe"]');
    expect(automation).toContain("guardError");
    expect(automation).toContain('["dictation-stop"]');
  });

  it("bounds every AppleScript cleanup so missing Accessibility cannot block boot", () => {
    const automation = readFileSync("src/lib/automation.ts", "utf8");

    expect(automation).toContain("timeout: 1_500");
    expect(automation).toContain('killSignal: "SIGKILL"');
    expect(automation).toContain('child.kill("SIGKILL")');
    expect(automation).toContain("timed out after ${timeoutMs} ms");
  });

  it("recognizes only the visible Codex composer dictation states", () => {
    const native = "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control";
    for (const scenario of [
      "idle",
      "recording",
      "retry",
      "system-menu-rejected",
      "wrong-state-rejected",
    ]) {
      expect(spawnSync(native, ["--dictation-fixture", scenario]).status).toBe(
        0,
      );
    }
  });
});
