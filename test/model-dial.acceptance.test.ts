import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  confirmModel,
  modelFeedback,
  previewModel,
  supportedModelOptions,
  type ModelDialState,
} from "../src/lib/model.js";

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
      title: "ACTIVE",
      value: "SOL",
      indicator: { bar_fill_c: "#35C759" },
    });
  });

  it("keeps command dispatch out of the encoder-turn handler", () => {
    const source = readFileSync("src/actions/model.ts", "utf8");
    const rotate = source.slice(
      source.indexOf("async onDialRotate"),
      source.indexOf("async onDialUp"),
    );
    const press = source.slice(
      source.indexOf("async onDialUp"),
      source.indexOf("async onTouchTap"),
    );

    expect(rotate).not.toContain("applyModel");
    expect(rotate).not.toContain("applyPreview");
    expect(press).toContain("applyPreview");
  });

  it("dispatches through the live Codex picker and never types /model", () => {
    const automation = readFileSync("src/lib/automation.ts", "utf8");
    const liveControl = readFileSync("src/lib/codex-ui-control.ts", "utf8");
    const action = readFileSync("src/actions/model.ts", "utf8");
    const native = readFileSync("native/CodexUIControl.swift", "utf8");
    const script = readFileSync(
      "com.todd.streamdeckcodex.sdPlugin/scripts/codex-control.applescript",
      "utf8",
    );

    expect(automation).toContain("return applyLiveModel(slug)");
    expect(automation).not.toContain("updateThreadSettings");
    expect(liveControl).toContain('invoke("model", slug)');
    expect(action).toContain("Live Codex picker retained");
    expect(action).not.toContain("codexStore.threadSettings");
    expect(native).toContain('case "model"');
    expect(native).toContain("readPickerState(appElement)");
    expect(native).toContain("Codex still shows");
    expect(script).not.toContain('keystroke "/model"');
  });

  it("shows an explicit failed state when live application cannot be proved", () => {
    const action = readFileSync("src/actions/model.ts", "utf8");
    const feedback = readFileSync("src/lib/model.ts", "utf8");

    expect(action).toContain("modelFailureFeedback");
    expect(action).toContain("pickerFailureLabel");
    expect(feedback).toContain('title: "FAILED"');
    expect(feedback).toContain('bar_fill_c: "#FF453A"');
  });

  it("offers nothing if the live cache has no matching model family", () => {
    expect(supportedModelOptions({ models: [{ slug: "gpt-5.5" }] })).toEqual(
      [],
    );
  });
});
