import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

type JsonObject = Record<string, unknown>;

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;
const CHATGPT_BUNDLED_CODEX =
  "/Applications/ChatGPT.app/Contents/Resources/codex";
const BUNDLED_CODEX = "/Applications/Codex.app/Contents/Resources/codex";
const HOMEBREW_CODEX = "/opt/homebrew/bin/codex";

export interface ThreadSettingsUpdate {
  model?: string;
  effort?: string;
}

export function resolveCodexBinary(): string {
  const configured = process.env["STREAMDECK_CODEX_BIN"];
  if (configured) return configured;
  if (existsSync(CHATGPT_BUNDLED_CODEX)) return CHATGPT_BUNDLED_CODEX;
  if (existsSync(BUNDLED_CODEX)) return BUNDLED_CODEX;
  if (existsSync(HOMEBREW_CODEX)) return HOMEBREW_CODEX;
  return "codex";
}

const READ_ONLY_METHODS = new Set(["account/rateLimits/read"]);

export function callReadOnlyAppServer(
  method: string,
  params: JsonObject = {},
  timeoutMs = 5_000,
): Promise<unknown> {
  if (!READ_ONLY_METHODS.has(method)) {
    return Promise.reject(
      new Error(`Refusing non-read-only Codex app-server method: ${method}`),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCodexBinary(), ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    let buffer = "";
    let settled = false;
    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill("SIGTERM");
      if (error) reject(error);
      else resolve(value);
    };
    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const timer = setTimeout(
      () => finish(new Error(`Codex app server timed out during ${method}`)),
      timeoutMs,
    );
    child.once("error", (error) => finish(error));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as RpcResponse;
          if (message.id === 1) {
            if (message.error !== undefined) {
              finish(new Error("Codex app-server initialization failed"));
              return;
            }
            send({ method: "initialized", params: {} });
            send({ method, id: 2, params });
          } else if (message.id === 2) {
            if (message.error !== undefined) {
              finish(new Error(`Codex app server rejected ${method}`));
            } else {
              finish(undefined, message.result);
            }
          }
        } catch {
          // Ignore tracing lines and wait for the bounded response.
        }
      }
    });
    send({
      method: "initialize",
      id: 1,
      params: {
        clientInfo: {
          name: "streamdeck-codex-companion",
          version: "0.1.0",
        },
      },
    });
  });
}

export async function updateThreadSettings(
  threadId: string,
  settings: ThreadSettingsUpdate,
): Promise<void> {
  if (!threadId) throw new Error("Cannot update a Codex task without an id");
  if (!settings.model && !settings.effort) {
    throw new Error("No Codex task setting was supplied");
  }

  const child = spawn(resolveCodexBinary(), ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  const failAll = (error: Error): void => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  };

  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_096);
  });
  child.once("error", failAll);
  child.once("exit", (code) => {
    if (pending.size > 0) {
      failAll(
        new Error(
          `Codex app server exited with ${code ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    }
  });
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;

      let response: RpcResponse;
      try {
        response = JSON.parse(line) as RpcResponse;
      } catch {
        continue;
      }
      if (typeof response.id !== "number") continue;
      const request = pending.get(response.id);
      if (!request) continue;
      clearTimeout(request.timeout);
      pending.delete(response.id);
      if (response.error !== undefined) {
        request.reject(
          new Error(
            `Codex app server rejected request: ${JSON.stringify(response.error)}`,
          ),
        );
      } else {
        request.resolve(response.result);
      }
    }
  });

  const call = (method: string, params: JsonObject): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex app server timed out during ${method}`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  };

  try {
    await call("initialize", {
      clientInfo: {
        name: "streamdeck-codex-companion",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(
      `${JSON.stringify({ method: "initialized", params: {} })}\n`,
    );
    await call("thread/resume", { threadId, excludeTurns: true });
    await call("thread/settings/update", { threadId, ...settings });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 100));
    child.stdin.end();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    failAll(new Error("Codex app server request ended"));
  }
}
