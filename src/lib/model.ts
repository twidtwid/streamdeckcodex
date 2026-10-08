import type { ModelOption } from "../types.js";
import { normalizeReasoningLevels } from "./reasoning.js";
import type { DialFeedback } from "./visuals.js";

export const FALLBACK_MODEL_FAMILIES = [
  "luna",
  "terra",
  "sol",
  "astra",
] as const;
const MODEL_SLUG = /^gpt-[a-z0-9.-]+-([a-z][a-z0-9]{0,31})$/i;
const SAFE_DISPLAY_NAME = /^[a-z0-9 ._-]{1,64}$/i;
const REASONING_LEVELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
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

function cachedModels(parsed: unknown): CachedModel[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  return Array.isArray((parsed as { models?: unknown }).models)
    ? ((parsed as { models: CachedModel[] }).models ?? [])
    : [];
}

function familyFromSlug(slug: string): string | undefined {
  if (slug.length > 64) return undefined;
  const match = MODEL_SLUG.exec(slug);
  return match?.[1]?.toLowerCase();
}

/**
 * Families advertised by the live catalog, in the Luna → Terra → Sol → Astra
 * order when those are present, then any additional matching suffixes. A
 * missing or empty cache keeps the current four-family fallback.
 */
export function modelFamiliesFromCache(parsed: unknown): string[] {
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const candidate of cachedModels(parsed)) {
    if (typeof candidate?.slug !== "string") continue;
    const family = familyFromSlug(candidate.slug);
    if (!family || seen.has(family)) continue;
    seen.add(family);
    if (!(FALLBACK_MODEL_FAMILIES as readonly string[]).includes(family)) {
      extras.push(family);
    }
  }
  if (seen.size === 0) return [...FALLBACK_MODEL_FAMILIES];
  return [
    ...FALLBACK_MODEL_FAMILIES.filter((family) => seen.has(family)),
    ...extras,
  ];
}

export function supportedModelOptions(parsed: unknown): ModelOption[] {
  const models = cachedModels(parsed);

  return modelFamiliesFromCache(parsed).flatMap((family) => {
    const model = models.find(
      (candidate) =>
        typeof candidate?.slug === "string" &&
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
            typeof effort === "string" &&
            REASONING_LEVELS.has(effort) &&
            // Current desktops advertise Max in the cache but skip it in Power.
            effort !== "max",
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
): DialFeedback {
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
