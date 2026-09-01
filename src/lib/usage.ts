import type { UsageSnapshot } from "../types.js";
import { callReadOnlyAppServer } from "./app-server.js";

export type UsageView = "weekly" | "resets";

export function toggleUsageView(view: UsageView): UsageView {
  return view === "weekly" ? "resets" : "weekly";
}

interface TokenCountEvent {
  timestamp?: string;
  payload?: {
    type?: string;
    rate_limits?: {
      primary?: {
        used_percent?: number;
        window_minutes?: number;
        resets_at?: number;
      } | null;
    } | null;
  };
}

interface RateLimitWindow {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

interface RateLimitsReadResult {
  rateLimits?: {
    primary?: RateLimitWindow | null;
    secondary?: RateLimitWindow | null;
  };
  rateLimitResetCredits?: {
    availableCount?: number;
  } | null;
}

function weeklyWindow(
  primary?: RateLimitWindow | null,
  secondary?: RateLimitWindow | null,
): RateLimitWindow | undefined {
  return [primary, secondary]
    .filter(
      (window): window is RateLimitWindow =>
        window !== null && window !== undefined,
    )
    .sort(
      (left, right) =>
        (right.windowDurationMins ?? 0) - (left.windowDurationMins ?? 0),
    )[0];
}

export function usageFromRateLimitsResult(
  result: RateLimitsReadResult,
  observedAt = Date.now(),
): UsageSnapshot | undefined {
  const window = weeklyWindow(
    result.rateLimits?.primary,
    result.rateLimits?.secondary,
  );
  if (typeof window?.usedPercent !== "number") return undefined;
  const resetsAvailable = result.rateLimitResetCredits?.availableCount;
  return {
    usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
    observedAt,
    ...(typeof window.windowDurationMins === "number"
      ? { windowMinutes: window.windowDurationMins }
      : {}),
    ...(typeof window.resetsAt === "number"
      ? { resetsAt: window.resetsAt }
      : {}),
    ...(typeof resetsAvailable === "number" ? { resetsAvailable } : {}),
  };
}

export async function fetchAccountUsage(
  timeoutMs = 5000,
): Promise<UsageSnapshot> {
  const result = (await callReadOnlyAppServer(
    "account/rateLimits/read",
    {},
    timeoutMs,
  )) as RateLimitsReadResult;
  const snapshot = usageFromRateLimitsResult(result, Date.now());
  if (!snapshot) throw new Error("Codex returned no usage snapshot");
  return snapshot;
}

export function parseLatestUsage(lines: string): UsageSnapshot | undefined {
  const entries = lines.split("\n");
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const line = entries[index]!;
    if (!line.includes('"rate_limits"')) continue;
    try {
      const event = JSON.parse(line) as TokenCountEvent;
      const primary = event.payload?.rate_limits?.primary;
      if (
        event.payload?.type !== "token_count" ||
        typeof primary?.used_percent !== "number"
      ) {
        continue;
      }
      const observedAt = Date.parse(event.timestamp ?? "");
      return {
        usedPercent: Math.max(0, Math.min(100, primary.used_percent)),
        ...(typeof primary.window_minutes === "number"
          ? { windowMinutes: primary.window_minutes }
          : {}),
        ...(typeof primary.resets_at === "number"
          ? { resetsAt: primary.resets_at }
          : {}),
        observedAt: Number.isFinite(observedAt) ? observedAt : 0,
      };
    } catch {
      // Ignore malformed or partially written rollout lines.
    }
  }
  return undefined;
}
