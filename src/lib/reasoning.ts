export const DEFAULT_REASONING_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export interface ReasoningDialState {
  selected: string;
  applied: string;
}

export function normalizeReasoningLevels(levels: readonly string[]): string[] {
  const preferred = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ];
  const unique = [...new Set(levels.map((level) => level.toLowerCase()))];
  return unique.sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

export function stepReasoning(
  current: string,
  ticks: number,
  levels: readonly string[],
): { level: string; index: number } {
  const normalized = normalizeReasoningLevels(levels);
  if (normalized.length === 0) return { level: current, index: 0 };
  const currentIndex = Math.max(0, normalized.indexOf(current.toLowerCase()));
  const index = Math.min(
    normalized.length - 1,
    Math.max(0, currentIndex + Math.sign(ticks)),
  );
  return { level: normalized[index] ?? normalized[0] ?? current, index };
}

export function previewReasoning(
  state: ReasoningDialState,
  ticks: number,
  levels: readonly string[],
): ReasoningDialState {
  return {
    ...state,
    selected: stepReasoning(state.selected, ticks, levels).level,
  };
}

export function confirmReasoning(state: ReasoningDialState): {
  level: string;
  state: ReasoningDialState;
} {
  return {
    level: state.selected,
    state: { selected: state.selected, applied: state.selected },
  };
}

export function reasoningFeedback(
  state: ReasoningDialState,
  levels: readonly string[],
): {
  title: string;
  value: string;
  indicator: { value: number; bar_fill_c: string };
} {
  const normalized = normalizeReasoningLevels(levels);
  const index = Math.max(0, normalized.indexOf(state.selected));
  const pending = state.selected !== state.applied;
  return {
    title: pending ? "PENDING" : "ACTIVE",
    value: state.selected.toUpperCase(),
    indicator: {
      value:
        normalized.length <= 1 ? 100 : (index / (normalized.length - 1)) * 100,
      bar_fill_c: pending ? "#F4B740" : "#35C759",
    },
  };
}

export function reasoningFailureFeedback(value: string): {
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
