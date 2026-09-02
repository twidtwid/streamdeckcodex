import { existsSync } from "node:fs";
import { BUILD_INFO } from "./build-info.js";
import {
  AppServerRpcClient,
  type AppServerRpcOptions,
} from "./app-server-rpc.js";

type JsonObject = Record<string, unknown>;

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

async function initializedClient(
  options: Partial<AppServerRpcOptions> = {},
): Promise<AppServerRpcClient> {
  const client = new AppServerRpcClient({
    executable: resolveCodexBinary(),
    ...options,
  });
  try {
    await client.call("initialize", {
      clientInfo: {
        name: "streamdeck-codex-companion",
        version: BUILD_INFO.pluginVersion,
      },
      capabilities: { experimentalApi: true },
    });
    client.notify("initialized");
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function callReadOnlyAppServer(
  method: string,
  params: JsonObject = {},
  timeoutMs = 5_000,
): Promise<unknown> {
  if (!READ_ONLY_METHODS.has(method)) {
    throw new Error(
      `Refusing non-read-only Codex app-server method: ${method}`,
    );
  }
  const client = await initializedClient({ requestTimeoutMs: timeoutMs });
  try {
    return await client.call(method, params, timeoutMs);
  } finally {
    await client.close();
  }
}

export async function updateThreadSettings(
  threadId: string,
  settings: ThreadSettingsUpdate,
): Promise<void> {
  if (!threadId) throw new Error("Cannot update a Codex task without an id");
  if (!settings.model && !settings.effort) {
    throw new Error("No Codex task setting was supplied");
  }
  const client = await initializedClient();
  try {
    await client.call("thread/resume", { threadId, excludeTurns: true });
    await client.call("thread/settings/update", { threadId, ...settings });
  } finally {
    await client.close();
  }
}
