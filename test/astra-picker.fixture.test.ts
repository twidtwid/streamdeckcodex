import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { supportedModelOptions } from "../src/lib/model.js";
import {
  previewReasoning,
  reasoningPickerLabel,
} from "../src/lib/reasoning.js";

describe("Astra picker", () => {
  it.each([
    "fast-control",
    "fast-control-hidden",
    "fast-control-disabled",
    "fast-control-ambiguous",
    "fast-speed-menu",
    "fast-speed-option",
    "accessibility-chromium",
    "accessibility-chromium-appkit",
    "accessibility-electron",
    "accessibility-enabled",
    "accessibility-denied",
    "title-astra",
    "readout-astra",
    "readout-invalid",
    "step-astra",
    "geometry-astra",
    "readout-menu-scope",
    "readout-group-scope",
    "astra-payload",
    "max-payload",
  ])("recognizes the current selector safely: %s", (scenario) => {
    const result = spawnSync(
      resolve("com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control"),
      ["--power-fixture", scenario],
      { encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("adds Astra after Sol and omits the cache-only Max stop", () => {
    const models = [
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ].map((slug) => ({
      slug,
      default_reasoning_level: "medium",
      supported_reasoning_levels: [
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        ...(slug.endsWith("luna") ? [] : ["ultra"]),
      ].map((effort) => ({ effort })),
    }));
    const options = supportedModelOptions({ models });
    expect(options.map((option) => option.label)).toEqual([
      "LUNA",
      "TERRA",
      "SOL",
      "ASTRA",
    ]);
    expect(options.at(-1)).toMatchObject({
      slug: "gpt-6-astra",
      pickerLabel: "Astra",
      defaultReasoning: "medium",
      supportedReasoning: ["low", "medium", "high", "xhigh", "ultra"],
    });
    expect(options[0]?.supportedReasoning).not.toContain("ultra");
    expect(
      previewReasoning(
        { selected: "xhigh", applied: "xhigh" },
        1,
        options.at(-1)!.supportedReasoning,
      ),
    ).toEqual({ selected: "ultra", applied: "xhigh" });
    expect(reasoningPickerLabel("max")).toBe("Max");
  });

  it("supports an Astra-only catalog without inventing old models", () => {
    expect(
      supportedModelOptions({
        models: [
          {
            slug: "gpt-6-astra",
            supported_reasoning_levels: [{ effort: "medium" }],
          },
        ],
      }).map((option) => option.label),
    ).toEqual(["ASTRA"]);
  });
});
