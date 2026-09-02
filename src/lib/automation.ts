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
  captureLiveTarget,
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

export async function executeCommand(
  command: CommandDefinition,
  threadId?: string,
): Promise<LiveModeState | undefined> {
  if (command.mode === "deep-link") {
    // The value names the verified native route, so the catalog entry and
    // the dispatch cannot drift apart.
    if (command.value === "new-chat") await openNewChat();
    else if (command.value === "skills") await openSkills();
    else
      throw new Error(`Unsupported verified deep-link route: ${command.value}`);
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
    // PTT already targets the visible chat. Capturing that current target must
    // not deep-link back to it and demand a navigation event that may not exist.
    const witnessToken = await captureLiveTarget(threadId);

    const child = spawn(process.execPath, [pttGuardScript], {
      stdio: ["pipe", "pipe", "pipe"],
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
    child.stderr?.setEncoding("utf8");
    let guardError = "";
    child.stderr?.on("data", (chunk: string) => {
      guardError = `${guardError}${chunk}`.slice(-2_000);
    });

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
          const detail = guardError.trim();
          finish(
            new Error(
              `Push-to-talk guard exited before ready with ${code ?? "unknown"}${detail ? `: ${detail}` : ""}`,
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
  const legacyResult = spawnSync(
    "/usr/bin/osascript",
    [controlScript, "dictation-up"],
    {
      stdio: "ignore",
      windowsHide: true,
      timeout: 1_500,
      killSignal: "SIGKILL",
    },
  );
  const nativeResult = spawnSync(
    resolve(pluginRoot, "bin", "codex-ui-control"),
    ["dictation-stop"],
    {
      stdio: "ignore",
      windowsHide: true,
      timeout: 4_000,
      killSignal: "SIGKILL",
    },
  );
  return (
    !legacyResult.error &&
    legacyResult.status === 0 &&
    !nativeResult.error &&
    nativeResult.status === 0
  );
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
    if (!releaseSynthesizedKeysSync()) {
      throw new Error("Fallback dictation release failed");
    }
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

export async function applyModel(
  slug: string,
  pickerLabel: string,
  threadId: string,
): Promise<LivePickerState> {
  return applyLiveModel(slug, pickerLabel, threadId);
}
