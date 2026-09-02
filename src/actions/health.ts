import {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { AVAILABILITY_LABEL } from "../lib/availability.js";
import { codexStore } from "../lib/codex-store.js";
import {
  collectHealth,
  HEALTH_COMPONENTS,
  type HealthComponent,
} from "../lib/health.js";
import { renderKey } from "../lib/render-cache.js";
import { healthKeySvg, svgDataUrl } from "../lib/visuals.js";

@action({ UUID: "com.todd.streamdeckcodex.health" })
export class HealthAction extends SingletonAction {
  readonly #selection = new Map<string, number>();

  async onWillAppear(event: WillAppearEvent): Promise<void> {
    if (!event.action.isKey()) return;
    this.#selection.set(event.action.id, 0);
    await this.draw(event.action);
  }

  async onKeyDown(event: KeyDownEvent): Promise<void> {
    const next =
      ((this.#selection.get(event.action.id) ?? 0) + 1) %
      HEALTH_COMPONENTS.length;
    this.#selection.set(event.action.id, next);
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
    const snapshot = await collectHealth(codexStore);
    const component = HEALTH_COMPONENTS[
      this.#selection.get(actionInstance.id) ?? 0
    ] as HealthComponent;
    const availability = snapshot.components[component];
    await renderKey(
      actionInstance,
      svgDataUrl(
        healthKeySvg(
          component,
          availability.state === "ready"
            ? availability.value
            : AVAILABILITY_LABEL[availability.reason],
          availability.state === "ready",
        ),
      ),
    );
  }
}
