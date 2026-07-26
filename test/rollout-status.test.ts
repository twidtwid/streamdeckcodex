import { describe, expect, it } from "vitest";
import {
  parseRolloutLines,
  reduceRolloutEvents,
  type RolloutEvent,
} from "../src/lib/rollout-status.js";

const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 6, 25, 16, 0, seconds)).toISOString();

const event = (
  seconds: number,
  type: string,
  subtype: string,
  extra: Record<string, unknown> = {},
): RolloutEvent => ({
  timestamp: at(seconds),
  type,
  payload: { type: subtype, ...extra },
});

describe("reduceRolloutEvents", () => {
  it("reports idle for a chat with no active task", () => {
    expect(reduceRolloutEvents([]).status).toBe("idle");
    expect(
      reduceRolloutEvents([event(1, "event_msg", "user_message")]).status,
    ).toBe("idle");
  });

  it("distinguishes thinking from tool-running", () => {
    expect(
      reduceRolloutEvents(
        [
          event(1, "event_msg", "task_started"),
          event(2, "response_item", "reasoning"),
        ],
        { now: Date.parse(at(10)) },
      ).status,
    ).toBe("thinking");

    expect(
      reduceRolloutEvents(
        [
          event(1, "event_msg", "task_started"),
          event(2, "response_item", "function_call", { name: "exec_command" }),
        ],
        { now: Date.parse(at(10)) },
      ).status,
    ).toBe("running");
  });

  it("marks a completed task unread until it is acknowledged", () => {
    const events = [
      event(1, "event_msg", "task_started"),
      event(2, "event_msg", "task_complete"),
    ];
    const completedAt = Date.parse(at(2));
    expect(reduceRolloutEvents(events).status).toBe("unread");
    expect(
      reduceRolloutEvents(events, { acknowledgedAt: completedAt }).status,
    ).toBe("idle");
  });

  it("detects approval and question requests", () => {
    expect(
      reduceRolloutEvents([
        event(1, "event_msg", "task_started"),
        event(2, "response_item", "function_call", {
          name: "request_user_input",
        }),
      ]).status,
    ).toBe("needs-input");

    expect(
      reduceRolloutEvents([
        event(1, "event_msg", "task_started"),
        event(2, "event_msg", "exec_approval_request"),
      ]).status,
    ).toBe("needs-input");
  });

  it("reports task errors and aborts", () => {
    expect(
      reduceRolloutEvents([
        event(1, "event_msg", "task_started"),
        event(2, "event_msg", "task_error"),
      ]).status,
    ).toBe("error");
    expect(
      reduceRolloutEvents([
        event(1, "event_msg", "task_started"),
        event(2, "event_msg", "turn_aborted"),
      ]).status,
    ).toBe("error");
  });

  it("falls back to idle when active state is stale", () => {
    const last = Date.parse(at(2));
    expect(
      reduceRolloutEvents(
        [
          event(1, "event_msg", "task_started"),
          event(2, "response_item", "reasoning"),
        ],
        { now: last + 31 * 60 * 1000 },
      ).status,
    ).toBe("idle");
  });

  it("infers active work when task_started is outside the tail window", () => {
    expect(
      reduceRolloutEvents(
        [
          event(2, "response_item", "custom_tool_call", {
            name: "apply_patch",
          }),
        ],
        { now: Date.parse(at(10)) },
      ).status,
    ).toBe("running");
    expect(
      reduceRolloutEvents([event(2, "response_item", "reasoning")], {
        now: Date.parse(at(10)),
      }).status,
    ).toBe("thinking");
  });
});

describe("parseRolloutLines", () => {
  it("ignores partial and malformed JSONL lines", () => {
    const content = [
      '{"partial":',
      JSON.stringify(event(1, "event_msg", "task_started")),
      JSON.stringify(
        event(2, "response_item", "custom_tool_call", { name: "apply_patch" }),
      ),
    ].join("\n");
    expect(parseRolloutLines(content, { now: Date.parse(at(10)) }).status).toBe(
      "running",
    );
  });
});
