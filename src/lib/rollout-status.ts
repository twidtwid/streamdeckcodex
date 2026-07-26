import type { AgentStatus, RolloutState } from "../types.js";

export interface RolloutEvent {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

const TOOL_CALL_TYPES = new Set([
  "function_call",
  "custom_tool_call",
  "mcp_tool_call",
  "web_search_call",
  "computer_initialize_state",
  "computer_call",
  "local_shell_call",
]);

const RUNNING_EVENT_TYPES = new Set([
  "exec_command_begin",
  "patch_apply_begin",
  "web_search_begin",
  "mcp_tool_call_begin",
]);

const COMPLETE_EVENT_TYPES = new Set(["task_complete", "turn_complete"]);
const ABORT_EVENT_TYPES = new Set([
  "task_aborted",
  "turn_aborted",
  "task_error",
]);

function atMs(event: RolloutEvent): number {
  const parsed = Date.parse(event.timestamp ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isNeedsInput(event: RolloutEvent): boolean {
  const payload = event.payload ?? {};
  const subtype = text(payload.type);
  const name = text(payload.name);
  const status = text(payload.status);
  return (
    subtype.includes("approval_request") ||
    subtype.includes("request_user_input") ||
    subtype.includes("needs_input") ||
    subtype.includes("user_input_request") ||
    name === "request_user_input" ||
    status === "needs_approval" ||
    status === "waiting_for_user"
  );
}

function isError(event: RolloutEvent): boolean {
  const payload = event.payload ?? {};
  const subtype = text(payload.type);
  const level = text(payload.level);
  return (
    event.type === "error" ||
    subtype === "error" ||
    subtype.endsWith("_error") ||
    level === "error"
  );
}

function isToolActivity(event: RolloutEvent): boolean {
  const payload = event.payload ?? {};
  const subtype = text(payload.type);
  return (
    (event.type === "response_item" && TOOL_CALL_TYPES.has(subtype)) ||
    (event.type === "event_msg" && RUNNING_EVENT_TYPES.has(subtype))
  );
}

function isReasoning(event: RolloutEvent): boolean {
  const payload = event.payload ?? {};
  const subtype = text(payload.type);
  return (
    (event.type === "response_item" && subtype === "reasoning") ||
    (event.type === "event_msg" &&
      (subtype === "agent_reasoning" || subtype === "reasoning"))
  );
}

export function reduceRolloutEvents(
  events: readonly RolloutEvent[],
  options: {
    acknowledgedAt?: number;
    now?: number;
    staleAfterMs?: number;
  } = {},
): RolloutState {
  let status: AgentStatus = "idle";
  let lastEventAt = 0;
  let completedAt: number | undefined;
  let detail: string | undefined;
  let taskActive = false;

  for (const event of events) {
    const payload = event.payload ?? {};
    const subtype = text(payload.type);
    const time = atMs(event);
    if (time > 0) lastEventAt = Math.max(lastEventAt, time);

    if (event.type === "event_msg" && subtype === "user_message") {
      status = "idle";
      taskActive = false;
      completedAt = undefined;
      detail = undefined;
      continue;
    }
    if (event.type === "event_msg" && subtype === "task_started") {
      status = "thinking";
      taskActive = true;
      completedAt = undefined;
      detail = "Thinking";
      continue;
    }
    if (isNeedsInput(event)) {
      status = "needs-input";
      taskActive = true;
      detail = "Needs your input";
      continue;
    }
    if (
      isError(event) ||
      (event.type === "event_msg" && ABORT_EVENT_TYPES.has(subtype))
    ) {
      status = "error";
      taskActive = false;
      detail = "Error";
      continue;
    }
    if (event.type === "event_msg" && COMPLETE_EVENT_TYPES.has(subtype)) {
      completedAt = time || lastEventAt;
      status = completedAt > (options.acknowledgedAt ?? 0) ? "unread" : "idle";
      taskActive = false;
      detail = status === "unread" ? "Completed" : undefined;
      continue;
    }
    if (isToolActivity(event)) {
      taskActive = true;
      status = "running";
      detail = text(payload.name) || "Running";
      continue;
    }
    if (isReasoning(event)) {
      taskActive = true;
      status = "thinking";
      detail = "Thinking";
    }
  }

  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 30 * 60 * 1000;
  if (
    (status === "thinking" || status === "running") &&
    lastEventAt > 0 &&
    now - lastEventAt > staleAfterMs
  ) {
    status = "idle";
    detail = "Last activity is stale";
  }

  return {
    status,
    lastEventAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(detail === undefined ? {} : { detail }),
  };
}

export function parseRolloutLines(
  content: string,
  options: {
    acknowledgedAt?: number;
    now?: number;
    staleAfterMs?: number;
  } = {},
): RolloutState {
  const events: RolloutEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RolloutEvent;
      if (parsed && typeof parsed === "object") events.push(parsed);
    } catch {
      // A partial first line is expected when reading only the tail of a JSONL file.
    }
  }
  return reduceRolloutEvents(events, options);
}
