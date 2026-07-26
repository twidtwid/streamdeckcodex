import {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { codexStore } from "../lib/codex-store.js";
import { toggleContextView, type ContextView } from "../lib/context.js";
import { contextKeySvg, svgDataUrl } from "../lib/visuals.js";

@action({ UUID: "com.todd.streamdeckcodex.context" })
export class ContextAction extends SingletonAction {
  readonly #mode = new Map<string, ContextView>();

  async onWillAppear(event: WillAppearEvent): Promise<void> {
    if (!event.action.isKey()) return;
    this.#mode.set(event.action.id, "remaining");
    await this.draw(event.action);
  }

  async onKeyDown(event: KeyDownEvent): Promise<void> {
    const current = this.#mode.get(event.action.id) ?? "remaining";
    this.#mode.set(event.action.id, toggleContextView(current));
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
    await actionInstance.setImage(
      svgDataUrl(
        contextKeySvg(
          codexStore.contextSnapshot(),
          this.#mode.get(actionInstance.id) ?? "remaining",
        ),
      ),
    );
    await actionInstance.setTitle("");
  }
}
