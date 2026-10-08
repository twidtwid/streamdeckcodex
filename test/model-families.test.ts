import { describe, expect, it } from "vitest";
import {
  FALLBACK_MODEL_FAMILIES,
  modelFamiliesFromCache,
  supportedModelOptions,
} from "../src/lib/model.js";

function catalog(
  models: Array<{
    slug: string;
    display_name?: string;
    default_reasoning_level?: string;
    supported_reasoning_levels?: string[];
  }>,
) {
  return {
    models: models.map((model) => ({
      ...model,
      default_reasoning_level: model.default_reasoning_level ?? "medium",
      supported_reasoning_levels: (
        model.supported_reasoning_levels ?? ["medium"]
      ).map((effort) => ({ effort })),
    })),
  };
}

describe("model dial families from cache", () => {
  it("falls back to Luna, Terra, Sol, and Astra when the cache is missing", () => {
    expect(modelFamiliesFromCache(undefined)).toEqual([
      ...FALLBACK_MODEL_FAMILIES,
    ]);
    expect(modelFamiliesFromCache(null)).toEqual([...FALLBACK_MODEL_FAMILIES]);
    expect(modelFamiliesFromCache({ models: [] })).toEqual([
      ...FALLBACK_MODEL_FAMILIES,
    ]);
    expect(supportedModelOptions(undefined)).toEqual([]);
  });

  it("keeps the current family order and strips cache-only Max", () => {
    const options = supportedModelOptions(
      catalog([
        { slug: "gpt-6-astra", supported_reasoning_levels: ["medium", "max"] },
        { slug: "gpt-5.6-sol", supported_reasoning_levels: ["low", "max"] },
        { slug: "gpt-5.6-terra" },
        { slug: "gpt-5.6-luna" },
      ]),
    );
    expect(options.map((option) => option.label)).toEqual([
      "LUNA",
      "TERRA",
      "SOL",
      "ASTRA",
    ]);
    expect(
      options.map((option) => option.supportedReasoning).flat(),
    ).not.toContain("max");
  });

  it("does not invent fallback families for a partial catalog", () => {
    expect(
      supportedModelOptions(catalog([{ slug: "gpt-6-astra" }])).map(
        (option) => option.label,
      ),
    ).toEqual(["ASTRA"]);
  });

  it("derives additional families from matching slugs", () => {
    const options = supportedModelOptions(
      catalog([
        { slug: "gpt-7-helix", display_name: "GPT-7-Helix" },
        { slug: "gpt-5.6-luna" },
        { slug: "gpt-5.5" },
      ]),
    );
    expect(options.map((option) => option.label)).toEqual(["LUNA", "HELIX"]);
    expect(options[1]).toMatchObject({
      slug: "gpt-7-helix",
      pickerLabel: "Helix",
      displayName: "GPT-7-Helix",
    });
  });

  it("rejects unsafe slugs and cache-only reasoning", () => {
    expect(
      supportedModelOptions(
        catalog([
          { slug: "gpt-5.7-terra;open", supported_reasoning_levels: ["low"] },
          { slug: "gpt-5.6-sol", supported_reasoning_levels: ["max"] },
        ]),
      ),
    ).toEqual([]);
  });
});
