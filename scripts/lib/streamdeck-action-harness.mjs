import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";

export const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function waitFor(
  check,
  timeout = 8_000,
  message = "event result",
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${message}`);
}

function pluginInfo() {
  return JSON.stringify({
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
}

function appendTail(current, chunk, maximumBytes = 64 * 1024) {
  const bytes = Buffer.from(current + chunk, "utf8");
  return bytes.length <= maximumBytes
    ? bytes.toString("utf8")
    : bytes.subarray(bytes.length - maximumBytes).toString("utf8");
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    delay(2_000).then(() => false),
  ]);
  if (exited) return;
  child.kill("SIGKILL");
  await Promise.race([once(child, "exit"), delay(500)]);
}

export async function createStreamDeckActionHarness({
  plugin,
  pluginContext,
  env = {},
  restore = () => [],
}) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string" || !address) {
    throw new Error("QA WebSocket server did not bind to a TCP port");
  }

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
      pluginContext,
      "-registerEvent",
      "registerPlugin",
      "-info",
      pluginInfo(),
    ],
    {
      env: { ...process.env, NODE_ENV: "development", ...env },
      cwd: resolve(dirname(plugin), ".."),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let childResult;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output = appendTail(output, chunk);
  });
  child.stderr.on("data", (chunk) => {
    output = appendTail(output, chunk);
  });
  child.once("exit", (code, signal) => {
    childResult = { code, signal };
  });

  let restored = false;
  const restoreOnce = () => {
    if (restored) return [];
    restored = true;
    return restore();
  };
  let closed = false;
  const closeTransport = async () => {
    if (closed) return restoreOnce();
    closed = true;
    for (const [signal, handler] of signalHandlers)
      process.off(signal, handler);
    await stopChild(child);
    for (const client of server.clients) client.terminate();
    await new Promise((resolvePromise) => server.close(resolvePromise));
    return restoreOnce();
  };
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
    ["SIGINT", "SIGTERM"].map((signal) => [signal, () => onSignal(signal)]),
  );
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);

  try {
    await waitFor(
      () => {
        if (childResult) {
          throw new Error(
            `Plugin exited before connecting: ${JSON.stringify(childResult)} ${output}`,
          );
        }
        return socket;
      },
      8_000,
      "the plugin connection",
    );
    await waitFor(
      () => outbound.some((message) => message.event === "registerPlugin"),
      8_000,
      "plugin registration",
    );
  } catch (error) {
    await closeTransport();
    throw error;
  }

  return {
    outbound,
    output: () => output,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    waitFor,
    close: closeTransport,
  };
}
