import { spawn } from "node:child_process";
import { once } from "node:events";
import { WebSocketServer } from "ws";

const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function startKeypadTransport({
  plugin,
  cwd,
  node = process.execPath,
  environment,
}) {
  // This is an SDK-protocol transport for isolated handler probes. It does
  // not establish foreground task identity, visual hardware evidence, or
  // cleanup; callers must never treat its messages as connected release PASS.
  // An explicit proxy is required so this partial probe cannot drive a live
  // Codex task while its cleanup contract remains incomplete.
  if (!environment?.CODEX_UI_CONTROL) {
    throw new Error(
      "Keypad probe requires an explicit test-native CODEX_UI_CONTROL proxy.",
    );
  }
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Keypad QA socket did not bind.");
  const outbound = [];
  let socket;
  server.on("connection", (connected) => {
    socket = connected;
    connected.on("message", (data) => {
      const message = JSON.parse(data.toString());
      outbound.push(message);
      if (message.event === "getGlobalSettings") {
        connected.send(
          JSON.stringify({
            event: "didReceiveGlobalSettings",
            payload: { settings: {} },
          }),
        );
      }
    });
  });
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
        name: "QA Stream Deck Plus",
        size: { columns: 4, rows: 2 },
        type: 7,
      },
    ],
    plugin: { uuid: "com.todd.streamdeckcodex", version: "0.1.0.0" },
  });
  const child = spawn(
    node,
    [
      plugin,
      "-port",
      String(address.port),
      "-pluginUUID",
      "qa-keypad-context",
      "-registerEvent",
      "registerPlugin",
      "-info",
      info,
    ],
    {
      cwd,
      env: { ...process.env, NODE_ENV: "development", ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  const waitFor = async (check, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await delay(25);
    }
    throw new Error(`Timed out waiting for Keypad handler: ${output.join("")}`);
  };
  await waitFor(() => socket);
  await waitFor(() =>
    outbound.some((message) => message.event === "registerPlugin"),
  );
  let counter = 0;
  return {
    evidenceScope: "non-release-probe",
    async press(row) {
      const context = `qa-keypad-${counter++}`;
      const [column, rowIndex] = row.position.split(",").map(Number);
      const payload = {
        controller: "Keypad",
        coordinates: { column, row: rowIndex },
        isInMultiAction: false,
        resources: {},
        settings: row.settings,
      };
      socket.send(
        JSON.stringify({
          action: row.uuid,
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
            (message.event === "setImage" || message.event === "setTitle"),
        ),
      );
      const before = outbound.length;
      socket.send(
        JSON.stringify({
          action: row.uuid,
          context,
          device: "qa-stream-deck-plus",
          event: "keyDown",
          payload,
        }),
      );
      if (row.settings.commandId === "dictate") {
        socket.send(
          JSON.stringify({
            action: row.uuid,
            context,
            device: "qa-stream-deck-plus",
            event: "keyUp",
            payload,
          }),
        );
      }
      await delay(100);
      return outbound
        .slice(before)
        .filter((message) => message.context === context);
    },
    async close() {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(2_000)]);
      for (const client of server.clients) client.close();
      server.close();
    },
  };
}
