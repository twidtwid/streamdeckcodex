import streamDeck, {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { applyReasoning, openReasoningMenu } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { pickerFailureLabel } from "../lib/codex-ui-control.js";
import {
  confirmReasoning,
  previewReasoning,
  reasoningFailureFeedback,
  reasoningFeedback,
  type ReasoningDialState,
} from "../lib/reasoning.js";

type ReasoningSettings = {
  selectedLevel?: string;
  appliedLevel?: string;
};

@action({ UUID: "com.todd.streamdeckcodex.reasoning" })
export class ReasoningAction extends SingletonAction<ReasoningSettings> {
  readonly #state = new Map<string, ReasoningDialState>();

  async onWillAppear(event: WillAppearEvent<ReasoningSettings>): Promise<void> {
    if (!event.action.isDial()) return;
    const snapshot = codexStore.reasoningSnapshot();
    const applied = snapshot.current;
    const configured = event.payload.settings.selectedLevel;
    const selected =
      configured && snapshot.levels.includes(configured) ? configured : applied;
    const state = { selected, applied };
    this.#state.set(event.action.id, state);
    await this.draw(event.action, state);
  }

  async onDialRotate(event: DialRotateEvent<ReasoningSettings>): Promise<void> {
    const snapshot = codexStore.reasoningSnapshot();
    const current = this.#state.get(event.action.id) ?? {
      selected: snapshot.current,
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
    await this.draw(event.action, state);
    streamDeck.logger.info(
      `Reasoning preview ${state.applied} -> ${state.selected}; waiting for dial press`,
    );
  }

  async onDialUp(event: DialUpEvent<ReasoningSettings>): Promise<void> {
    await this.applyPreview(event.action.id, event.action);
  }

  async onTouchTap(event: TouchTapEvent<ReasoningSettings>): Promise<void> {
    if (event.payload.hold) {
      try {
        await openReasoningMenu();
      } catch {
        await event.action.showAlert();
      }
      return;
    }
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
                  : snapshot.current,
                applied: snapshot.levels.includes(previous.applied)
                  ? previous.applied
                  : snapshot.current,
              }
            : {
                selected: snapshot.current,
                applied: snapshot.current,
              };
          this.#state.set(visible.id, state);
          return this.draw(visible, state);
        }),
    );
  }

  private async applyPreview(
    context: string,
    actionInstance: Action<ReasoningSettings>,
  ): Promise<void> {
    const snapshot = codexStore.reasoningSnapshot();
    const current = this.#state.get(context) ?? {
      selected: snapshot.current,
      applied: snapshot.current,
    };
    if (!snapshot.levels.includes(current.selected)) {
      const state = {
        selected: snapshot.current,
        applied: snapshot.current,
      };
      this.#state.set(context, state);
      await this.draw(actionInstance, state);
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
      const live = await applyReasoning(level);
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
      await this.draw(actionInstance, state);
      streamDeck.logger.info(`Applied reasoning level ${level}`);
    } catch (error) {
      streamDeck.logger.error(
        `Failed to apply reasoning level ${level}`,
        error,
      );
      if (actionInstance.isDial()) {
        await actionInstance.setFeedback(
          reasoningFailureFeedback(pickerFailureLabel(error)),
        );
      }
      await actionInstance.showAlert();
    }
  }

  private async draw(
    actionInstance: Action<ReasoningSettings>,
    state: ReasoningDialState,
  ): Promise<void> {
    if (!actionInstance.isDial()) return;
    const levels = codexStore.reasoningSnapshot().levels;
    await actionInstance.setFeedback(reasoningFeedback(state, levels));
  }
}
