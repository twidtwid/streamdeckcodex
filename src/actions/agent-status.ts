import {
  action,
  type Action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { openNewChat, openThread } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { agentKeySvg, svgDataUrl } from "../lib/visuals.js";
import { renderKey } from "../lib/render-cache.js";

type AgentSettings = {
  slot?: number;
};

@action({ UUID: "com.todd.streamdeckcodex.agent-status" })
export class AgentStatusAction extends SingletonAction<AgentSettings> {
  async onWillAppear(event: WillAppearEvent<AgentSettings>): Promise<void> {
    await this.draw(event.action, event.payload.settings);
  }

  async onDidReceiveSettings(
    event: DidReceiveSettingsEvent<AgentSettings>,
  ): Promise<void> {
    await this.draw(event.action, event.payload.settings);
  }

  async onKeyDown(event: KeyDownEvent<AgentSettings>): Promise<void> {
    const slot = this.slotFrom(
      event.payload.settings,
      (event.action.coordinates?.column ?? 0) + 1,
    );
    const snapshot = codexStore.sessions(8)[slot];
    try {
      if (snapshot) {
        codexStore.acknowledge(snapshot.id);
        await openThread(snapshot.id);
      } else {
        await openNewChat(codexStore.latestThread()?.cwd);
      }
      await this.draw(event.action);
    } catch {
      await event.action.showAlert();
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isKey())
        .map((visible) => this.draw(visible)),
    );
  }

  private async draw(
    actionInstance: Action<AgentSettings>,
    receivedSettings?: AgentSettings,
  ): Promise<void> {
    if (!actionInstance.isKey()) return;
    const settings =
      receivedSettings ?? (await actionInstance.getSettings<AgentSettings>());
    const slot = this.slotFrom(
      settings,
      (actionInstance.coordinates?.column ?? 0) + 1,
    );
    const snapshot = codexStore.sessions(8)[slot];
    await renderKey(actionInstance, svgDataUrl(agentKeySvg(snapshot, slot)));
  }

  private slotFrom(settings: AgentSettings, fallback = 1): number {
    const raw = Number(settings.slot ?? fallback);
    const oneBased = Number.isFinite(raw) ? Math.trunc(raw) : 1;
    return Math.max(0, Math.min(7, oneBased - 1));
  }
}
