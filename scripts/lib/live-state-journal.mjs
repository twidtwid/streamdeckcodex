// Shared transactional state helper for foreground QA. Callers supply the
// native runner and the exact task identity that it must use for every call.
export function selectionPayload(value, label) {
  return Buffer.from(JSON.stringify({ value, label }), "utf8").toString(
    "base64",
  );
}

export function snapshotLiveState(native, threadId, selections = {}) {
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
    modelSelection: selections.model,
    reasoningSelection: selections.reasoning,
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
  if (snapshot.modelSelection) {
    try {
      if (native("read", undefined, snapshot.threadId).model !== snapshot.model)
        native(
          "model",
          selectionPayload(
            snapshot.modelSelection.value,
            snapshot.modelSelection.label,
          ),
          snapshot.threadId,
        );
    } catch (error) {
      failures.push(
        `model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (snapshot.reasoningSelection) {
    try {
      if (
        native("read", undefined, snapshot.threadId).effort !==
        snapshot.reasoning
      )
        native(
          "reasoning",
          selectionPayload(
            snapshot.reasoningSelection.value,
            snapshot.reasoningSelection.label,
          ),
          snapshot.threadId,
        );
    } catch (error) {
      failures.push(
        `reasoning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
}
