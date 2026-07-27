import { spawnSync } from "node:child_process";

const controlScript = process.argv[2];
if (!controlScript) throw new Error("Missing Codex control script path");

const runner = process.env.STREAMDECK_PTT_RUNNER ?? "/usr/bin/osascript";
const targetRunner = process.env.STREAMDECK_PTT_TARGET_RUNNER;
const targetWitnessToken = process.env.STREAMDECK_PTT_WITNESS_TOKEN;
const maxHoldMs = Math.max(
  100,
  Number(process.env.STREAMDECK_PTT_MAX_HOLD_MS ?? 60_000),
);
let stop;
const stopped = new Promise((resolve) => {
  stop = resolve;
});
let released = false;

function runControl(...args) {
  const result = spawnSync(runner, [controlScript, ...args], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Codex PTT control exited with ${result.status ?? "unknown"}`,
    );
  }
}

function release() {
  if (released) return;
  released = true;
  runControl("dictation-up");
}

function verifyTarget() {
  if (!targetRunner && !targetWitnessToken) return;
  if (!targetRunner || !targetWitnessToken) {
    throw new Error("Incomplete exact-target witness for push-to-talk.");
  }
  const result = spawnSync(
    targetRunner,
    ["target-verify", targetWitnessToken],
    { stdio: "ignore", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      "Push-to-talk target witness was not valid at key boundary.",
    );
  }
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.stdin.once("end", stop);
process.stdin.once("error", stop);
process.stdout.once("error", stop);
process.stdin.resume();

const timeout = setTimeout(stop, maxHoldMs);
try {
  verifyTarget();
  runControl("shortcut", "dictation-down");
  process.stdout.write("READY\n");
  await stopped;
} finally {
  clearTimeout(timeout);
  // Revalidate when possible, but unconditional release is required even if
  // Codex changed windows while the key was held.
  try {
    verifyTarget();
  } catch {
    // The key-up is a safety cleanup, not a task mutation.
  }
  release();
  process.stdin.destroy();
}
