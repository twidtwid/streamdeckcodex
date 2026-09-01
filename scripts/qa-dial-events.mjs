import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";
import {
  restoreLiveState,
  selectionPayload,
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
if (!activeThreadId) {
  throw new Error("Connected dial QA requires one focused primary Codex task.");
}
const cache = JSON.parse(
  readFileSync(resolve(homedir(), ".codex", "models_cache.json"), "utf8"),
);
const effortLabels = {
  none: "None",
  minimal: "Minimal",
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  ultra: "Ultra",
};
const capabilities = ["luna", "terra", "sol"].flatMap((family) => {
  const model = cache.models?.find(
    (candidate) =>
      typeof candidate.slug === "string" &&
      candidate.slug.toLowerCase().endsWith(`-${family}`),
  );
  if (!model) return [];
  const reasoning = (model.supported_reasoning_levels ?? [])
    .map((entry) => entry.effort)
    .filter((effort) => effortLabels[effort]);
  return reasoning.length
    ? [
        {
          slug: model.slug,
          family,
          label: family[0].toUpperCase() + family.slice(1),
          reasoning,
        },
      ]
    : [];
});
if (capabilities.length < 2) {
  throw new Error("Connected dial QA requires at least two supported models.");
}
const initialPicker = native("read", undefined, activeThreadId);
const initialModelSelection = capabilities.find((option) =>
  initialPicker.model?.toLowerCase().includes(option.family),
);
const initialReasoningSelection = Object.entries(effortLabels).find(
  ([, label]) => label === initialPicker.effort,
);
if (!initialModelSelection || !initialReasoningSelection) {
  throw new Error(
    "Connected dial QA cannot prove restoration of the current picker state.",
  );
}
const initialState = snapshotLiveState(native, activeThreadId, {
  model: {
    value: initialModelSelection.slug,
    label: initialModelSelection.label,
  },
  reasoning: {
    value: initialReasoningSelection[0],
    label: initialReasoningSelection[1],
  },
});
const composer = native("composer-read", undefined, activeThreadId);
if (composer.draftEmpty !== true) {
  throw new Error(
    "Connected dial QA refused a nonempty or unverifiable draft.",
  );
}
const initialPlan = initialState.plan;
if (initialPlan) {
  native("mode-toggle", "plan", activeThreadId);
}
if (native("mode-read", "plan", activeThreadId).active) {
  throw new Error("Could not establish a non-Plan QA precondition");
}
const baseModel = capabilities.at(-1);
const modelTarget = capabilities.at(-2);
if (!baseModel || !modelTarget) throw new Error("No reversible model pair.");
const baseReasoningIndex = Math.min(1, baseModel.reasoning.length - 1);
const baseReasoning = baseModel.reasoning[baseReasoningIndex];
const reasoningTarget = baseModel.reasoning[baseReasoningIndex - 1];
if (!baseReasoning || !reasoningTarget) {
  throw new Error("Connected dial QA requires two reasoning levels.");
}
native(
  "model",
  selectionPayload(baseModel.slug, baseModel.label),
  activeThreadId,
);
native(
  "reasoning",
  selectionPayload(baseReasoning, effortLabels[baseReasoning]),
  activeThreadId,
);

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
  const modelBeforeRotate = native("read", undefined, activeThreadId).model;
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
        message.payload?.selectedModel === modelTarget.slug,
    ),
  );
  if (native("read", undefined, activeThreadId).model !== modelBeforeRotate) {
    throw new Error("Model rotation mutated Codex before dial press");
  }
  socket.send(JSON.stringify(event(modelAction, modelContext, "dialUp")));
  await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === modelContext &&
          message.payload?.title === "MODEL" &&
          message.payload?.value === modelTarget.label.toUpperCase(),
      ),
    12_000,
  );
  if (
    !native("read", undefined, activeThreadId)
      .model?.toLowerCase()
      .includes(modelTarget.family)
  ) {
    throw new Error(`Model dial did not visibly apply ${modelTarget.label}`);
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
  const reasoningBeforeRotate = native(
    "read",
    undefined,
    activeThreadId,
  ).effort;
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
        message.payload?.selectedLevel === reasoningTarget,
    ),
  );
  if (
    native("read", undefined, activeThreadId).effort !== reasoningBeforeRotate
  ) {
    throw new Error("Reasoning rotation mutated Codex before dial press");
  }
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
          message.payload?.value ===
            effortLabels[reasoningTarget].toUpperCase(),
      ),
    12_000,
  );
  if (
    native("read", undefined, activeThreadId).effort !==
    effortLabels[reasoningTarget]
  ) {
    throw new Error(
      `Reasoning dial did not visibly apply ${effortLabels[reasoningTarget]}`,
    );
  }

  const modelActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === modelContext &&
      message.payload?.title === "MODEL" &&
      message.payload?.value === modelTarget.label.toUpperCase(),
  );
  const reasoningActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === reasoningContext &&
      message.payload?.title === "EFFORT" &&
      message.payload?.value === effortLabels[reasoningTarget].toUpperCase(),
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
  if (!native("mode-read", "plan", activeThreadId).active) {
    throw new Error("Plan control did not visibly activate Plan mode");
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      model: native("read", undefined, activeThreadId).model,
      effort: native("read", undefined, activeThreadId).effort,
      plan: native("mode-read", "plan", activeThreadId).active,
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
