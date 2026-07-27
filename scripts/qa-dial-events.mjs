import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";
import {
  restoreLiveState,
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
const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function native(action, value, threadId) {
  const values = [action];
  if (value !== undefined || threadId) values.push(value ?? "");
  if (threadId) values.push(threadId);
  const result = spawnSync(nativeControl, values, {
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout.trim());
  if (result.status !== 0 || !parsed.ok) {
    throw new Error(parsed.message || `Native ${action} failed`);
  }
  return parsed;
}

function event(action, context, name, payload = {}) {
  return {
    action,
    context,
    device: "qa-stream-deck-plus",
    event: name,
    payload: {
      controller: "Encoder",
      coordinates: { column: action.endsWith("model") ? 2 : 3, row: 0 },
      isInMultiAction: false,
      resources: {},
      settings: {},
      ...payload,
    },
  };
}

async function waitFor(check, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Timed out waiting for the plugin event result");
}

const activeThreadId = activeForegroundThreadId();
const initialState = snapshotLiveState(native, activeThreadId);
const initialPlan = initialState.plan;
if (initialPlan) {
  native("mode-toggle", "plan");
}
if (native("mode-read", "plan").active) {
  throw new Error("Could not establish a non-Plan QA precondition");
}
native("model", "gpt-5.6-sol");
native("reasoning", "medium");

const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(server, "listening");
const address = server.address();
if (typeof address === "string" || !address) {
  throw new Error("QA WebSocket server did not bind to a TCP port");
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
    "qa-plugin-context",
    "-registerEvent",
    "registerPlugin",
    "-info",
    info,
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
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

  const modelAction = "com.todd.streamdeckcodex.model";
  const modelContext = "qa-model-dial";
  socket.send(JSON.stringify(event(modelAction, modelContext, "willAppear")));
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" && message.context === modelContext,
    ),
  );
  socket.send(
    JSON.stringify(
      event(modelAction, modelContext, "dialRotate", { ticks: -1 }),
    ),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setSettings" &&
        message.context === modelContext &&
        message.payload?.selectedModel === "gpt-5.6-terra",
    ),
  );
  socket.send(JSON.stringify(event(modelAction, modelContext, "dialUp")));
  await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === modelContext &&
          message.payload?.title === "MODEL" &&
          message.payload?.value === "TERRA",
      ),
    12_000,
  );
  if (native("read").model !== "5.6 Terra") {
    throw new Error("Model dial did not visibly apply Terra");
  }

  const reasoningAction = "com.todd.streamdeckcodex.reasoning";
  const reasoningContext = "qa-reasoning-dial";
  socket.send(
    JSON.stringify(event(reasoningAction, reasoningContext, "willAppear")),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" && message.context === reasoningContext,
    ),
  );
  socket.send(
    JSON.stringify(
      event(reasoningAction, reasoningContext, "dialRotate", { ticks: -1 }),
    ),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setSettings" &&
        message.context === reasoningContext &&
        message.payload?.selectedLevel === "low",
    ),
  );
  socket.send(
    JSON.stringify(event(reasoningAction, reasoningContext, "dialUp")),
  );
  await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === reasoningContext &&
          message.payload?.title === "EFFORT" &&
          message.payload?.value === "LIGHT",
      ),
    12_000,
  );
  if (native("read").effort !== "Light") {
    throw new Error("Reasoning dial did not visibly apply Light");
  }

  const modelActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === modelContext &&
      message.payload?.title === "MODEL" &&
      message.payload?.value === "TERRA",
  );
  const reasoningActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === reasoningContext &&
      message.payload?.title === "EFFORT" &&
      message.payload?.value === "LIGHT",
  );
  if (!modelActive || !reasoningActive) {
    throw new Error("The dials did not emit verified steady-state feedback");
  }

  const commandAction = "com.todd.streamdeckcodex.command";
  const planContext = "qa-plan-command";
  const planSettings = { commandIndex: 1 };
  socket.send(
    JSON.stringify(
      event(commandAction, planContext, "willAppear", {
        settings: planSettings,
      }),
    ),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" &&
        message.context === planContext &&
        message.payload?.value === "Plan",
    ),
  );
  socket.send(
    JSON.stringify(
      event(commandAction, planContext, "dialUp", {
        settings: planSettings,
      }),
    ),
  );
  const planActive = await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === planContext &&
          message.payload?.title === "ACTIVE" &&
          message.payload?.value === "Plan",
      ),
    12_000,
  );
  if (!native("mode-read", "plan").active) {
    throw new Error("Plan control did not visibly activate Plan mode");
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      model: native("read").model,
      effort: native("read").effort,
      plan: native("mode-read", "plan").active,
      modelFeedback: modelActive.payload,
      reasoningFeedback: reasoningActive.payload,
      planFeedback: planActive.payload,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(`${output.join("")}\n`);
  throw error;
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2_000)]);
  for (const client of server.clients) client.close();
  server.close();
  const failures = restoreLiveState(native, initialState);
  if (failures.length) {
    process.stderr.write(`restore failures: ${failures.join("; ")}\n`);
    process.exitCode = 1;
  }
}
