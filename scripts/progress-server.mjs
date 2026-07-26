import { createServer } from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dashboard = join(root, "dashboard");
const activityPath = join(dashboard, "activity.jsonl");
const port = Number.parseInt(process.env.CODEX_PROGRESS_PORT || "4317", 10);
const host = "127.0.0.1";
let appendQueue = Promise.resolve();
let activityLeaseUntil = 0;
let latestWorkLine = "Build work continues.";

const types = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function sendFile(response, path, type) {
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": type,
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error?.code === "ENOENT" ? "Not found\n" : "Server error\n");
  }
}

function sendJson(response, value, status = 200) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function activityEntries() {
  try {
    const content = await readFile(activityPath, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-240)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function appendActivity(line, kind = "transition") {
  const clean = String(line).replace(/\s+/g, " ").trim().slice(0, 500);
  if (!clean) return Promise.reject(new Error("Activity line is empty"));
  if (kind === "transition") {
    latestWorkLine = clean;
    activityLeaseUntil = Date.now() + 5 * 60_000;
  }
  const entry = {
    at: new Date().toISOString(),
    kind,
    line: clean,
  };
  appendQueue = appendQueue.then(() =>
    appendFile(activityPath, `${JSON.stringify(entry)}\n`, "utf8"),
  );
  return appendQueue.then(() => entry);
}

async function combinedStatus() {
  const status = JSON.parse(
    await readFile(join(dashboard, "status.json"), "utf8"),
  );
  return { ...status, activity: await activityEntries() };
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "POST" && url.pathname === "/api/activity") {
    try {
      const body = await readRequestJson(request);
      const entry = await appendActivity(body.line, body.kind);
      sendJson(response, { ok: true, entry }, 201);
    } catch (error) {
      sendJson(
        response,
        { ok: false, error: error?.message || "Invalid request" },
        400,
      );
    }
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await sendFile(response, join(dashboard, "index.html"), types[".html"]);
    return;
  }
  if (url.pathname === "/api/status" || url.pathname === "/status.json") {
    try {
      sendJson(response, await combinedStatus());
    } catch {
      sendJson(response, { error: "Status unavailable" }, 500);
    }
    return;
  }
  if (url.pathname === "/healthz") {
    sendJson(response, {
      ok: true,
      activityEntries: (await activityEntries()).length,
    });
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
});

server.listen(port, host, () => {
  console.log(`Codex Companion live activity: http://${host}:${port}/`);
  void appendActivity(
    "Live activity transport started — transition updates and 25-second heartbeats are active.",
    "system",
  );
});

const heartbeat = setInterval(async () => {
  try {
    if (Date.now() > activityLeaseUntil) return;
    await appendActivity(`Still working — ${latestWorkLine}`, "heartbeat");
  } catch {
    // A failed heartbeat must not terminate the dashboard process.
  }
}, 25_000);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
  });
}
