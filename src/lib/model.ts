import type { ModelOption } from "../types.js";

const MODEL_FAMILIES = ["luna", "terra", "sol"] as const;

export interface ModelDialState {
  selected: string;
  applied: string;
}

interface CachedModel {
  slug?: string;
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
        candidate.slug.toLowerCase().endsWith(`-${family}`),
    );
    if (!model?.slug) return [];
    return [
      {
        slug: model.slug,
        label: family.toUpperCase(),
      },
    ];
  });
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
    title: pending ? "PENDING" : "ACTIVE",
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
