import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandDefinition } from "./commands.js";
import type { WorkflowDefinition } from "./workflows.js";
import { resolveStateDatabase } from "./codex-store.js";
import {
  applyLiveModel,
  applyLiveReasoning,
  dispatchLiveControl,
  toggleLiveMode,
  openLiveNewProject,
  launchLiveWorkflow,
  openLiveRoute,
  type CodexMode,
  type LiveModeState,
  type LivePickerState,
  verifyLiveTarget,
} from "./codex-ui-control.js";
import {
  InputReleaseGuard,
  type InputReleaseReason,
  type InputReleaseResult,
} from "./input-release-guard.js";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const controlScript = resolve(
  pluginRoot,
  "scripts",
  "codex-control.applescript",
);
const pttGuardScript = resolve(pluginRoot, "scripts", "ptt-guard.mjs");
let pttGuard: ChildProcess | undefined;
let pttOperation: Promise<void> = Promise.resolve();
const inputReleaseGuard = new InputReleaseGuard();

function run(
  executable: string,
  args: readonly string[],
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], {
      stdio: "ignore",
      windowsHide: true,
    });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolvePromise();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${executable} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code === 0) finish();
      else
        finish(
          new Error(`${executable} exited with code ${code ?? "unknown"}`),
        );
    });
  });
}

export async function openCodexUrl(url: string): Promise<void> {
  if (!url.startsWith("codex://")) throw new Error("Refusing non-Codex URL");
  await run("/usr/bin/open", [url]);
}

export async function runControl(
  mode: string,
  ...values: readonly string[]
): Promise<void> {
  await run("/usr/bin/osascript", [controlScript, mode, ...values]);
}

export async function executeCommand(
  command: CommandDefinition,
  threadId?: string,
): Promise<LiveModeState | undefined> {
  if (command.mode === "deep-link") {
    if (command.id === "new-chat") await openNewChat();
    else if (command.id === "skills") await openSkills();
    else
      throw new Error(`Unsupported verified deep-link command: ${command.id}`);
    return undefined;
  }
  if (!threadId) {
    throw new Error("No focused Codex task is available.");
  }
  if (command.mode === "mode-toggle") {
    return toggleLiveMode(command.value as CodexMode, threadId);
  }
  if (command.mode !== "shortcut" && command.mode !== "slash") {
    throw new Error(`Unsupported task-scoped command mode: ${command.mode}`);
  }
  await dispatchLiveControl(command.mode, command.value, threadId);
  return undefined;
}

export async function endDictation(): Promise<void> {
  const result = await serializePtt(() => releaseDictationNow("user-release"));
  if (!result.ok) throw new Error("Failed to release push-to-talk input");
}

export function cleanupDictation(
  reason: Exclude<InputReleaseReason, "user-release">,
): Promise<InputReleaseResult> {
  return serializePtt(() => releaseDictationNow(reason));
}

export function inputReleaseSnapshot() {
  return inputReleaseGuard.snapshot();
}

export async function startDictation(threadId: string): Promise<void> {
  return serializePtt(async () => {
    const previous = await releaseDictationNow("restart");
    if (!previous.ok) {
      throw new Error(
        "Could not safely release the previous push-to-talk state",
      );
    }
    const witnessToken = await verifyLiveTarget(threadId);

    const child = spawn(process.execPath, [pttGuardScript, controlScript], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
      env: {
        ...process.env,
        STREAMDECK_PTT_TARGET_RUNNER: resolve(
          pluginRoot,
          "bin",
          "codex-ui-control",
        ),
        STREAMDECK_PTT_WITNESS_TOKEN: witnessToken,
      },
    });
    pttGuard = child;
    inputReleaseGuard.markHeld("restart");
    child.stdout?.setEncoding("utf8");

    try {
      await new Promise<void>((resolvePromise, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timed out starting guarded push-to-talk"));
        }, 5_000);
        const finish = (error?: Error): void => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolvePromise();
        };
        child.once("error", finish);
        child.once("exit", (code) => {
          finish(
            new Error(
              `Push-to-talk guard exited before ready with ${code ?? "unknown"}`,
            ),
          );
        });
        child.stdout?.once("data", (chunk: string) => {
          if (chunk.includes("READY")) finish();
          else finish(new Error("Push-to-talk guard returned no ready signal"));
        });
      });
    } catch (error) {
      await releaseDictationNow("start-failed");
      throw error;
    }
  });
}

export function releaseSynthesizedKeysSync(): boolean {
  const result = spawnSync(
    "/usr/bin/osascript",
    [controlScript, "dictation-up"],
    {
      stdio: "ignore",
      windowsHide: true,
      timeout: 1_500,
      killSignal: "SIGKILL",
    },
  );
  return !result.error && result.status === 0;
}

function releaseDictationNow(
  reason: InputReleaseReason,
): Promise<InputReleaseResult> {
  return inputReleaseGuard.release(reason, stopPttGuard, () =>
    releaseSynthesizedKeysSync(),
  );
}

async function stopPttGuard(): Promise<void> {
  const child = pttGuard;
  pttGuard = undefined;
  if (!child) {
    await runControl("dictation-up");
    return;
  }

  child.stdin?.end();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    if (child.exitCode !== null) {
      resolvePromise();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill();
      if (releaseSynthesizedKeysSync()) resolvePromise();
      else rejectPromise(new Error("Fallback input release failed"));
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

function serializePtt<T>(operation: () => Promise<T>): Promise<T> {
  const next = pttOperation.then(operation, operation);
  pttOperation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function openThread(threadId: string): Promise<void> {
  await verifyLiveTarget(threadId);
}

export async function openNewChat(path?: string): Promise<void> {
  const statePath = realpathSync(resolveStateDatabase());
  if (!statSync(statePath).isFile()) {
    throw new Error("Codex state database is unavailable.");
  }
  await openLiveRoute("new-chat", path, statePath);
}

export async function openNewProject(threadId: string): Promise<void> {
  await openLiveNewProject(threadId);
}

export async function launchWorkflow(
  workflow: WorkflowDefinition,
  sourceThreadId: string,
  path?: string,
): Promise<void> {
  if (!path)
    throw new Error("Workflow requires an exact focused project path.");
  const statePath = realpathSync(resolveStateDatabase());
  if (!statSync(statePath).isFile()) {
    throw new Error("Codex state database is unavailable.");
  }
  await launchLiveWorkflow(workflow.prompt, path, statePath, sourceThreadId);
}

export async function openSkills(): Promise<void> {
  await openLiveRoute("skills");
}

export async function applyReasoning(
  level: string,
  pickerLabel: string,
  threadId: string,
): Promise<LivePickerState> {
  return applyLiveReasoning(level, pickerLabel, threadId);
}

export async function openReasoningMenu(): Promise<void> {
  await runControl("reasoning-menu");
}

export async function applyModel(
  slug: string,
  pickerLabel: string,
  threadId: string,
): Promise<LivePickerState> {
  return applyLiveModel(slug, pickerLabel, threadId);
}

export async function openModelMenu(): Promise<void> {
  await runControl("model-menu");
}
