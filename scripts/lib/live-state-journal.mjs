// Shared transactional state helper for foreground QA. Callers supply the
// native runner and the exact task identity that it must use for every call.
export function snapshotLiveState(native, threadId) {
  if (!threadId) {
    throw new Error("Transactional QA requires an exact focused task ID.");
  }
  const picker = native("read", undefined, threadId);
  return {
    threadId,
    plan: native("mode-read", "plan", threadId).active,
    fast: native("mode-read", "fast", threadId).active,
    model: picker.model,
    reasoning: picker.effort,
  };
}

export function restoreLiveState(native, snapshot) {
  if (!snapshot?.threadId) {
    return ["task: no exact focused task ID was captured for restoration"];
  }
  const failures = [];
  for (const [mode, expected] of [
    ["plan", snapshot.plan],
    ["fast", snapshot.fast],
  ]) {
    try {
      if (native("mode-read", mode, snapshot.threadId).active !== expected)
        native("mode-toggle", mode, snapshot.threadId);
    } catch (error) {
      failures.push(
        `${mode}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const modelSlug = Object.entries({
    "5.6 Luna": "gpt-5.6-luna",
    "5.6 Terra": "gpt-5.6-terra",
    "5.6 Sol": "gpt-5.6-sol",
  }).find(([label]) => label === snapshot.model)?.[1];
  if (modelSlug) {
    try {
      if (native("read", undefined, snapshot.threadId).model !== snapshot.model)
        native("model", modelSlug, snapshot.threadId);
    } catch (error) {
      failures.push(
        `model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const effort = Object.entries({
    Light: "low",
    Medium: "medium",
    High: "high",
    "Extra High": "xhigh",
    Ultra: "ultra",
  }).find(([label]) => label === snapshot.reasoning)?.[1];
  if (effort) {
    try {
      if (
        native("read", undefined, snapshot.threadId).effort !==
        snapshot.reasoning
      )
        native("reasoning", effort, snapshot.threadId);
    } catch (error) {
      failures.push(
        `reasoning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
}
