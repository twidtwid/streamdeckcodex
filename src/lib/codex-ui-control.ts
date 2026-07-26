import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable =
  process.env["CODEX_UI_CONTROL"] ??
  resolve(pluginRoot, "bin", "codex-ui-control");

export interface LivePickerState {
  model?: string;
  effort?: string;
}

interface NativeControlResult extends LivePickerState {
  ok: boolean;
  action: string;
  requested?: string;
  mode?: CodexMode;
  active?: boolean;
  pendingInput?: boolean;
  inputKind?: "approval";
  inputTitle?: string;
  message: string;
}

function invoke(
  action:
    "read" | "model" | "reasoning" | "input-read" | "mode-read" | "mode-toggle",
  requested?: string,
  timeoutMs?: number,
): Promise<NativeControlResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      executable,
      [action, ...(requested ? [requested] : [])],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill(), timeoutMs);
    timeout?.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (timeout) clearTimeout(timeout);
      let result: NativeControlResult | undefined;
      try {
        result = JSON.parse(stdout.trim()) as NativeControlResult;
      } catch {
        // Preserve the native diagnostic below.
      }
      if (code === 0 && result?.ok) {
        resolvePromise(result);
        return;
      }
      reject(
        new Error(
          result?.message ||
            stderr.trim() ||
            `Live Codex picker control exited with ${code ?? "unknown status"}`,
        ),
      );
    });
  });
}

export interface LiveInputState {
  pending: boolean;
  kind?: "approval";
  title?: string;
}

export async function readLiveInputState(): Promise<
  LiveInputState | undefined
> {
  try {
    const parsed = await invoke("input-read", undefined, 1_200);
    if (typeof parsed.pendingInput !== "boolean") return undefined;
    return {
      pending: parsed.pendingInput,
      ...(parsed.inputKind === "approval" ? { kind: parsed.inputKind } : {}),
      ...(parsed.inputTitle?.trim() ? { title: parsed.inputTitle.trim() } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function readLivePicker(): Promise<LivePickerState> {
  return invoke("read");
}

export type CodexMode = "plan" | "fast";

export interface LiveModeState {
  mode: CodexMode;
  active: boolean;
}

function verifiedModeResult(
  requested: CodexMode,
  result: NativeControlResult,
): LiveModeState {
  if (result.mode !== requested || typeof result.active !== "boolean") {
    throw new Error(
      `The visible Codex composer returned no verified ${requested} state.`,
    );
  }
  return { mode: requested, active: result.active };
}

export async function readLiveMode(mode: CodexMode): Promise<LiveModeState> {
  return verifiedModeResult(mode, await invoke("mode-read", mode));
}

export async function toggleLiveMode(mode: CodexMode): Promise<LiveModeState> {
  return verifiedModeResult(mode, await invoke("mode-toggle", mode));
}

export async function applyLiveModel(slug: string): Promise<LivePickerState> {
  return invoke("model", slug);
}

export async function applyLiveReasoning(
  level: string,
): Promise<LivePickerState> {
  return invoke("reasoning", level);
}

export function pickerFailureLabel(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("accessibility")) return "NO ACCESS";
  if (message.includes("busy")) return "CODEX BUSY";
  if (message.includes("unavailable")) return "OPEN CHAT";
  if (message.includes("does not offer")) return "NOT OFFERED";
  if (message.includes("draft")) return "HAS DRAFT";
  if (message.includes("unsupported")) return "UNSUPPORTED";
  if (message.includes("did not confirm")) return "VERIFY FAIL";
  if (message.includes("foreground")) return "FOCUS FAIL";
  return "APPLY FAIL";
}
