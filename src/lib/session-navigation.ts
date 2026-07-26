import type { AgentSnapshot } from "../types.js";

export type SessionDirection = "older" | "newer";
export type SessionNavigationFailure = "no-focused-session" | "end-of-list";

export type SessionNavigationResult =
  | {
      status: "available";
      target: AgentSnapshot;
      currentIndex: number;
      targetIndex: number;
    }
  | {
      status: "unavailable";
      reason: SessionNavigationFailure;
    };

export function resolveSessionNeighbor(
  sessions: readonly AgentSnapshot[],
  focusedId: string | undefined,
  direction: SessionDirection,
): SessionNavigationResult {
  if (!focusedId) {
    return { status: "unavailable", reason: "no-focused-session" };
  }
  const currentIndex = sessions.findIndex(
    (session) => session.id === focusedId,
  );
  if (currentIndex < 0) {
    return { status: "unavailable", reason: "no-focused-session" };
  }
  const targetIndex = currentIndex + (direction === "older" ? 1 : -1);
  const target = sessions[targetIndex];
  if (!target) {
    return { status: "unavailable", reason: "end-of-list" };
  }
  return { status: "available", target, currentIndex, targetIndex };
}
