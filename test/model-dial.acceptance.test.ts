import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pickerFailureLabel } from "../src/lib/codex-ui-control.js";
import {
  confirmModel,
  modelFailureFeedback,
  modelFeedback,
  previewModel,
  supportedModelOptions,
  type ModelDialState,
} from "../src/lib/model.js";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

const cache = {
  models: [
    {
      slug: "gpt-5.6-sol",
      display_name: "GPT-5.6-Sol",
      default_reasoning_level: "low",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "ultra" }],
    },
    {
      slug: "gpt-5.6-terra",
      display_name: "GPT-5.6-Terra",
      default_reasoning_level: "medium",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }],
    },
    {
      slug: "gpt-5.6-luna",
      display_name: "GPT-5.6-Luna",
      default_reasoning_level: "medium",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }],
    },
    { slug: "gpt-5.5" },
  ],
};
const options = supportedModelOptions(cache);

describe("model dial acceptance", () => {
  it("offers the live Luna, Terra, and Sol model slugs", () => {
    expect(options).toEqual([
      expect.objectContaining({
        slug: "gpt-5.6-luna",
        label: "LUNA",
        pickerLabel: "Luna",
        supportedReasoning: ["low", "medium"],
      }),
      expect.objectContaining({
        slug: "gpt-5.6-terra",
        label: "TERRA",
        pickerLabel: "Terra",
        supportedReasoning: ["low", "medium"],
      }),
      expect.objectContaining({
        slug: "gpt-5.6-sol",
        label: "SOL",
        pickerLabel: "Sol",
        supportedReasoning: ["low", "ultra"],
      }),
    ]);
  });

  it("turn changes only the pending local selection", () => {
    const active: ModelDialState = {
      selected: "gpt-5.6-luna",
      applied: "gpt-5.6-luna",
    };
    const pending = previewModel(active, 1, options);

    expect(pending).toEqual({
      selected: "gpt-5.6-terra",
      applied: "gpt-5.6-luna",
    });
    expect(modelFeedback(pending, options)).toMatchObject({
      title: "PENDING",
      value: "TERRA",
      indicator: { bar_fill_c: "#F4B740" },
    });
  });

  it("press produces one exact model payload", () => {
    const confirmation = confirmModel(
      {
        selected: "gpt-5.6-sol",
        applied: "gpt-5.6-luna",
      },
      options,
    );

    expect(confirmation.option).toMatchObject({
      slug: "gpt-5.6-sol",
      label: "SOL",
    });
    expect(confirmation.state).toEqual({
      selected: "gpt-5.6-sol",
      applied: "gpt-5.6-sol",
    });
    expect(modelFeedback(confirmation.state, options)).toMatchObject({
      title: "MODEL",
      value: "SOL",
      indicator: { bar_fill_c: "#35C759" },
    });
  });

  it("requires the requested model to be visible after native application", () => {
    expect(
      spawnSync(native, ["--picker-selection-fixture", "model-confirmed"])
        .status,
    ).toBe(0);
    expect(
      spawnSync(native, ["--picker-selection-fixture", "model-unchanged"])
        .status,
    ).toBe(0);
  });

  it.each(["model-future", "model-label-mismatch", "model-unsafe"])(
    "validates structured native model payload: %s",
    (scenario) => {
      expect(
        spawnSync(native, ["--selection-payload-fixture", scenario]).status,
      ).toBe(0);
    },
  );

  it("shows an explicit failed state when live application cannot be proved", () => {
    expect(
      modelFailureFeedback(pickerFailureLabel(new Error("did not confirm"))),
    ).toMatchObject({
      title: "FAILED",
      value: "VERIFY FAIL",
      indicator: { bar_fill_c: "#FF453A" },
    });
  });

  it("offers nothing if the live cache has no matching model family", () => {
    expect(supportedModelOptions({ models: [{ slug: "gpt-5.5" }] })).toEqual(
      [],
    );
  });

  it("supports future family versions and rejects unsafe labels", () => {
    expect(
      supportedModelOptions({
        models: [
          {
            slug: "gpt-5.7-terra",
            display_name: "GPT-5.7-Terra",
            default_reasoning_level: "minimal",
            supported_reasoning_levels: [
              { effort: "none" },
              { effort: "minimal" },
            ],
          },
        ],
      })[0],
    ).toMatchObject({
      slug: "gpt-5.7-terra",
      displayName: "GPT-5.7-Terra",
      pickerLabel: "Terra",
      defaultReasoning: "minimal",
      supportedReasoning: ["none", "minimal"],
    });
    expect(
      supportedModelOptions({
        models: [
          {
            slug: "gpt-5.7-terra;open",
            supported_reasoning_levels: [{ effort: "low" }],
          },
        ],
      }),
    ).toEqual([]);
  });
});
