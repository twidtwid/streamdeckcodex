import { spawnSync } from "node:child_process";

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

function runTargetControl(action, witnessToken) {
  if (!targetRunner) {
    throw new Error("Missing Codex accessibility control for push-to-talk.");
  }
  const args = witnessToken ? [action, witnessToken] : [action];
  const result = spawnSync(targetRunner, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = processFailureDetail(result);
    throw new Error(
      `Codex PTT ${action} exited with ${result.status ?? "unknown"}${detail}`,
    );
  }
}

function processFailureDetail(result) {
  const stderr = String(result.stderr ?? "").trim();
  if (stderr) return `: ${stderr.slice(0, 600)}`;
  const stdout = String(result.stdout ?? "").trim();
  if (!stdout) return "";
  try {
    const parsed = JSON.parse(stdout);
    const message = String(parsed.message ?? parsed.reasonCode ?? "").trim();
    return message ? `: ${message.slice(0, 600)}` : "";
  } catch {
    return `: ${stdout.slice(0, 600)}`;
  }
}

function release() {
  if (released) return;
  released = true;
  runTargetControl("dictation-stop");
}

function verifyTarget() {
  if (!targetRunner && !targetWitnessToken) return;
  if (!targetRunner || !targetWitnessToken) {
    throw new Error("Incomplete exact-target witness for push-to-talk.");
  }
  const result = spawnSync(
    targetRunner,
    ["target-verify", targetWitnessToken],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = processFailureDetail(result);
    throw new Error(
      `Push-to-talk target witness was not valid at key boundary${detail}.`,
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
  runTargetControl("dictation-start", targetWitnessToken);
  process.stdout.write("READY\n");
  await stopped;
} finally {
  clearTimeout(timeout);
  // Stop the recording unconditionally even if focus changed while held.
  release();
  process.stdin.destroy();
}
