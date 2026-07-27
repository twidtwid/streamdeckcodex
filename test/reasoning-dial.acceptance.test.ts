import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmReasoning,
  previewReasoning,
  reasoningFeedback,
  type ReasoningDialState,
} from "../src/lib/reasoning.js";
import { supportedReasoningLevels } from "../src/lib/codex-store.js";

const levels = ["low", "medium", "high", "xhigh", "ultra"];
const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

describe("reasoning dial acceptance", () => {
  it("turn changes only the pending local selection", () => {
    const active: ReasoningDialState = { selected: "low", applied: "low" };
    const pending = previewReasoning(active, 1, levels);

    expect(pending).toEqual({ selected: "medium", applied: "low" });
    expect(reasoningFeedback(pending, levels)).toEqual(
      expect.objectContaining({
        title: "PENDING",
        value: "MEDIUM",
        indicator: expect.objectContaining({ bar_fill_c: "#F4B740" }),
      }),
    );
  });

  it("press produces exactly one named apply payload and applied feedback", () => {
    const pending: ReasoningDialState = {
      selected: "high",
      applied: "low",
    };
    const confirmation = confirmReasoning(pending);

    expect(confirmation.level).toBe("high");
    expect(confirmation.state).toEqual({ selected: "high", applied: "high" });
    expect(reasoningFeedback(confirmation.state, levels)).toEqual(
      expect.objectContaining({
        title: "EFFORT",
        value: "HIGH",
        indicator: expect.objectContaining({ bar_fill_c: "#35C759" }),
      }),
    );
  });

  it("uses the picker label Light while retaining low as the API token", () => {
    const active: ReasoningDialState = { selected: "low", applied: "low" };
    expect(reasoningFeedback(active, levels).value).toBe("LIGHT");
  });

  it("requires the requested reasoning label after native application", () => {
    expect(
      spawnSync(native, ["--picker-selection-fixture", "reasoning-confirmed"])
        .status,
    ).toBe(0);
  });

  it("offers Ultra only when the active model advertises it", () => {
    const cache = {
      models: [
        {
          slug: "gpt-5.6-sol",
          supported_reasoning_levels: [
            { effort: "low" },
            { effort: "medium" },
            { effort: "ultra" },
          ],
        },
        {
          slug: "gpt-5.6-luna",
          supported_reasoning_levels: [
            { effort: "low" },
            { effort: "medium" },
            { effort: "high" },
          ],
        },
      ],
    };

    expect(supportedReasoningLevels(cache, "gpt-5.6-sol")).toContain("ultra");
    expect(supportedReasoningLevels(cache, "gpt-5.6-luna")).not.toContain(
      "ultra",
    );
  });

  it("never exposes stale cache-only Max as a selectable effort", () => {
    const cache = {
      models: [
        {
          slug: "gpt-5.6-sol",
          supported_reasoning_levels: [
            { effort: "low" },
            { effort: "max" },
            { effort: "ultra" },
          ],
        },
      ],
    };
    expect(supportedReasoningLevels(cache, "gpt-5.6-sol")).toEqual([
      "low",
      "ultra",
    ]);
  });
});
