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
    { slug: "gpt-5.6-sol" },
    { slug: "gpt-5.6-terra" },
    { slug: "gpt-5.6-luna" },
    { slug: "gpt-5.5" },
  ],
};
const options = supportedModelOptions(cache);

describe("model dial acceptance", () => {
  it("offers the live Luna, Terra, and Sol model slugs", () => {
    expect(options).toEqual([
      { slug: "gpt-5.6-luna", label: "LUNA" },
      { slug: "gpt-5.6-terra", label: "TERRA" },
      { slug: "gpt-5.6-sol", label: "SOL" },
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

    expect(confirmation.option).toEqual({
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
});
