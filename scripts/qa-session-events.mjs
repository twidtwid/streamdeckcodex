import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer } from "ws";
import { projectSessions } from "../src/lib/chat-label.ts";
import { activeDesktopThreadId } from "../src/lib/desktop-active.ts";
import { parseRolloutLines } from "../src/lib/rollout-status.ts";

const root = resolve(import.meta.dirname, "..");
const plugin = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "plugin.js",
);
const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function waitFor(check, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(100);
  }
  throw new Error("Timed out waiting for the session-navigation postcondition");
}

function openThread(threadId) {
  const result = spawnSync("/usr/bin/open", [`codex://threads/${threadId}`], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not restore the Codex task");
  }
}

const database = new DatabaseSync(join(homedir(), ".codex", "state_5.sqlite"), {
  readOnly: true,
  timeout: 1_000,
});
database.exec("PRAGMA query_only = ON");
const rows = database
  .prepare(
    `SELECT id, rollout_path, cwd, title, preview, recency_at_ms,
            reasoning_effort, model
     FROM threads
     WHERE archived = 0 AND preview <> ''
     ORDER BY recency_at_ms DESC
     LIMIT 8`,
  )
  .all();
const activeId = activeDesktopThreadId();
const snapshots = rows.map((row) => {
  const candidate = row.title || row.preview || "Untitled chat";
  const input =
    candidate.match(/<input>([\s\S]*?)<\/input>/i)?.[1] ?? candidate;
  const displayTitle =
    input
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled chat";
  return {
    id: row.id,
    rolloutPath: row.rollout_path,
    cwd: row.cwd,
    title: row.title,
    preview: row.preview,
    recencyAtMs: row.recency_at_ms,
    ...(row.reasoning_effort ? { reasoningEffort: row.reasoning_effort } : {}),
    ...(row.model ? { model: row.model } : {}),
    displayTitle,
    ...parseRolloutLines(readFileSync(row.rollout_path, "utf8")),
  };
});
const sessions = projectSessions(snapshots, activeId);
const original = sessions.find((session) => session.isActive);
if (!original) {
  throw new Error("No focused session exists in the shared eight-session list");
}
const originalIndex = sessions.findIndex(
  (session) => session.id === original.id,
);
const older = sessions[originalIndex + 1];
if (!older) {
  throw new Error("The focused session has no immediately older QA target");
}
if (
  new Set(sessions.map((session) => session.sessionLabel.toLowerCase()))
    .size !== sessions.length
) {
  throw new Error("Live session labels are not unique");
}
if (
  sessions.some(
    (session) =>
      session.sessionLabel.length > 7 ||
      session.sessionLabel.includes("...") ||
      /^[0-9a-f]{8}-/i.test(session.sessionLabel),
  )
) {
  throw new Error("A live session label exceeds the shared display contract");
}
database.close();

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
const contextSettings = new Map();
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
    if (message.event === "getSettings") {
      const settings = contextSettings.get(message.context);
      connected.send(
        JSON.stringify({
          action: "com.todd.streamdeckcodex.session-navigation",
          context: message.context,
          device: "qa-stream-deck-plus",
          event: "didReceiveSettings",
          id: message.id,
          payload: {
            controller: "Keypad",
            coordinates: {
              column: settings?.direction === "older" ? 2 : 3,
              row: 1,
            },
            isInMultiAction: false,
            resources: {},
            settings: settings ?? {},
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
    "qa-session-plugin-context",
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
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => output.push(chunk));
child.stderr.on("data", (chunk) => output.push(chunk));

function keyEvent(context, name, direction, column) {
  return {
    action: "com.todd.streamdeckcodex.session-navigation",
    context,
    device: "qa-stream-deck-plus",
    event: name,
    payload: {
      controller: "Keypad",
      coordinates: { column, row: 1 },
      isInMultiAction: false,
      resources: {},
      settings: { direction },
    },
  };
}

async function press(context, direction, column) {
  contextSettings.set(context, { direction });
  socket.send(
    JSON.stringify(keyEvent(context, "willAppear", direction, column)),
  );
  await waitFor(() =>
    outbound.some(
      (message) => message.context === context && message.event === "setImage",
    ),
  );
  socket.send(JSON.stringify(keyEvent(context, "keyDown", direction, column)));
}

try {
  await waitFor(() => socket);
  await waitFor(() =>
    outbound.some((message) => message.event === "registerPlugin"),
  );
  await press("qa-previous-session", "older", 2);
  await waitFor(() => activeDesktopThreadId() === older.id);
  await delay(900);
  await press("qa-next-session", "newer", 3);
  await waitFor(() => activeDesktopThreadId() === original.id);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      liveSessions: sessions.map((session) => ({
        slot: session.sessionIndex + 1,
        label: session.sessionLabel,
        status: session.status,
        active: session.isActive,
      })),
      previous: {
        from: original.sessionLabel,
        to: older.sessionLabel,
        observed: older.id,
      },
      next: {
        from: older.sessionLabel,
        to: original.sessionLabel,
        observed: original.id,
      },
      composerKeyboardEvents: 0,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(`${output.join("")}\n`);
  throw error;
} finally {
  if (activeDesktopThreadId() !== original.id) openThread(original.id);
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2_000)]);
  for (const client of server.clients) client.close();
  server.close();
}
