import { describe, expect, it, vi } from "vitest";
import {
  resolveProvider,
  targetKey,
  sameTarget,
  freshObservation,
  type TargetIdentity,
} from "../src/lib/providers/types.js";
import { ClaudeProvider } from "../src/lib/providers/claude.js";
import {
  badgeImage,
  badgeFeedback,
} from "../src/lib/providers/presentation.js";
import { svgDataUrl, keycapSvg } from "../src/lib/visuals.js";

const target: TargetIdentity = {
  provider: "claude",
  windowId: "7:1",
  sessionId: "same-id",
  environment: "local",
};
describe("provider identity and compatibility", () => {
  it("keeps legacy settings on Codex, and never falls back from auto or invalid settings", () => {
    expect(resolveProvider(undefined, "claude")).toBe("codex");
    expect(resolveProvider("codex", "claude")).toBe("codex");
    expect(resolveProvider("claude", "codex")).toBe("claude");
    expect(resolveProvider("auto", "claude")).toBe("claude");
    expect(resolveProvider("auto", "codex")).toBe("codex");
    expect(resolveProvider("auto")).toBeUndefined();
    expect(resolveProvider("invalid", "codex")).toBeUndefined();
  });
  it("separates equal session IDs across apps, windows and environments", () => {
    for (const changed of [
      { provider: "codex" },
      { windowId: "7:2" },
      { environment: "ssh" },
      { sessionId: "other" },
    ]) {
      expect(
        sameTarget(target, { ...target, ...changed } as TargetIdentity),
      ).toBe(false);
      expect(targetKey(target)).not.toBe(
        targetKey({ ...target, ...changed } as TargetIdentity),
      );
    }
    expect(sameTarget(target, { ...target })).toBe(true);
    expect(sameTarget(undefined, undefined)).toBe(false);
  });
  it("rejects stale, future and malformed observations", () => {
    expect(freshObservation({ observedAt: 1000 }, 5000)).toBe(true);
    expect(freshObservation({ observedAt: 1000 }, 5001)).toBe(false);
    expect(freshObservation({ observedAt: 1001 }, 1000)).toBe(false);
    expect(freshObservation({ observedAt: NaN })).toBe(false);
  });
  it("adds an app identity without changing legacy artwork", () => {
    const image = svgDataUrl(keycapSvg("Send", "READY", "send"));
    expect(badgeImage(image)).toBe(image);
    expect(
      Buffer.from(
        badgeImage(image, "CLAUDE").split(",")[1]!,
        "base64",
      ).toString(),
    ).toContain(">CLAUDE</text>");
    expect(badgeFeedback({ title: "MODEL", value: "Fable" }, "CLAUDE")).toEqual(
      { title: "CLAUDE · MODEL", value: "Fable" },
    );
  });
});
describe("Claude transaction boundary", () => {
  it.each(["other-app", "different-session", "stale", "no-target"])(
    "does not mutate after %s",
    async (situation) => {
      const state = {
        foreground: "claude",
        target,
        observedAt: Date.now(),
        ...(situation === "other-app" ? { foreground: "codex" } : {}),
        ...(situation === "different-session"
          ? { target: { ...target, sessionId: "other" } }
          : {}),
        ...(situation === "stale" ? { observedAt: 1 } : {}),
        ...(situation === "no-target" ? { target: undefined } : {}),
      };
      const call = vi.fn().mockResolvedValue({ providerState: state });
      const provider = new ClaudeProvider(call);
      await expect(
        provider.perform({ operation: "model", value: "Fable", target }),
      ).rejects.toThrow("Target changed");
      expect(call).toHaveBeenCalledTimes(1);
      expect(call.mock.calls[0]![0]).toBe("provider-read");
    },
  );
  it("rejects a Codex target before calling the helper", async () => {
    const call = vi.fn();
    await expect(
      new ClaudeProvider(call).perform({
        operation: "model",
        target: { ...target, provider: "codex" },
      }),
    ).rejects.toThrow("Wrong provider");
    expect(call).not.toHaveBeenCalled();
  });
  it("passes exact captured identity to the native transaction", async () => {
    const state = { foreground: "claude", target, observedAt: Date.now() };
    const call = vi.fn().mockResolvedValue({ providerState: state });
    await new ClaudeProvider(call).perform({
      operation: "model",
      value: "Fable 5.1",
      target,
    });
    expect(call).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(
      Buffer.from(call.mock.calls[1]![1], "base64").toString(),
    );
    expect(payload).toEqual({ operation: "model", value: "Fable 5.1", target });
  });
});
