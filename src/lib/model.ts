import type { ModelOption } from "../types.js";
import { normalizeReasoningLevels } from "./reasoning.js";

const MODEL_FAMILIES = ["luna", "terra", "sol"] as const;
const MODEL_SLUG = /^gpt-[a-z0-9.-]+-(luna|terra|sol)$/i;
const SAFE_DISPLAY_NAME = /^[a-z0-9 ._-]{1,64}$/i;
const REASONING_LEVELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultra",
]);

export interface ModelDialState {
  selected: string;
  applied: string;
}

interface CachedModel {
  slug?: string;
  display_name?: string;
  default_reasoning_level?: string;
  supported_reasoning_levels?: Array<{ effort?: string }>;
}

export function supportedModelOptions(parsed: unknown): ModelOption[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const models = Array.isArray((parsed as { models?: unknown }).models)
    ? ((parsed as { models: CachedModel[] }).models ?? [])
    : [];

  return MODEL_FAMILIES.flatMap((family) => {
    const model = models.find(
      (candidate) =>
        typeof candidate.slug === "string" &&
        candidate.slug.length <= 64 &&
        MODEL_SLUG.test(candidate.slug) &&
        candidate.slug.toLowerCase().endsWith(`-${family}`),
    );
    if (!model?.slug) return [];
    const supportedReasoning = normalizeReasoningLevels(
      (model.supported_reasoning_levels ?? [])
        .map((entry) => entry.effort?.toLowerCase())
        .filter(
          (effort): effort is string =>
            typeof effort === "string" && REASONING_LEVELS.has(effort),
        ),
    );
    if (supportedReasoning.length === 0) return [];
    const defaultReasoning = model.default_reasoning_level?.toLowerCase() ?? "";
    const displayName =
      typeof model.display_name === "string" &&
      SAFE_DISPLAY_NAME.test(model.display_name)
        ? model.display_name
        : model.slug;
    return [
      {
        slug: model.slug,
        label: family.toUpperCase(),
        displayName,
        pickerLabel: family[0]!.toUpperCase() + family.slice(1),
        defaultReasoning: supportedReasoning.includes(defaultReasoning)
          ? defaultReasoning
          : supportedReasoning[0]!,
        supportedReasoning,
      },
    ];
  });
}

export function supportedReasoningForModel(
  parsed: unknown,
  model: string | undefined,
): string[] {
  if (!model) return [];
  return (
    supportedModelOptions(parsed).find((option) => option.slug === model)
      ?.supportedReasoning ?? []
  );
}

export function previewModel(
  state: ModelDialState,
  ticks: number,
  options: readonly ModelOption[],
): ModelDialState {
  if (options.length === 0) return state;
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.slug === state.selected),
  );
  const index = Math.min(
    options.length - 1,
    Math.max(0, currentIndex + Math.sign(ticks)),
  );
  return { ...state, selected: options[index]!.slug };
}

export function confirmModel(
  state: ModelDialState,
  options: readonly ModelOption[],
): { option?: ModelOption; state: ModelDialState } {
  const option = options.find((candidate) => candidate.slug === state.selected);
  if (!option) return { state };
  return {
    option,
    state: { selected: option.slug, applied: option.slug },
  };
}

export function modelFeedback(
  state: ModelDialState,
  options: readonly ModelOption[],
): {
  title: string;
  value: string;
  indicator: { value: number; bar_fill_c: string };
} {
  const index = Math.max(
    0,
    options.findIndex((option) => option.slug === state.selected),
  );
  const option = options[index];
  const pending = state.selected !== state.applied;
  return {
    title: pending ? "PENDING" : "MODEL",
    value: option?.label ?? "NO MODEL",
    indicator: {
      value: options.length <= 1 ? 100 : (index / (options.length - 1)) * 100,
      bar_fill_c: pending ? "#F4B740" : "#35C759",
    },
  };
}

export function modelFailureFeedback(value: string): {
  title: string;
  value: string;
  indicator: { value: number; bar_fill_c: string };
} {
  return {
    title: "FAILED",
    value,
    indicator: { value: 0, bar_fill_c: "#FF453A" },
  };
}
