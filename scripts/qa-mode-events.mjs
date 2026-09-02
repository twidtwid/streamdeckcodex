import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  createLiveStateRestorer,
  requireConnectedQaTarget,
  snapshotLiveState,
} from "./lib/live-state-journal.mjs";
import { activeForegroundThreadId } from "./lib/foreground-thread.mjs";
import {
  createStreamDeckActionHarness,
  waitFor,
} from "./lib/streamdeck-action-harness.mjs";

const root = resolve(import.meta.dirname, "..");
const plugin = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "plugin.js",
);
const nativeControl = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "codex-ui-control",
);
const proxy = resolve(root, "scripts", "qa-native-proxy.mjs");
const scratch = mkdtempSync(resolve(tmpdir(), "streamdeck-mode-qa-"));
const nativeLog = resolve(scratch, "native-calls.jsonl");
writeFileSync(nativeLog, "");
chmodSync(proxy, 0o755);

function native(action, mode, threadId) {
  const values = [action];
  if (mode !== undefined || threadId) values.push(mode ?? "");
  if (threadId) values.push(threadId);
  const result = spawnSync(nativeControl, values, {
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout.trim());
  return { status: result.status, ...parsed };
}

async function waitForMode(mode, expected) {
  return waitFor(() => {
    const read = native("mode-read", mode, activeThreadId);
    return read.active === expected ? read : undefined;
  }, 5_000);
}

const activeThreadId = requireConnectedQaTarget(
  activeForegroundThreadId(),
  process.env.STREAMDECK_QA_THREAD_ID,
);
const initialState = snapshotLiveState(native, activeThreadId);
const initialPlan = { active: initialState.plan };
if (typeof initialPlan.active !== "boolean") {
  throw new Error(
    `Plan precondition unavailable: ${initialPlan.message ?? "unknown"}`,
  );
}
const fastRead = { active: initialState.fast };
if (typeof fastRead.active !== "boolean") {
  throw new Error(
    `Fast precondition unavailable: ${fastRead.message ?? "unknown"}`,
  );
}

const restoreOnce = createLiveStateRestorer(native, initialState);
const harness = await createStreamDeckActionHarness({
  plugin,
  pluginContext: "qa-mode-plugin-context",
  env: {
    CODEX_UI_CONTROL: proxy,
    QA_NATIVE_REAL: nativeControl,
    QA_NATIVE_LOG: nativeLog,
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  },
  restore: restoreOnce,
});
const { outbound } = harness;

const action = "com.todd.streamdeckcodex.command";
const contexts = [];

async function pressMode(mode, commandIndex, expectedTitle) {
  const context = `qa-${mode}-${contexts.length}`;
  contexts.push(context);
  const settings = { commandIndex };
  const payload = {
    controller: "Encoder",
    coordinates: { column: 1, row: 0 },
    isInMultiAction: false,
    resources: {},
    settings,
  };
  harness.send({
    action,
    context,
    device: "qa-stream-deck-plus",
    event: "willAppear",
    payload,
  });
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.context === context &&
        message.event === "setFeedback" &&
        message.payload?.title === "ACTION" &&
        message.payload?.value?.toLowerCase() === mode,
    ),
  );
  const before = outbound.length;
  harness.send({
    action,
    context,
    device: "qa-stream-deck-plus",
    event: "dialUp",
    payload,
  });
  const feedback = await waitFor(() =>
    outbound
      .slice(before)
      .find(
        (message) =>
          message.context === context &&
          message.event === "setFeedback" &&
          message.payload?.title === expectedTitle &&
          message.payload?.value?.toLowerCase() === mode,
      ),
  );
  return feedback.payload;
}

try {
  const firstExpected = initialPlan.active ? "OFF" : "ACTIVE";
  const secondExpected = initialPlan.active ? "ACTIVE" : "OFF";
  const firstPlanFeedback = await pressMode("plan", 1, firstExpected);
  const afterFirst = await waitForMode("plan", !initialPlan.active);
  const secondPlanFeedback = await pressMode("plan", 1, secondExpected);
  const restoredPlan = await waitForMode("plan", initialPlan.active);

  const firstFastExpected = fastRead.active ? "OFF" : "ACTIVE";
  const secondFastExpected = fastRead.active ? "ACTIVE" : "OFF";
  const firstFastFeedback = await pressMode("fast", 0, firstFastExpected);
  const afterFirstFast = await waitForMode("fast", !fastRead.active);
  const secondFastFeedback = await pressMode("fast", 0, secondFastExpected);
  const restoredFast = await waitForMode("fast", fastRead.active);

  const calls = readFileSync(nativeLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const dispatches = calls.filter((call) => call[0] === "mode-toggle");
  if (dispatches.length !== 4) {
    throw new Error(
      `Expected 4 native dispatches, observed ${dispatches.length}.`,
    );
  }
  if (dispatches.some((call) => typeof call[2] !== "string" || !call[2])) {
    throw new Error(
      `Mode dispatches were not bound to the focused task: ${JSON.stringify(dispatches)}`,
    );
  }
  const dispatchedModes = dispatches.map((call) => call.slice(0, 2));
  if (
    JSON.stringify(dispatchedModes) !==
    JSON.stringify([
      ["mode-toggle", "plan"],
      ["mode-toggle", "plan"],
      ["mode-toggle", "fast"],
      ["mode-toggle", "fast"],
    ])
  ) {
    throw new Error(
      `Unexpected native dispatches: ${JSON.stringify(dispatches)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      plan: {
        initial: initialPlan.active,
        first: firstPlanFeedback,
        second: secondPlanFeedback,
        restored: restoredPlan.active,
      },
      fast: {
        initial: fastRead.active,
        first: firstFastFeedback,
        second: secondFastFeedback,
        restored: restoredFast.active,
      },
      dispatches,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${harness.output()}\n${JSON.stringify(
      outbound.filter(
        (message) =>
          contexts.includes(message.context) || message.event === "showAlert",
      ),
    )}\n`,
  );
  throw error;
} finally {
  const failures = await harness.close();
  if (failures.length) {
    process.stderr.write(`restore failures: ${failures.join("; ")}\n`);
    process.exitCode = 1;
  }
}
