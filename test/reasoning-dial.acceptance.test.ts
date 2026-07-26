import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  confirmReasoning,
  previewReasoning,
  reasoningFeedback,
  type ReasoningDialState,
} from "../src/lib/reasoning.js";
import { supportedReasoningLevels } from "../src/lib/codex-store.js";

const levels = ["low", "medium", "high", "xhigh", "max", "ultra"];

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
        title: "ACTIVE",
        value: "HIGH",
        indicator: expect.objectContaining({ bar_fill_c: "#35C759" }),
      }),
    );
  });

  it("keeps command dispatch out of the encoder-turn handler", () => {
    const source = readFileSync("src/actions/reasoning.ts", "utf8");
    const rotate = source.slice(
      source.indexOf("async onDialRotate"),
      source.indexOf("async onDialUp"),
    );
    const press = source.slice(
      source.indexOf("async onDialUp"),
      source.indexOf("async onTouchTap"),
    );

    expect(rotate).not.toContain("applyReasoning");
    expect(rotate).not.toContain("applyPreview");
    expect(press).toContain("applyPreview");
  });

  it("dispatches one validated level through the live Codex picker", () => {
    const automation = readFileSync("src/lib/automation.ts", "utf8");
    const liveControl = readFileSync("src/lib/codex-ui-control.ts", "utf8");
    const action = readFileSync("src/actions/reasoning.ts", "utf8");
    const native = readFileSync("native/CodexUIControl.swift", "utf8");
    const script = readFileSync(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
      "utf8",
    );

    expect(automation).toContain("return applyLiveReasoning(level)");
    expect(automation).not.toContain("updateThreadSettings");
    expect(liveControl).toContain('invoke("reasoning", level)');
    expect(action).toContain("Live Codex picker retained");
    expect(action).not.toContain("codexStore.threadSettings");
    expect(native).toContain('"low": "Light"');
    expect(native).toContain('"xhigh": "Extra High"');
    expect(native).toContain("Codex still shows");
    expect(script).not.toContain('keystroke "/reasoning"');
  });

  it("shows an explicit failed state when live application cannot be proved", () => {
    const action = readFileSync("src/actions/reasoning.ts", "utf8");
    const feedback = readFileSync("src/lib/reasoning.ts", "utf8");

    expect(action).toContain("reasoningFailureFeedback");
    expect(action).toContain("pickerFailureLabel");
    expect(feedback).toContain('title: "FAILED"');
    expect(feedback).toContain('bar_fill_c: "#FF453A"');
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

  it("guards the apply path against a stale unsupported selection", () => {
    const source = readFileSync("src/actions/reasoning.ts", "utf8");
    const applyPreview = source.slice(
      source.indexOf("private async applyPreview"),
      source.indexOf("private async apply("),
    );

    expect(applyPreview).toContain(
      "snapshot.levels.includes(current.selected)",
    );
    expect(applyPreview).toContain("Ignored unsupported reasoning level");
  });
});
