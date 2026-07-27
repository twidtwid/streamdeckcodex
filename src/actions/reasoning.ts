import streamDeck, {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { applyReasoning } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { pickerFailureLabel } from "../lib/codex-ui-control.js";
import {
  confirmReasoning,
  previewReasoning,
  reasoningFailureFeedback,
  reasoningFeedback,
  type ReasoningDialState,
} from "../lib/reasoning.js";
import { renderFeedback } from "../lib/render-cache.js";

type ReasoningSettings = {
  selectedLevel?: string;
  appliedLevel?: string;
};

function supportedSelection(
  current: string,
  levels: readonly string[],
): string {
  if (levels.includes(current)) return current;
  if (levels.includes("xhigh")) return "xhigh";
  return levels.at(-1) ?? "medium";
}

@action({ UUID: "com.todd.streamdeckcodex.reasoning" })
export class ReasoningAction extends SingletonAction<ReasoningSettings> {
  readonly #state = new Map<string, ReasoningDialState>();

  async onWillAppear(event: WillAppearEvent<ReasoningSettings>): Promise<void> {
    if (!event.action.isDial()) return;
    const snapshot = codexStore.reasoningSnapshot();
    const applied = snapshot.current;
    const configured = event.payload.settings.selectedLevel;
    const selected =
      configured && snapshot.levels.includes(configured)
        ? configured
        : supportedSelection(applied, snapshot.levels);
    const state = { selected, applied };
    this.#state.set(event.action.id, state);
    await this.draw(event.action, state, snapshot.levels);
  }

  async onDialRotate(event: DialRotateEvent<ReasoningSettings>): Promise<void> {
    const snapshot = codexStore.reasoningSnapshot();
    const current = this.#state.get(event.action.id) ?? {
      selected: supportedSelection(snapshot.current, snapshot.levels),
      applied: snapshot.current,
    };
    const state = previewReasoning(
      current,
      event.payload.ticks,
      snapshot.levels,
    );
    this.#state.set(event.action.id, state);
    await event.action.setSettings({
      ...event.payload.settings,
      selectedLevel: state.selected,
      appliedLevel: state.applied,
    });
    await this.draw(event.action, state, snapshot.levels);
    streamDeck.logger.info(
      `Reasoning preview ${state.applied} -> ${state.selected}; waiting for dial press`,
    );
  }

  async onDialUp(event: DialUpEvent<ReasoningSettings>): Promise<void> {
    await this.applyPreview(event.action.id, event.action);
  }

  async refreshAll(): Promise<void> {
    const snapshot = codexStore.reasoningSnapshot();
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isDial())
        .map((visible) => {
          const previous = this.#state.get(visible.id);
          const state = previous
            ? {
                selected: snapshot.levels.includes(previous.selected)
                  ? previous.selected
                  : supportedSelection(snapshot.current, snapshot.levels),
                applied: snapshot.current,
              }
            : {
                selected: supportedSelection(snapshot.current, snapshot.levels),
                applied: snapshot.current,
              };
          this.#state.set(visible.id, state);
          return this.draw(visible, state, snapshot.levels);
        }),
    );
  }

  private async applyPreview(
    context: string,
    actionInstance: Action<ReasoningSettings>,
  ): Promise<void> {
    const snapshot = codexStore.reasoningSnapshot();
    const current = this.#state.get(context) ?? {
      selected: supportedSelection(snapshot.current, snapshot.levels),
      applied: snapshot.current,
    };
    if (!snapshot.levels.includes(current.selected)) {
      const state = {
        selected: supportedSelection(snapshot.current, snapshot.levels),
        applied: snapshot.current,
      };
      this.#state.set(context, state);
      await this.draw(actionInstance, state, snapshot.levels);
      streamDeck.logger.warn(
        `Ignored unsupported reasoning level ${current.selected} for ${snapshot.model ?? "current model"}`,
      );
      await actionInstance.showAlert();
      return;
    }
    await this.apply(context, actionInstance, current.selected);
  }

  private async apply(
    context: string,
    actionInstance: Action<ReasoningSettings>,
    level: string,
  ): Promise<void> {
    try {
      streamDeck.logger.info(`Applying reasoning level ${level} on dial press`);
      const snapshot = codexStore.reasoningSnapshot();
      const optionIndex = snapshot.levels.indexOf(level);
      if (optionIndex < 0)
        throw new Error(`Unsupported reasoning level ${level}`);
      if (!snapshot.threadId) throw new Error("No active Codex task");
      const live = await applyReasoning(level, snapshot.threadId);
      const expected = level === "low" ? "light" : level;
      const actual = live.effort
        ?.toLowerCase()
        .replaceAll(" ", "")
        .replace("extra", "x");
      if (actual !== expected) {
        throw new Error(
          `Live Codex picker retained ${live.effort ?? "no effort"} instead of ${level}`,
        );
      }
      codexStore.invalidate();
      const state = confirmReasoning({ selected: level, applied: "" }).state;
      this.#state.set(context, state);
      await actionInstance.setSettings({
        selectedLevel: level,
        appliedLevel: level,
      });
      await this.draw(
        actionInstance,
        state,
        codexStore.reasoningSnapshot().levels,
      );
      streamDeck.logger.info(`Applied reasoning level ${level}`);
    } catch (error) {
      streamDeck.logger.error(
        `Failed to apply reasoning level ${level}`,
        error,
      );
      if (actionInstance.isDial()) {
        await renderFeedback(
          actionInstance,
          reasoningFailureFeedback(pickerFailureLabel(error)),
        );
      }
      await actionInstance.showAlert();
    }
  }

  private async draw(
    actionInstance: Action<ReasoningSettings>,
    state: ReasoningDialState,
    levels: readonly string[],
  ): Promise<void> {
    if (!actionInstance.isDial()) return;
    await renderFeedback(actionInstance, reasoningFeedback(state, levels));
  }
}
