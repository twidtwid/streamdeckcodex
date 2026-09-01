// Shared transactional state helper for foreground QA. Callers supply the
// native runner and the exact task identity that it must use for every call.
export function selectionPayload(value, label) {
  return Buffer.from(JSON.stringify({ value, label }), "utf8").toString(
    "base64",
  );
}

export function requireConnectedQaTarget(activeThreadId, expectedThreadId) {
  if (!activeThreadId) {
    throw new Error("Connected QA requires one focused primary Codex task.");
  }
  if (expectedThreadId && activeThreadId !== expectedThreadId) {
    throw new Error(
      "Connected QA refused because the focused task is not the explicit disposable target.",
    );
  }
  return activeThreadId;
}

export function snapshotLiveState(native, threadId, options = {}) {
  if (!threadId) {
    throw new Error("Transactional QA requires an exact focused task ID.");
  }
  const modes = options.modes ?? ["plan", "fast"];
  const picker = native("read", undefined, threadId);
  return {
    threadId,
    plan: modes.includes("plan")
      ? native("mode-read", "plan", threadId).active
      : undefined,
    fast: modes.includes("fast")
      ? native("mode-read", "fast", threadId).active
      : undefined,
    model: picker.model,
    reasoning: picker.effort,
    modelSelection: options.model,
    reasoningSelection: options.reasoning,
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
    if (typeof expected !== "boolean") continue;
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

export function createLiveStateRestorer(native, snapshot) {
  let restored = false;
  return () => {
    if (restored) return [];
    restored = true;
    return restoreLiveState(native, snapshot);
  };
}
