export type AvailabilityReason =
  | "no-focus"
  | "codex-background"
  | "accessibility"
  | "stale"
  | "unsupported-schema"
  | "timeout"
  | "target-mismatch"
  | "busy"
  | "not-exposed";

export type Availability<T> =
  | Readonly<{ state: "ready"; value: T; observedAt: number }>
  | Readonly<{
      state: "unavailable";
      reason: AvailabilityReason;
      observedAt: number;
    }>;

export function ready<T>(value: T, observedAt = Date.now()): Availability<T> {
  return { state: "ready", value, observedAt };
}

export function unavailable<T = never>(
  reason: AvailabilityReason,
  observedAt = Date.now(),
): Availability<T> {
  return { state: "unavailable", reason, observedAt };
}

export function availabilityReasonFromError(
  error: unknown,
): AvailabilityReason {
  const reasonCode =
    typeof error === "object" && error !== null && "reasonCode" in error
      ? String((error as { reasonCode?: unknown }).reasonCode ?? "")
      : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("background") || message.includes("frontmost"))
    return "codex-background";
  if (reasonCode === "NO_FOCUS") return "no-focus";
  if (reasonCode === "TARGET_MISMATCH") return "target-mismatch";
  if (reasonCode === "TIMEOUT" || message.includes("timed out"))
    return "timeout";
  if (reasonCode === "DRAFT_PRESENT" || message.includes("busy")) return "busy";
  if (message.includes("accessibility")) return "accessibility";
  if (message.includes("unsupported")) return "unsupported-schema";
  return "not-exposed";
}

export const AVAILABILITY_LABEL: Record<AvailabilityReason, string> = {
  "no-focus": "NO CHAT",
  "codex-background": "BACKGROUND",
  accessibility: "ACCESS",
  stale: "STALE",
  "unsupported-schema": "UNSUPPORTED",
  timeout: "TIMEOUT",
  "target-mismatch": "WRONG CHAT",
  busy: "BUSY",
  "not-exposed": "NO DATA",
};
