import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";
import {
  createLiveStateRestorer,
  requireConnectedQaTarget,
  snapshotLiveState,
} from "./lib/live-state-journal.mjs";
import { activeForegroundThreadId } from "./lib/foreground-thread.mjs";

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

const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

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

async function waitFor(check, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Timed out waiting for a mode event result");
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

const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(server, "listening");
const address = server.address();
if (typeof address === "string" || !address) {
  throw new Error("QA WebSocket server did not bind");
}

const info = JSON.stringify({
  application: {
    font: ".AppleSystemUIFont",
    language: "en",
    platform: "mac",
    platformVersion: "26.5",
    version: "7.5.0",
  },
  colors: {},
  devicePixelRatio: 2,
  devices: [
    {
      id: "qa-stream-deck-plus",
      name: "QA Stream Deck +",
      size: { columns: 4, rows: 2 },
      type: 7,
    },
  ],
  plugin: { uuid: "com.todd.streamdeckcodex", version: "0.1.0.0" },
});

let socket;
const outbound = [];
server.on("connection", (connected) => {
  socket = connected;
  connected.on("message", (data) => {
    const message = JSON.parse(data.toString());
    outbound.push(message);
    if (message.event === "getGlobalSettings") {
      connected.send(
        JSON.stringify({
          event: "didReceiveGlobalSettings",
          payload: {
            settings: { profileActivationVersion: "profile-v1" },
          },
        }),
      );
    }
  });
});

const child = spawn(
  resolve(
    homedir(),
    "Library/Application Support/com.elgato.StreamDeck/NodeJS/24.13.1/node",
  ),
  [
    plugin,
    "-port",
    String(address.port),
    "-pluginUUID",
    "qa-mode-plugin-context",
    "-registerEvent",
    "registerPlugin",
    "-info",
    info,
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      CODEX_UI_CONTROL: proxy,
      QA_NATIVE_REAL: nativeControl,
      QA_NATIVE_LOG: nativeLog,
    },
    cwd: resolve(dirname(plugin), ".."),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const output = [];
let childResult;
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => output.push(chunk));
child.stderr.on("data", (chunk) => output.push(chunk));
child.once("exit", (code, signal) => {
  childResult = { code, signal };
});

const restoreOnce = createLiveStateRestorer(native, initialState);
const signals = ["SIGINT", "SIGTERM"];
const onSignal = (signal) => {
  child.kill("SIGTERM");
  for (const client of server.clients) client.terminate();
  server.close();
  const failures = restoreOnce();
  if (failures.length) {
    process.stderr.write(`restore failures: ${failures.join("; ")}\n`);
  }
  process.exit(failures.length ? 1 : signal === "SIGINT" ? 130 : 143);
};
const signalHandlers = new Map(
  signals.map((signal) => [signal, () => onSignal(signal)]),
);
for (const [signal, handler] of signalHandlers) process.once(signal, handler);

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
  socket.send(
    JSON.stringify({
      action,
      context,
      device: "qa-stream-deck-plus",
      event: "willAppear",
      payload,
    }),
  );
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
  socket.send(
    JSON.stringify({
      action,
      context,
      device: "qa-stream-deck-plus",
      event: "dialUp",
      payload,
    }),
  );
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
  await waitFor(() => {
    if (childResult) {
      throw new Error(
        `Plugin exited before connecting: ${JSON.stringify(childResult)} ${output.join("")}`,
      );
    }
    return socket;
  });
  await waitFor(() =>
    outbound.some((message) => message.event === "registerPlugin"),
  );

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
    `${output.join("")}\n${JSON.stringify(
      outbound.filter(
        (message) =>
          contexts.includes(message.context) || message.event === "showAlert",
      ),
    )}\n`,
  );
  throw error;
} finally {
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2_000)]);
  for (const client of server.clients) client.close();
  server.close();
  const failures = restoreOnce();
  if (failures.length) {
    process.stderr.write(`restore failures: ${failures.join("; ")}\n`);
    process.exitCode = 1;
  }
}
