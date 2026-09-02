import streamDeck, {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { applyModel } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { pickerFailureLabel } from "../lib/codex-ui-control.js";
import {
  confirmModel,
  modelFailureFeedback,
  modelFeedback,
  previewModel,
  type ModelDialState,
} from "../lib/model.js";
import { renderFeedback } from "../lib/render-cache.js";

type ModelSettings = {
  selectedModel?: string;
  appliedModel?: string;
};

@action({ UUID: "com.todd.streamdeckcodex.model" })
export class ModelAction extends SingletonAction<ModelSettings> {
  readonly #state = new Map<string, ModelDialState>();

  async onWillAppear(event: WillAppearEvent<ModelSettings>): Promise<void> {
    if (!event.action.isDial()) return;
    const snapshot = codexStore.modelSnapshot();
    const fallback = snapshot.options[0]?.slug ?? "";
    const applied = snapshot.options.some(
      (option) => option.slug === snapshot.current,
    )
      ? snapshot.current
      : "";
    const configured = event.payload.settings.selectedModel;
    const selected = snapshot.options.some(
      (option) => option.slug === configured,
    )
      ? configured!
      : applied || fallback;
    const state = { selected, applied };
    this.#state.set(event.action.id, state);
    await this.draw(event.action, state, snapshot.options);
  }

  async onDialRotate(event: DialRotateEvent<ModelSettings>): Promise<void> {
    const snapshot = codexStore.modelSnapshot();
    const current = this.#state.get(event.action.id) ?? {
      selected: snapshot.current || snapshot.options[0]?.slug || "",
      applied: snapshot.current,
    };
    const state = previewModel(current, event.payload.ticks, snapshot.options);
    this.#state.set(event.action.id, state);
    await event.action.setSettings({
      ...event.payload.settings,
      selectedModel: state.selected,
      appliedModel: state.applied,
    });
    await this.draw(event.action, state, snapshot.options);
    streamDeck.logger.info(
      `Model preview ${state.applied || "other"} -> ${state.selected}; waiting for dial press`,
    );
  }

  async onDialUp(event: DialUpEvent<ModelSettings>): Promise<void> {
    await this.applyPreview(event.action.id, event.action);
  }

  async refreshAll(): Promise<void> {
    const snapshot = codexStore.modelSnapshot();
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isDial())
        .map((visible) => {
          const fallback = snapshot.options[0]?.slug ?? "";
          const previous = this.#state.get(visible.id);
          const state = previous
            ? {
                selected: snapshot.options.some(
                  (option) => option.slug === previous.selected,
                )
                  ? previous.selected
                  : snapshot.current || fallback,
                applied: snapshot.options.some(
                  (option) => option.slug === previous.applied,
                )
                  ? previous.applied
                  : snapshot.current,
              }
            : {
                selected: snapshot.current || fallback,
                applied: snapshot.current,
              };
          this.#state.set(visible.id, state);
          return this.draw(visible, state, snapshot.options);
        }),
    );
  }

  private async applyPreview(
    context: string,
    actionInstance: Action<ModelSettings>,
  ): Promise<void> {
    const snapshot = codexStore.modelSnapshot();
    const current = this.#state.get(context) ?? {
      selected: snapshot.current || snapshot.options[0]?.slug || "",
      applied: snapshot.current,
    };
    const confirmation = confirmModel(current, snapshot.options);
    if (!confirmation.option) {
      streamDeck.logger.warn(
        `Ignored unavailable model ${current.selected || "(none)"}`,
      );
      await actionInstance.showAlert();
      return;
    }

    try {
      const { option, state } = confirmation;
      if (!snapshot.threadId) throw new Error("No active Codex task");
      streamDeck.logger.info(
        `Applying model ${option.slug} to task ${snapshot.threadId} on dial press`,
      );
      const live = await applyModel(
        option.slug,
        option.pickerLabel,
        snapshot.threadId,
      );
      if (!live.model?.toLowerCase().includes(option.label.toLowerCase())) {
        throw new Error(
          `Live Codex picker retained ${live.model ?? "no model"} instead of ${option.label}`,
        );
      }
      codexStore.invalidate();
      this.#state.set(context, state);
      await actionInstance.setSettings({
        selectedModel: state.selected,
        appliedModel: state.applied,
      });
      await this.draw(
        actionInstance,
        state,
        codexStore.modelSnapshot().options,
      );
      streamDeck.logger.info(`Applied model ${option.slug}`);
    } catch (error) {
      streamDeck.logger.error(
        `Failed to apply model ${confirmation.option.slug}`,
        error,
      );
      if (actionInstance.isDial()) {
        await renderFeedback(
          actionInstance,
          modelFailureFeedback(pickerFailureLabel(error)),
        );
      }
      await actionInstance.showAlert();
    }
  }

  private async draw(
    actionInstance: Action<ModelSettings>,
    state: ModelDialState,
    options: ReturnType<typeof codexStore.modelSnapshot>["options"],
  ): Promise<void> {
    if (!actionInstance.isDial()) return;
    await renderFeedback(actionInstance, modelFeedback(state, options));
  }
}
