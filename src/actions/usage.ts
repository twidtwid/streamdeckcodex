import {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { codexStore } from "../lib/codex-store.js";
import { toggleUsageView, type UsageView } from "../lib/usage.js";
import { svgDataUrl, usageKeySvg } from "../lib/visuals.js";
import { renderKey } from "../lib/render-cache.js";

@action({ UUID: "com.todd.streamdeckcodex.usage" })
export class UsageAction extends SingletonAction {
  readonly #mode = new Map<string, UsageView>();

  async onWillAppear(event: WillAppearEvent): Promise<void> {
    if (!event.action.isKey()) return;
    this.#mode.set(event.action.id, "weekly");
    await this.draw(event.action);
  }

  async onKeyDown(event: KeyDownEvent): Promise<void> {
    const current = this.#mode.get(event.action.id) ?? "weekly";
    this.#mode.set(event.action.id, toggleUsageView(current));
    await this.draw(event.action);
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isKey())
        .map((visible) => this.draw(visible)),
    );
  }

  private async draw(actionInstance: Action): Promise<void> {
    if (!actionInstance.isKey()) return;
    const snapshot = codexStore.usageSnapshotCached();
    await renderKey(
      actionInstance,
      svgDataUrl(
        usageKeySvg(snapshot, this.#mode.get(actionInstance.id) ?? "weekly"),
      ),
    );
  }
}
