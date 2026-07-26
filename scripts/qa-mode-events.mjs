import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";

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

function native(action, mode) {
  const result = spawnSync(nativeControl, [action, ...(mode ? [mode] : [])], {
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

const initialPlan = native("mode-read", "plan");
if (initialPlan.status !== 0 || typeof initialPlan.active !== "boolean") {
  throw new Error(
    `Plan precondition unavailable: ${initialPlan.message ?? "unknown"}`,
  );
}
const fastRead = native("mode-read", "fast");
if (
  fastRead.status === 0 ||
  !String(fastRead.message).toLowerCase().includes("unsupported")
) {
  throw new Error(
    "Fast must be either visibly readable or explicitly unsupported.",
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
        message.payload?.value === mode.toUpperCase(),
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
          message.payload?.value === mode.toUpperCase(),
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
  const firstPlanFeedback = await pressMode("plan", 8, firstExpected);
  const afterFirst = native("mode-read", "plan");
  if (afterFirst.active === initialPlan.active) {
    throw new Error("First Plan press did not visibly toggle the composer.");
  }
  const secondPlanFeedback = await pressMode("plan", 8, secondExpected);
  const restoredPlan = native("mode-read", "plan");
  if (restoredPlan.active !== initialPlan.active) {
    throw new Error("Second Plan press did not visibly restore the composer.");
  }

  const planBeforeFast = restoredPlan.active;
  const fastFeedback = await pressMode("fast", 7, "UNSUPPORTED");
  const planAfterFast = native("mode-read", "plan").active;
  if (planAfterFast !== planBeforeFast) {
    throw new Error("Unsupported Fast press changed the visible Plan state.");
  }

  const calls = readFileSync(nativeLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (calls.length !== 3) {
    throw new Error(`Expected 3 native dispatches, observed ${calls.length}.`);
  }
  if (
    JSON.stringify(calls) !==
    JSON.stringify([
      ["mode-toggle", "plan"],
      ["mode-toggle", "plan"],
      ["mode-toggle", "fast"],
    ])
  ) {
    throw new Error(`Unexpected native dispatches: ${JSON.stringify(calls)}`);
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
        state: "unsupported",
        feedback: fastFeedback,
        dispatchedCommand: false,
      },
      dispatches: calls,
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
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2_000)]);
  for (const client of server.clients) client.close();
  server.close();
}
