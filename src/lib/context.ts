import type { ContextSnapshot } from "../types.js";
import { ready, unavailable, type Availability } from "./availability.js";

export type ContextView = "remaining" | "exact";

export const CONTEXT_STALE_MS = 30 * 60 * 1000;

interface TokenCountEvent {
  timestamp?: string;
  payload?: {
    type?: string;
    info?: {
      last_token_usage?: {
        total_tokens?: number;
      } | null;
      model_context_window?: number;
    } | null;
  };
}

export function toggleContextView(view: ContextView): ContextView {
  return view === "remaining" ? "exact" : "remaining";
}

export function parseLatestContext(
  lines: string,
  threadId: string,
  now = Date.now(),
  maxAgeMs = CONTEXT_STALE_MS,
): ContextSnapshot | undefined {
  const availability = contextAvailabilityFromLines(
    lines,
    threadId,
    now,
    maxAgeMs,
  );
  return availability.state === "ready" ? availability.value : undefined;
}

export function contextAvailabilityFromLines(
  lines: string,
  threadId: string,
  now = Date.now(),
  maxAgeMs = CONTEXT_STALE_MS,
): Availability<ContextSnapshot> {
  if (!threadId) return unavailable("no-focus", now);
  let sawTokenCount = false;
  let sawStale = false;
  const entries = lines.split("\n");
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const line = entries[index]!;
    if (!line.includes('"token_count"')) continue;
    sawTokenCount = true;
    try {
      const event = JSON.parse(line) as TokenCountEvent;
      const usedTokens = event.payload?.info?.last_token_usage?.total_tokens;
      const maxTokens = event.payload?.info?.model_context_window;
      const observedAt = Date.parse(event.timestamp ?? "");
      if (
        event.payload?.type !== "token_count" ||
        typeof usedTokens !== "number" ||
        !Number.isFinite(usedTokens) ||
        usedTokens < 0 ||
        typeof maxTokens !== "number" ||
        !Number.isFinite(maxTokens) ||
        maxTokens <= 0 ||
        !Number.isFinite(observedAt) ||
        observedAt > now + 60_000
      ) {
        continue;
      }
      if (now - observedAt > maxAgeMs) {
        sawStale = true;
        continue;
      }
      return ready(
        {
          threadId,
          usedTokens,
          maxTokens,
          remainingPercent: Math.max(
            0,
            Math.min(100, Math.round((1 - usedTokens / maxTokens) * 100)),
          ),
          observedAt,
        },
        observedAt,
      );
    } catch {
      // Continue so an older complete event can still provide a valid sample.
    }
  }
  if (sawStale) return unavailable("stale", now);
  return unavailable(sawTokenCount ? "unsupported-schema" : "not-exposed", now);
}

export function compactTokenCount(value: number): string {
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${Math.round(value / 1_000)}K`;
  const millions = value / 1_000_000;
  return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`;
}

export function compactContext(snapshot: ContextSnapshot | undefined): string {
  if (!snapshot) return "--";
  return `${compactTokenCount(snapshot.usedTokens)}/${compactTokenCount(snapshot.maxTokens)}`;
}
