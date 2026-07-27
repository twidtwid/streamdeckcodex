import {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { openNewChat, openThread } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { statusIndicator } from "../lib/visuals.js";
import { renderFeedback } from "../lib/render-cache.js";

type NavigatorSettings = {
  index?: number;
};

@action({ UUID: "com.todd.streamdeckcodex.agent-navigator" })
export class AgentNavigatorAction extends SingletonAction<NavigatorSettings> {
  readonly #selection = new Map<string, number>();

  async onWillAppear(event: WillAppearEvent<NavigatorSettings>): Promise<void> {
    if (!event.action.isDial()) return;
    const sessions = codexStore.sessions(8);
    const activeIndex = sessions.findIndex((session) => session.isActive);
    const index =
      activeIndex >= 0
        ? activeIndex
        : Math.max(0, Number(event.payload.settings.index ?? 0));
    this.#selection.set(event.action.id, index);
    await this.draw(event.action);
  }

  async onDialRotate(event: DialRotateEvent<NavigatorSettings>): Promise<void> {
    const sessions = codexStore.sessions(8);
    if (sessions.length === 0) return;
    const current = this.#selection.get(event.action.id) ?? 0;
    const next =
      (((current + Math.sign(event.payload.ticks)) % sessions.length) +
        sessions.length) %
      sessions.length;
    this.#selection.set(event.action.id, next);
    await event.action.setSettings({ ...event.payload.settings, index: next });
    await this.draw(event.action);
  }

  async onDialUp(event: DialUpEvent<NavigatorSettings>): Promise<void> {
    await this.openSelected(event.action.id, event.action);
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isDial())
        .map((visible) => this.draw(visible)),
    );
  }

  private async openSelected(
    context: string,
    actionInstance: Action<NavigatorSettings>,
  ): Promise<void> {
    const selected = codexStore.sessions(8)[this.#selection.get(context) ?? 0];
    try {
      if (selected) {
        codexStore.acknowledge(selected.id);
        await openThread(selected.id);
      } else {
        await openNewChat();
      }
      if (actionInstance.isDial()) await this.draw(actionInstance);
    } catch {
      await actionInstance.showAlert();
    }
  }

  private async draw(actionInstance: Action<NavigatorSettings>): Promise<void> {
    if (!actionInstance.isDial()) return;
    const sessions = codexStore.sessions(8);
    const rawIndex = this.#selection.get(actionInstance.id) ?? 0;
    const index =
      sessions.length === 0 ? 0 : Math.min(rawIndex, sessions.length - 1);
    this.#selection.set(actionInstance.id, index);
    const selected = sessions[index];
    await renderFeedback(actionInstance, {
      title: selected ? `SESSION ${index + 1}/${sessions.length}` : "SESSION",
      value: selected ? selected.sessionLabel : "NEW",
      indicator: statusIndicator(selected?.status ?? "off"),
    });
  }
}
