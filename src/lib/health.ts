import type { CodexStore } from "./codex-store.js";
import { BUILD_INFO, type BuildInfo } from "./build-info.js";
import { inputReleaseSnapshot } from "./automation.js";
import { ready, unavailable, type Availability } from "./availability.js";

export const HEALTH_COMPONENTS = [
  "focus",
  "permissions",
  "context",
  "model",
  "reasoning",
  "usage",
  "input",
] as const;

export type HealthComponent = (typeof HEALTH_COMPONENTS)[number];
export type HealthSnapshot = Readonly<{
  build: BuildInfo;
  observedAt: number;
  components: Record<HealthComponent, Availability<string>>;
}>;

function summarize<T>(
  availability: Availability<T>,
  value: (readyValue: T) => string,
): Availability<string> {
  return availability.state === "ready"
    ? ready(value(availability.value), availability.observedAt)
    : availability;
}

/**
 * Summarize what the store last observed. This reads only cached state, so
 * the per-tick transition log costs no native or child-process work. A caller
 * that wants a live snapshot (the doctor) observes the store first.
 */
export function collectHealth(store: CodexStore): HealthSnapshot {
  const composer = store.liveComposerAvailability();
  const input = inputReleaseSnapshot();
  const inputHealth: Availability<string> = input.held
    ? unavailable(
        input.lastRecord?.result === "failed" ? "not-exposed" : "busy",
      )
    : ready(input.lastRecord?.result ?? "released");
  return {
    build: BUILD_INFO,
    observedAt: Date.now(),
    components: {
      focus:
        composer.state === "ready"
          ? ready("focused", composer.observedAt)
          : composer,
      permissions: summarize(store.permissionAvailability(), (mode) => mode),
      context: summarize(
        store.contextAvailability(),
        (snapshot) => `${snapshot.remainingPercent}% left`,
      ),
      model: summarize(
        store.modelAvailability(),
        (snapshot) => snapshot.current || "available",
      ),
      reasoning: summarize(
        store.reasoningAvailability(),
        (snapshot) => snapshot.current,
      ),
      usage: summarize(
        store.usageAvailabilityCached(),
        (snapshot) => `${Math.round(100 - snapshot.usedPercent)}% left`,
      ),
      input: inputHealth,
    },
  };
}

export class HealthTransitionLogger {
  readonly #previous = new Map<HealthComponent, string>();

  observe(snapshot: HealthSnapshot, log: (message: string) => void): void {
    for (const component of HEALTH_COMPONENTS) {
      const availability = snapshot.components[component];
      const state =
        availability.state === "ready"
          ? "ready"
          : (`unavailable:${availability.reason}` as const);
      if (this.#previous.get(component) === state) continue;
      this.#previous.set(component, state);
      log(`Health ${component} changed to ${state}`);
    }
  }
}
