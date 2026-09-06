import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { nativeHelperPath } from "./lib/native-helper-path.mjs";

// Development acceptance only. No session identifiers, drafts, or paths are printed.
const args = process.argv.slice(2);
const environment = args
  .find((a) => a.startsWith("--environment="))
  ?.split("=")[1];
if (!["local", "ssh", "cloud"].includes(environment)) {
  throw new Error(
    "Specify --environment=local, --environment=ssh, or --environment=cloud.",
  );
}
const exercise = args.includes("--exercise");
const helper = nativeHelperPath(resolve("."));
const env = {
  ...process.env,
  STREAMDECK_CLAUDE_ACCEPTANCE_ENVIRONMENT: environment,
};
if (args.includes("--activate")) {
  const activation = spawnSync(
    "osascript",
    ["-e", 'tell application "Claude" to activate'],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(activation.status, 0, "Claude activation failed");
}
function invoke(action, payload) {
  const callArgs = [action];
  if (payload)
    callArgs.push(Buffer.from(JSON.stringify(payload)).toString("base64"));
  const result = spawnSync(helper, callArgs, {
    env,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined, "Native helper did not finish");
  const reply = JSON.parse(result.stdout || "{}");
  if (!reply.ok) throw new Error(reply.message || "Native request failed");
  return reply.providerState;
}
let initial;
const deadline = Date.now() + 8000;
do {
  initial = invoke("provider-read");
  if (initial.target?.environment === environment) break;
  if (Date.now() < deadline)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
} while (Date.now() < deadline);
assert.equal(
  initial.target?.environment,
  environment,
  `Select the expected Code environment first (${initial.reason ?? initial.foreground ?? "unobserved"})`,
);
const target = initial.target;
function read() {
  const result = invoke("provider-read");
  assert.deepEqual(
    result.target,
    target,
    "Target changed; refusing restoration in another session",
  );
  return result;
}
function perform(operation, value) {
  const result = invoke("claude", {
    operation,
    target,
    ...(value === undefined ? {} : { value }),
  });
  assert.deepEqual(result.target, target);
  console.log(JSON.stringify({ environment, operation, passed: true }));
  return result;
}
const models = perform("model-options").options;
const efforts = perform("reasoning-options").options;
assert.ok(models?.length && efforts?.length, "Pickers exposed no choices");
for (const [field, replacement] of Object.entries({
  windowId: "different-window",
  sessionId: "local_11111111-2222-4333-a444-555555555555",
  environment: environment === "local" ? "ssh" : "local",
  provider: "codex",
})) {
  assert.throws(
    () =>
      invoke("claude", {
        operation: "model",
        target: { ...target, [field]: replacement },
        value: initial.model,
      }),
    /Target changed/,
  );
  assert.equal(read().model, initial.model);
  console.log(
    JSON.stringify({ environment, rejectsChanged: field, passed: true }),
  );
}
if (exercise) {
  const alternate = models.find((o) => o.value !== initial.model);
  if (alternate) {
    try {
      assert.equal(perform("model", alternate.value).model, alternate.value);
      const beforeFast = read();
      if (beforeFast.capabilities?.includes("fast")) {
        try {
          assert.equal(perform("fast").fast, !beforeFast.fast);
        } finally {
          if (read().fast !== beforeFast.fast) perform("fast");
        }
      }
    } finally {
      if (read().model !== initial.model) perform("model", initial.model);
    }
  }
  const originalEffort = efforts.find(
    (o) => o.value === initial.effort || o.label === initial.effort,
  );
  assert.ok(originalEffort, "Current effort is not in the offered options");
  const alternativeEffort = efforts.find(
    (o) => o.value !== originalEffort.value,
  );
  if (alternativeEffort) {
    try {
      perform("reasoning", alternativeEffort.value);
    } finally {
      perform("reasoning", originalEffort.value);
    }
    assert.equal(read().effort, initial.effort);
  }
  if (!["Plan", "Plan mode"].includes(initial.permission)) {
    try {
      assert.ok(["Plan", "Plan mode"].includes(perform("plan").permission));
    } finally {
      if (["Plan", "Plan mode"].includes(read().permission))
        perform("plan", initial.permission);
    }
    assert.equal(read().permission, initial.permission);
    let returned = false;
    for (let i = 0; i < 8; i++) {
      if (perform("permission-cycle").permission === initial.permission) {
        returned = true;
        break;
      }
    }
    assert.ok(returned, "Permission cycle did not return to its initial mode");
  }
  for (const operation of ["sidebar", "review-panel", "browser"]) {
    if (!read().capabilities?.includes(operation)) continue;
    perform(operation);
    perform(operation);
  }
}
const final = read();
assert.equal(final.model, initial.model);
assert.equal(final.effort, initial.effort);
assert.equal(final.permission, initial.permission);
console.log(
  JSON.stringify({
    environment,
    passed: true,
    exercised: exercise,
    weeklyObserved: final.weeklyUsedPercent !== undefined,
    contextObserved: final.contextUsedPercent !== undefined,
  }),
);
