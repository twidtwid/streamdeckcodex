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
  approvalMode?: CodexApprovalMode;
  pendingInput?: boolean;
  draftEmpty?: boolean;
  inputKind?: "approval";
  inputTitle?: string;
  conversationId?: string;
  rendererWindowId?: string;
  witnessToken?: string;
  reasonCode?: NativeFailureCode;
  message: string;
}

export type NativeFailureCode =
  | "NO_FOCUS"
  | "DRAFT_PRESENT"
  | "TARGET_MISMATCH"
  | "UNAVAILABLE"
  | "UNCHANGED"
  | "TIMEOUT"
  | "UNKNOWN";

export function encodeNativePayload(value: unknown): string {
  // Foundation's Data(base64Encoded:) consistently accepts padded standard
  // Base64, unlike Node's unpadded base64url representation.
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

class NativeControlError extends Error {
  readonly reasonCode: NativeFailureCode;

  constructor(message: string, reasonCode?: string) {
    super(message);
    this.reasonCode = isNativeFailureCode(reasonCode) ? reasonCode : "UNKNOWN";
  }
}

function isNativeFailureCode(value: unknown): value is NativeFailureCode {
  return [
    "NO_FOCUS",
    "DRAFT_PRESENT",
    "TARGET_MISMATCH",
    "UNAVAILABLE",
    "UNCHANGED",
    "TIMEOUT",
    "UNKNOWN",
  ].includes(value as NativeFailureCode);
}

function invoke(
  action:
    | "read"
    | "model"
    | "reasoning"
    | "composer-read"
    | "mode-read"
    | "mode-toggle"
    | "approval-cycle"
    | "dispatch"
    | "new-project"
    | "workflow"
    | "route"
    | "target-check"
    | "target-verify",
  requested?: string,
  timeoutMs?: number,
  threadId?: string,
  executablePath = executable,
  spawnProcess: typeof spawn = spawn,
): Promise<NativeControlResult> {
  return new Promise((resolvePromise, reject) => {
    const args = [
      action,
      ...(requested !== undefined || threadId ? [requested ?? ""] : []),
      ...(threadId ? [threadId] : []),
    ];
    const child = spawnProcess(executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let exited = false;
    let closed = false;
    let exitCode: number | null = null;
    const effectiveTimeoutMs = timeoutMs ?? 5_000;
    let timedOut = false;
    let terminationGrace: ReturnType<typeof setTimeout> | undefined;
    let postKillDeadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      terminationGrace = setTimeout(() => {
        child.kill("SIGKILL");
        // A hostile child can keep stdio open after the process signal.  Do
        // not leave a Stream Deck action pending forever: this is the final
        // bounded reap deadline, and `settle` makes later exit/close inert.
        postKillDeadline = setTimeout(() => {
          settle(
            new NativeControlError("Live Codex control timed out.", "TIMEOUT"),
          );
        }, 500);
        postKillDeadline.unref();
      }, 250);
      terminationGrace.unref();
    }, effectiveTimeoutMs);
    timeout.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const cleanup = (): void => {
      clearTimeout(timeout);
      if (terminationGrace) clearTimeout(terminationGrace);
      if (postKillDeadline) clearTimeout(postKillDeadline);
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
    };
    const settle = (error?: Error, result?: NativeControlResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolvePromise(result!);
    };
    const settleTimeoutAfterClose = (): void => {
      if (timedOut && exited && closed) {
        settle(
          new NativeControlError("Live Codex control timed out.", "TIMEOUT"),
        );
      }
    };
    const finish = (): void => {
      if (settled || !exited || !closed) return;
      if (timedOut) {
        settleTimeoutAfterClose();
        return;
      }
      let result: NativeControlResult | undefined;
      try {
        result = JSON.parse(stdout.trim()) as NativeControlResult;
      } catch {
        // Preserve the native diagnostic below.
      }
      if (exitCode === 0 && result?.ok) {
        settle(undefined, result);
        return;
      }
      settle(
        new NativeControlError(
          result?.message ||
            stderr.trim() ||
            `Live Codex picker control exited with ${exitCode ?? "unknown status"}`,
          result?.reasonCode,
        ),
      );
    };
    child.once("error", (error) => settle(error));
    child.once("exit", (code) => {
      exited = true;
      exitCode = code;
      finish();
    });
    child.once("close", () => {
      closed = true;
      finish();
    });
  });
}

// Deliberately narrow test seam: it exercises the production child lifecycle
// with a real executable while keeping the public action API unchanged.
export const __nativeControlTest = {
  invoke,
  invokeWithExecutable(
    action: Parameters<typeof invoke>[0],
    executablePath: string,
    timeoutMs: number,
  ): Promise<NativeControlResult> {
    return invoke(action, undefined, timeoutMs, undefined, executablePath);
  },
  invokeWithSpawn(
    action: Parameters<typeof invoke>[0],
    timeoutMs: number,
    spawnProcess: typeof spawn,
  ): Promise<NativeControlResult> {
    return invoke(
      action,
      undefined,
      timeoutMs,
      undefined,
      executable,
      spawnProcess,
    );
  },
};

export interface LiveComposerState {
  pendingInput: boolean;
  draftEmpty?: boolean;
  inputKind?: "approval";
  inputTitle?: string;
  approvalMode?: CodexApprovalMode;
  conversationId: string;
  rendererWindowId: string;
}

export async function readLiveComposerState(
  threadId: string,
): Promise<LiveComposerState | undefined> {
  const parsed = await invoke("composer-read", undefined, 1_200, threadId);
  if (
    typeof parsed.pendingInput !== "boolean" ||
    parsed.conversationId !== threadId ||
    !parsed.conversationId?.trim() ||
    !parsed.rendererWindowId?.trim()
  )
    return undefined;
  return {
    pendingInput: parsed.pendingInput,
    ...(typeof parsed.draftEmpty === "boolean"
      ? { draftEmpty: parsed.draftEmpty }
      : {}),
    ...(parsed.inputKind === "approval" ? { inputKind: parsed.inputKind } : {}),
    ...(parsed.inputTitle?.trim()
      ? { inputTitle: parsed.inputTitle.trim() }
      : {}),
    ...(parsed.approvalMode ? { approvalMode: parsed.approvalMode } : {}),
    conversationId: parsed.conversationId,
    rendererWindowId: parsed.rendererWindowId,
  };
}

export async function readLivePicker(): Promise<LivePickerState> {
  return invoke("read");
}

export type CodexMode = "plan" | "fast";
export type CodexApprovalMode = "ask" | "approve" | "yolo" | "custom";

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

export async function readLiveMode(
  mode: CodexMode,
  threadId: string,
): Promise<LiveModeState> {
  return verifiedModeResult(
    mode,
    await invoke("mode-read", mode, undefined, threadId),
  );
}

export async function toggleLiveMode(
  mode: CodexMode,
  threadId: string,
): Promise<LiveModeState> {
  return verifiedModeResult(
    mode,
    await invoke("mode-toggle", mode, undefined, threadId),
  );
}

export async function cycleLiveApprovalMode(
  threadId: string,
): Promise<LiveComposerState> {
  const result = await invoke("approval-cycle", undefined, 10_000, threadId);
  if (
    !result.approvalMode ||
    result.conversationId !== threadId ||
    !result.conversationId?.trim() ||
    !result.rendererWindowId?.trim()
  ) {
    throw new Error(
      "The visible Codex composer returned no cycled approval mode.",
    );
  }
  return {
    pendingInput: result.pendingInput ?? false,
    ...(result.inputKind === "approval" ? { inputKind: result.inputKind } : {}),
    ...(result.inputTitle?.trim()
      ? { inputTitle: result.inputTitle.trim() }
      : {}),
    approvalMode: result.approvalMode,
    conversationId: result.conversationId,
    rendererWindowId: result.rendererWindowId,
  };
}

export async function applyLiveModel(
  slug: string,
  pickerLabel: string,
  threadId: string,
): Promise<LivePickerState> {
  return invoke(
    "model",
    encodeNativePayload({ value: slug, label: pickerLabel }),
    undefined,
    threadId,
  );
}

export async function applyLiveReasoning(
  level: string,
  pickerLabel: string,
  threadId: string,
): Promise<LivePickerState> {
  return invoke(
    "reasoning",
    encodeNativePayload({ value: level, label: pickerLabel }),
    undefined,
    threadId,
  );
}

export async function dispatchLiveControl(
  mode: "shortcut" | "slash",
  value: string,
  threadId: string,
): Promise<void> {
  await invoke("dispatch", `${mode}:${value}`, undefined, threadId);
}

export async function openLiveNewProject(threadId: string): Promise<void> {
  await invoke("new-project", undefined, 7_000, threadId);
}

export async function launchLiveWorkflow(
  prompt: string,
  cwd: string,
  databasePath: string,
  sourceThreadId: string,
): Promise<void> {
  const requested = encodeNativePayload({
    prompt,
    cwd,
    databasePath,
    sourceThreadId,
  });
  await invoke("workflow", requested, 8_000);
}

export async function openLiveRoute(
  route: "new-chat" | "skills",
  path?: string,
  databasePath?: string,
): Promise<void> {
  const requested = encodeNativePayload({ route, path, databasePath });
  await invoke("route", requested, 7_000);
}

export async function verifyLiveTarget(threadId: string): Promise<string> {
  const result = await invoke("target-check", undefined, undefined, threadId);
  if (!result.witnessToken) {
    throw new Error("Codex returned no exact focused window witness.");
  }
  return result.witnessToken;
}

export async function verifyLiveTargetAtMutation(
  witnessToken: string,
): Promise<void> {
  await invoke("target-verify", witnessToken);
}

export function pickerFailureLabel(error: unknown): string {
  if (error instanceof NativeControlError) {
    return {
      NO_FOCUS: "OPEN CHAT",
      DRAFT_PRESENT: "HAS DRAFT",
      TARGET_MISMATCH: "FOCUS FAIL",
      UNAVAILABLE: "NOT OFFERED",
      UNCHANGED: "VERIFY FAIL",
      TIMEOUT: "TIMEOUT",
      UNKNOWN: "APPLY FAIL",
    }[error.reasonCode];
  }
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
