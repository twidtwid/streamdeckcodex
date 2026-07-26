import { spawn } from "node:child_process";
import type { UsageSnapshot } from "../types.js";

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

export function fetchAccountUsage(timeoutMs = 5000): Promise<UsageSnapshot> {
  return new Promise((resolve, reject) => {
    const child = spawn("/opt/homebrew/bin/codex", ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    let buffer = "";
    let settled = false;

    const finish = (
      error: Error | undefined,
      snapshot?: UsageSnapshot,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill("SIGTERM");
      if (error) reject(error);
      else if (snapshot) resolve(snapshot);
      else reject(new Error("Codex returned no usage snapshot"));
    };

    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const timer = setTimeout(
      () => finish(new Error("Timed out reading Codex account usage")),
      timeoutMs,
    );

    child.once("error", (error) => finish(error));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as {
            id?: number;
            result?: RateLimitsReadResult;
            error?: { message?: string };
          };
          if (message.id === 1) {
            if (message.error) {
              finish(
                new Error(
                  message.error.message ?? "Codex initialization failed",
                ),
              );
              return;
            }
            send({ method: "initialized", params: {} });
            send({ method: "account/rateLimits/read", id: 2, params: {} });
          } else if (message.id === 2) {
            if (message.error) {
              finish(
                new Error(message.error.message ?? "Codex usage read failed"),
              );
              return;
            }
            finish(
              undefined,
              usageFromRateLimitsResult(message.result ?? {}, Date.now()),
            );
          }
        } catch {
          // Ignore non-JSON tracing output and wait for the requested response.
        }
      }
    });

    send({
      method: "initialize",
      id: 1,
      params: {
        clientInfo: {
          name: "streamdeck_codex_companion",
          title: "Stream Deck Codex Companion",
          version: "0.1.0",
        },
      },
    });
  });
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
