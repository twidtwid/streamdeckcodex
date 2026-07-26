import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
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
const controlScript = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "scripts",
  "codex-control.applescript",
);
const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function native(action) {
  const result = spawnSync(nativeControl, [action], { encoding: "utf8" });
  const parsed = JSON.parse(result.stdout.trim());
  if (result.status !== 0 || !parsed.ok) {
    throw new Error(parsed.message || `Native ${action} failed`);
  }
  return parsed;
}

function slash(value) {
  const result = spawnSync(
    "/usr/bin/osascript",
    [controlScript, "slash", value],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Slash ${value} failed`);
  }
}

async function waitFor(check, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Timed out waiting for the Plan event result");
}

if (native("plan-read").plan) {
  slash("/plan");
  await delay(600);
}
if (native("plan-read").plan) {
  throw new Error("Could not establish a non-Plan precondition");
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
    "qa-plan-plugin-context",
    "-registerEvent",
    "registerPlugin",
    "-info",
    info,
  ],
  {
    env: { ...process.env, NODE_ENV: "development" },
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

  const action = "com.todd.streamdeckcodex.command";
  const context = "qa-plan-command";
  const settings = { commandIndex: 8 };
  const basePayload = {
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
      payload: basePayload,
    }),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" &&
        message.context === context &&
        message.payload?.value === "PLAN",
    ),
  );
  socket.send(
    JSON.stringify({
      action,
      context,
      device: "qa-stream-deck-plus",
      event: "dialUp",
      payload: basePayload,
    }),
  );
  const resultFeedback = await waitFor(() =>
    outbound.findLast(
      (message) =>
        message.event === "setFeedback" &&
        message.context === context &&
        (message.payload?.title === "ACTIVE" ||
          message.payload?.title === "FAILED") &&
        message.payload?.value === "PLAN",
    ),
  );
  if (resultFeedback.payload?.title !== "ACTIVE") {
    throw new Error(
      `Plan event returned ${JSON.stringify(resultFeedback.payload)}`,
    );
  }
  if (!native("plan-read").plan) {
    throw new Error("Plan event did not visibly activate Plan mode");
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      event: "dialUp",
      dispatchCount: 1,
      plan: true,
      feedback: resultFeedback.payload,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${output.join("")}\n${JSON.stringify(
      outbound.filter(
        (message) =>
          message.context === "qa-plan-command" ||
          message.event === "showAlert",
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
