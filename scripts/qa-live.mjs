import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { updateThreadSettings } from "../src/lib/app-server.ts";
import {
  resolveCodexHome,
  resolveStateDatabase,
} from "../src/lib/codex-store.ts";
import { activeDesktopThreadId } from "../src/lib/desktop-active.ts";
import { contextAvailabilityFromLines } from "../src/lib/context.ts";
import { supportedModelOptions } from "../src/lib/model.ts";
import { fetchAccountUsage } from "../src/lib/usage.ts";

const codexHome = resolveCodexHome();
const databasePath = resolveStateDatabase(codexHome);
const database = new DatabaseSync(databasePath, {
  readOnly: true,
  timeout: 1_000,
});
database.exec("PRAGMA query_only = ON");

const activeThreadId = activeDesktopThreadId();
const current = database
  .prepare(
    `SELECT id, model, reasoning_effort, rollout_path
     FROM threads
     WHERE id = ?
     LIMIT 1`,
  )
  .get(activeThreadId ?? "");
if (!current?.id || !current.model || !current.reasoning_effort) {
  throw new Error(
    `The focused primary Codex task ${activeThreadId ?? "(unknown)"} has no readable model and effort`,
  );
}

const readSettings = () => {
  const fresh = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 1_000,
  });
  fresh.exec("PRAGMA query_only = ON");
  const settings = fresh
    .prepare("SELECT model, reasoning_effort FROM threads WHERE id = ? LIMIT 1")
    .get(current.id);
  fresh.close();
  return settings;
};

const cache = JSON.parse(
  readFileSync(join(codexHome, "models_cache.json"), "utf8"),
);
const models = cache.models ?? [];
const activeModel = models.find((model) => model.slug === current.model);
const reasoningLevels = (activeModel?.supported_reasoning_levels ?? [])
  .map((item) => item.effort)
  .filter(Boolean);
if (!reasoningLevels.includes(current.reasoning_effort)) {
  throw new Error(
    `${current.model} does not advertise ${current.reasoning_effort}`,
  );
}

// The plugin's own catalog filter decides which models exist; pick any other
// offered model that supports the current effort as the round-trip target.
const alternateModel = supportedModelOptions(cache).find(
  (option) =>
    option.slug !== current.model &&
    option.supportedReasoning.includes(current.reasoning_effort),
);
const alternateEffort = reasoningLevels.find(
  (effort) => effort !== current.reasoning_effort,
);

const results = [];
try {
  await updateThreadSettings(current.id, { model: current.model });
  results.push({
    control: "Model apply",
    expected: current.model,
    observed: readSettings()?.model,
  });

  await updateThreadSettings(current.id, { effort: current.reasoning_effort });
  results.push({
    control: "Reasoning apply",
    expected: current.reasoning_effort,
    observed: readSettings()?.reasoning_effort,
  });

  if (process.argv.includes("--transient") && alternateModel) {
    await updateThreadSettings(current.id, { model: alternateModel.slug });
    results.push({
      control: "Model change",
      expected: alternateModel.slug,
      observed: readSettings()?.model,
    });
    await updateThreadSettings(current.id, { model: current.model });
    results.push({
      control: "Model rollback",
      expected: current.model,
      observed: readSettings()?.model,
    });
  }

  if (process.argv.includes("--transient") && alternateEffort) {
    await updateThreadSettings(current.id, { effort: alternateEffort });
    results.push({
      control: "Reasoning change",
      expected: alternateEffort,
      observed: readSettings()?.reasoning_effort,
    });
    await updateThreadSettings(current.id, {
      effort: current.reasoning_effort,
    });
    results.push({
      control: "Reasoning rollback",
      expected: current.reasoning_effort,
      observed: readSettings()?.reasoning_effort,
    });
  }

  const usage = await fetchAccountUsage();
  results.push({
    control: "Live usage",
    expected: "number",
    observed: typeof usage.usedPercent,
  });
  const context = contextAvailabilityFromLines(
    readFileSync(current.rollout_path, "utf8"),
    current.id,
  );
  results.push({
    control: "Focused live context",
    expected: activeThreadId,
    observed: context.state === "ready" ? context.value.threadId : "--",
    detail:
      context.state === "ready"
        ? `${context.value.usedTokens}/${context.value.maxTokens} (${context.value.remainingPercent}% left)`
        : context.reason,
  });
} finally {
  const restored = readSettings();
  if (restored?.model !== current.model) {
    await updateThreadSettings(current.id, { model: current.model });
  }
  if (restored?.reasoning_effort !== current.reasoning_effort) {
    await updateThreadSettings(current.id, {
      effort: current.reasoning_effort,
    });
  }
  database.close();
}

for (const result of results) {
  const passed = result.expected === result.observed;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${result.control}: ${String(result.observed)}${result.detail ? ` ${result.detail}` : ""}`,
  );
  if (!passed) process.exitCode = 1;
}
