import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  captureLiveTarget: vi.fn(async () => "witness-token"),
  spawn: vi.fn(),
  spawnSync: vi.fn<
    (
      executable: string,
      args: string[],
      options: { timeout: number; killSignal: string },
    ) => { status: number; error: undefined }
  >(() => ({ status: 0, error: undefined })),
}));

vi.mock("node:child_process", () => ({
  spawn: harness.spawn,
  spawnSync: harness.spawnSync,
}));
vi.mock("../src/lib/codex-ui-control.js", () => ({
  captureLiveTarget: harness.captureLiveTarget,
  cycleLiveApprovalMode: vi.fn(),
  readLiveComposerState: vi.fn(),
  applyLiveModel: vi.fn(),
  applyLiveReasoning: vi.fn(),
  dispatchLiveControl: vi.fn(),
  toggleLiveMode: vi.fn(),
  openLiveNewProject: vi.fn(),
  launchLiveWorkflow: vi.fn(),
  openLiveRoute: vi.fn(),
  verifyLiveTarget: vi.fn(),
}));

import { inputReleaseSnapshot, startDictation } from "../src/lib/automation.js";

type FakeChild = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
};

function fakeGuard({ exitsOnStdinEnd = true } = {}): FakeChild {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    kill: vi.fn(),
  });
  child.stdin.on("finish", () => {
    if (!exitsOnStdinEnd) return;
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  return child;
}

describe("push-to-talk lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.spawnSync.mockReturnValue({ status: 0, error: undefined });
  });

  it("captures the exact target before spawning the guard and passes it through", async () => {
    const child = fakeGuard();
    harness.spawn.mockImplementation(() => {
      setImmediate(() => child.stdout.write("READY\n"));
      return child;
    });

    await startDictation("thread-1");

    expect(harness.captureLiveTarget).toHaveBeenCalledWith("thread-1");
    expect(harness.captureLiveTarget.mock.invocationCallOrder[0]).toBeLessThan(
      harness.spawn.mock.invocationCallOrder[0]!,
    );
    const [, args, options] = harness.spawn.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string>; stdio: unknown },
    ];
    expect(args[0]).toMatch(/ptt-guard\.mjs$/);
    expect(options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(options.env.STREAMDECK_PTT_WITNESS_TOKEN).toBe("witness-token");
    expect(options.env.STREAMDECK_PTT_TARGET_RUNNER).toMatch(
      /codex-ui-control$/,
    );
  });

  it("releases the guard when it dies before READY without touching the fallback", async () => {
    const child = fakeGuard();
    harness.spawn.mockImplementation(() => {
      setImmediate(() => {
        child.stderr.write("guard crashed");
        child.exitCode = 3;
        child.emit("exit", 3);
      });
      return child;
    });

    await expect(startDictation("thread-1")).rejects.toThrow(
      "exited before ready with 3: guard crashed",
    );
    expect(inputReleaseSnapshot()).toMatchObject({
      held: false,
      lastRecord: { reason: "start-failed", result: "released" },
    });
    expect(harness.spawnSync).not.toHaveBeenCalled();
  });

  it("falls back to the bounded synchronous release when the guard will not exit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const child = fakeGuard({ exitsOnStdinEnd: false });
      harness.spawn.mockImplementation(() => child);

      const pending = startDictation("thread-1");
      pending.catch(() => undefined);
      // 5 s READY timeout, then the 2 s stop timeout before the fallback.
      await vi.advanceTimersByTimeAsync(7_500);
      await expect(pending).rejects.toThrow(
        "Timed out starting guarded push-to-talk",
      );

      expect(child.kill).toHaveBeenCalled();
      const releases = harness.spawnSync.mock.calls;
      expect(releases.some(([, args]) => args[1] === "dictation-up")).toBe(
        true,
      );
      expect(releases.some(([, args]) => args[0] === "dictation-stop")).toBe(
        true,
      );
      for (const [, , options] of releases) {
        expect(options.killSignal).toBe("SIGKILL");
        expect(options.timeout).toBeLessThanOrEqual(4_000);
      }
      // The stop path succeeded through its own bounded fallback, so the
      // guard records a normal release rather than a failed one.
      expect(inputReleaseSnapshot()).toMatchObject({
        held: false,
        lastRecord: { reason: "start-failed", result: "released" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
