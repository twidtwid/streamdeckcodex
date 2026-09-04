import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  createLiveStateRestorer,
  requireConnectedQaTarget,
  selectionPayload,
  snapshotLiveState,
} from "./lib/live-state-journal.mjs";
import { activeDesktopThreadId } from "../src/lib/desktop-active.ts";
import {
  createStreamDeckActionHarness,
  delay,
  waitFor,
} from "./lib/streamdeck-action-harness.mjs";

const root = resolve(import.meta.dirname, "..");
const plugin = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "plugin.js",
);
const nativeControl = resolve(
  root,
  "com.todd.streamdeckcodex.sdPlugin",
  "bin",
  "codex-ui-control",
);
function native(action, value, threadId) {
  const values = [action];
  if (value !== undefined || threadId) values.push(value ?? "");
  if (threadId) values.push(threadId);
  const result = spawnSync(nativeControl, values, {
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout.trim());
  if (result.status !== 0 || !parsed.ok) {
    throw new Error(parsed.message || `Native ${action} failed`);
  }
  return parsed;
}

function event(action, context, name, payload = {}) {
  return {
    action,
    context,
    device: "qa-stream-deck-plus",
    event: name,
    payload: {
      controller: "Encoder",
      coordinates: { column: action.endsWith("model") ? 2 : 3, row: 0 },
      isInMultiAction: false,
      resources: {},
      settings: {},
      ...payload,
    },
  };
}

async function readPicker(threadId, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return native("read", undefined, threadId);
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw (
    lastError ?? new Error("Timed out reading the live Model/Effort picker")
  );
}

const activeThreadId = requireConnectedQaTarget(
  activeDesktopThreadId(),
  process.env.STREAMDECK_QA_THREAD_ID,
);
spawnSync("/usr/bin/open", [`codex://threads/${activeThreadId}`]);
await delay(3_000);
const cache = JSON.parse(
  readFileSync(resolve(homedir(), ".codex", "models_cache.json"), "utf8"),
);
const effortLabels = {
  none: "None",
  minimal: "Minimal",
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};
const capabilities = ["luna", "terra", "sol", "astra"].flatMap((family) => {
  const model = cache.models?.find(
    (candidate) =>
      typeof candidate.slug === "string" &&
      candidate.slug.toLowerCase().endsWith(`-${family}`),
  );
  if (!model) return [];
  const reasoning = (model.supported_reasoning_levels ?? [])
    .map((entry) => entry.effort)
    .filter((effort) => effortLabels[effort] && effort !== "max");
  return reasoning.length
    ? [
        {
          slug: model.slug,
          family,
          label: family[0].toUpperCase() + family.slice(1),
          reasoning,
        },
      ]
    : [];
});
if (capabilities.length < 2) {
  throw new Error("Connected dial QA requires at least two supported models.");
}
const initialPicker = await readPicker(activeThreadId);
const initialModelSelection = capabilities.find((option) =>
  initialPicker.model?.toLowerCase().includes(option.family),
);
const initialReasoningSelection = Object.entries(effortLabels).find(
  ([, label]) => label === initialPicker.effort,
);
if (!initialModelSelection || !initialReasoningSelection) {
  throw new Error(
    "Connected dial QA cannot prove restoration of the current picker state.",
  );
}
const initialState = snapshotLiveState(native, activeThreadId, {
  modes: ["plan"],
  model: {
    value: initialModelSelection.slug,
    label: initialModelSelection.label,
  },
  reasoning: {
    value: initialReasoningSelection[0],
    label: initialReasoningSelection[1],
  },
});
const composer = native("composer-read", undefined, activeThreadId);
if (composer.draftEmpty !== true) {
  throw new Error(
    "Connected dial QA refused a nonempty or unverifiable draft.",
  );
}
const initialPlan = initialState.plan;
const baseModel = capabilities.at(-2);
const modelTarget = capabilities.at(-1);
if (!baseModel || !modelTarget) throw new Error("No reversible model pair.");
const baseReasoningIndex = Math.min(1, baseModel.reasoning.length - 1);
const baseReasoning = baseModel.reasoning[baseReasoningIndex];
const reasoningBase = "medium";
const reasoningTarget = "high";
if (
  !baseReasoning ||
  !modelTarget.reasoning.includes(reasoningBase) ||
  !modelTarget.reasoning.includes(reasoningTarget)
) {
  throw new Error(
    "Connected dial QA requires a model that supports Medium and High.",
  );
}
const restoreOnce = createLiveStateRestorer(native, initialState);
const harness = await createStreamDeckActionHarness({
  plugin,
  pluginContext: "qa-plugin-context",
  restore: restoreOnce,
});
const { outbound } = harness;

try {
  if (initialPlan) {
    native("mode-toggle", "plan", activeThreadId);
  }
  if (native("mode-read", "plan", activeThreadId).active) {
    throw new Error("Could not establish a non-Plan QA precondition");
  }
  native(
    "model",
    selectionPayload(baseModel.slug, baseModel.label),
    activeThreadId,
  );
  native(
    "reasoning",
    selectionPayload(baseReasoning, effortLabels[baseReasoning]),
    activeThreadId,
  );
  const modelAction = "com.todd.streamdeckcodex.model";
  const modelContext = "qa-model-dial";
  harness.send(event(modelAction, modelContext, "willAppear"));
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" && message.context === modelContext,
    ),
  );
  const modelBeforeRotate = (await readPicker(activeThreadId)).model;
  harness.send(event(modelAction, modelContext, "dialRotate", { ticks: 1 }));
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setSettings" &&
        message.context === modelContext &&
        message.payload?.selectedModel === modelTarget.slug,
    ),
  );
  if ((await readPicker(activeThreadId)).model !== modelBeforeRotate) {
    throw new Error("Model rotation mutated Codex before dial press");
  }
  harness.send(event(modelAction, modelContext, "dialUp"));
  await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === modelContext &&
          message.payload?.title === "MODEL" &&
          message.payload?.value === modelTarget.label.toUpperCase(),
      ),
    12_000,
  );
  if (
    !(await readPicker(activeThreadId)).model
      ?.toLowerCase()
      .includes(modelTarget.family)
  ) {
    throw new Error(`Model dial did not visibly apply ${modelTarget.label}`);
  }
  native(
    "reasoning",
    selectionPayload(reasoningBase, effortLabels[reasoningBase]),
    activeThreadId,
  );

  const reasoningAction = "com.todd.streamdeckcodex.reasoning";
  const reasoningContext = "qa-reasoning-dial";
  harness.send(event(reasoningAction, reasoningContext, "willAppear"));
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" && message.context === reasoningContext,
    ),
  );
  const reasoningBeforeRotate = (await readPicker(activeThreadId)).effort;
  harness.send(
    event(reasoningAction, reasoningContext, "dialRotate", { ticks: 1 }),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setSettings" &&
        message.context === reasoningContext &&
        message.payload?.selectedLevel === reasoningTarget,
    ),
  );
  if ((await readPicker(activeThreadId)).effort !== reasoningBeforeRotate) {
    throw new Error("Reasoning rotation mutated Codex before dial press");
  }
  harness.send(event(reasoningAction, reasoningContext, "dialUp"));
  await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === reasoningContext &&
          message.payload?.title === "EFFORT" &&
          message.payload?.value ===
            effortLabels[reasoningTarget].toUpperCase(),
      ),
    12_000,
  );
  if (
    (await readPicker(activeThreadId)).effort !== effortLabels[reasoningTarget]
  ) {
    throw new Error(
      `Reasoning dial did not visibly apply ${effortLabels[reasoningTarget]}`,
    );
  }

  const modelActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === modelContext &&
      message.payload?.title === "MODEL" &&
      message.payload?.value === modelTarget.label.toUpperCase(),
  );
  const reasoningActive = outbound.findLast(
    (message) =>
      message.event === "setFeedback" &&
      message.context === reasoningContext &&
      message.payload?.title === "EFFORT" &&
      message.payload?.value === effortLabels[reasoningTarget].toUpperCase(),
  );
  if (!modelActive || !reasoningActive) {
    throw new Error("The dials did not emit verified steady-state feedback");
  }

  const pttContext = "qa-ptt-key";
  const pttSettings = { commandId: "dictate" };
  const pttEvent = (name) =>
    event("com.todd.streamdeckcodex.command", pttContext, name, {
      controller: "Keypad",
      coordinates: { column: 0, row: 0 },
      settings: pttSettings,
    });
  const pttGuardRunning = () =>
    spawnSync("/usr/bin/pgrep", ["-f", "[p]tt-guard\\.mjs"]).status === 0;
  harness.send(pttEvent("willAppear"));
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setImage" && message.context === pttContext,
    ),
  );
  harness.send(pttEvent("keyDown"));
  await waitFor(pttGuardRunning);
  if (
    outbound.some(
      (message) =>
        message.event === "showAlert" && message.context === pttContext,
    )
  ) {
    throw new Error("PTT key-down reported a failure");
  }
  harness.send(pttEvent("keyUp"));
  const pttReleased = await waitFor(() =>
    outbound.findLast(
      (message) => message.event === "showOk" && message.context === pttContext,
    ),
  );
  await waitFor(() => !pttGuardRunning());
  await waitFor(
    () => {
      try {
        return (
          native("composer-read", undefined, activeThreadId).draftEmpty === true
        );
      } catch {
        return undefined;
      }
    },
    5_000,
    "a clean composer after PTT release",
  );

  const commandAction = "com.todd.streamdeckcodex.command";
  const planContext = "qa-plan-command";
  const planSettings = { commandIndex: 1 };
  harness.send(
    event(commandAction, planContext, "willAppear", {
      settings: planSettings,
    }),
  );
  await waitFor(() =>
    outbound.some(
      (message) =>
        message.event === "setFeedback" &&
        message.context === planContext &&
        message.payload?.value === "Plan",
    ),
  );
  harness.send(
    event(commandAction, planContext, "dialUp", {
      settings: planSettings,
    }),
  );
  const planFeedback = await waitFor(
    () =>
      outbound.findLast(
        (message) =>
          message.event === "setFeedback" &&
          message.context === planContext &&
          message.payload?.title !== "ACTION" &&
          message.payload?.value === "Plan",
      ),
    15_000,
    "verified Action-dial Plan feedback",
  );
  if (planFeedback.payload?.title !== "ACTIVE") {
    throw new Error(
      `Action-dial Plan failed: ${JSON.stringify(planFeedback.payload)}`,
    );
  }
  if (!native("mode-read", "plan", activeThreadId).active) {
    throw new Error("Plan control did not visibly activate Plan mode");
  }

  const finalPicker = await readPicker(activeThreadId);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      model: finalPicker.model,
      effort: finalPicker.effort,
      plan: native("mode-read", "plan", activeThreadId).active,
      modelFeedback: modelActive.payload,
      reasoningFeedback: reasoningActive.payload,
      pttFeedback: pttReleased.event,
      planFeedback: planFeedback.payload,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${harness.output()}\n${JSON.stringify(
      outbound.filter(
        (message) =>
          message.event === "showAlert" ||
          [
            "qa-model-dial",
            "qa-reasoning-dial",
            "qa-ptt-key",
            "qa-plan-command",
          ].includes(message.context),
      ),
    )}\n`,
  );
  throw error;
} finally {
  const failures = await harness.close();
  if (failures.length) {
    process.stderr.write(`restore failures: ${failures.join("; ")}\n`);
    process.exitCode = 1;
  }
}
