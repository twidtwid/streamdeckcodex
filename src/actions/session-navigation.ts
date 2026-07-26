import {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { openThread } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import {
  resolveSessionNeighbor,
  type SessionDirection,
} from "../lib/session-navigation.js";
import {
  sessionNavigationKeySvg,
  svgDataUrl,
  type SessionNavigationVisualState,
} from "../lib/visuals.js";
import type { AgentStatus } from "../types.js";

type SessionNavigationSettings = {
  direction?: SessionDirection;
};

@action({ UUID: "com.todd.streamdeckcodex.session-navigation" })
export class SessionNavigationAction extends SingletonAction<SessionNavigationSettings> {
  readonly #transient = new Map<
    string,
    {
      state: SessionNavigationVisualState;
      sessionStatus?: AgentStatus;
      until: number;
    }
  >();

  async onWillAppear(
    event: WillAppearEvent<SessionNavigationSettings>,
  ): Promise<void> {
    await this.draw(event.action);
  }

  async onKeyDown(
    event: KeyDownEvent<SessionNavigationSettings>,
  ): Promise<void> {
    const direction = this.direction(event.payload.settings);
    const sessions = codexStore.sessions(8);
    const focused = sessions.find((session) => session.isActive);
    const result = resolveSessionNeighbor(sessions, focused?.id, direction);

    if (result.status === "unavailable") {
      this.setTransient(
        event.action.id,
        result.reason === "no-focused-session"
          ? "no-chat"
          : direction === "older"
            ? "oldest"
            : "newest",
        2_000,
      );
      await this.draw(event.action);
      await event.action.showAlert();
      return;
    }

    try {
      codexStore.acknowledge(result.target.id);
      codexStore.selectThread(result.target.id);
      await openThread(result.target.id);
      this.setTransient(event.action.id, "opened", 1_200, result.target.status);
      await this.draw(event.action);
    } catch {
      this.setTransient(event.action.id, "failed", 2_000);
      await this.draw(event.action);
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
    actionInstance: Action<SessionNavigationSettings>,
  ): Promise<void> {
    if (!actionInstance.isKey()) return;
    const settings =
      await actionInstance.getSettings<SessionNavigationSettings>();
    const direction = this.direction(settings);
    const transient = this.#transient.get(actionInstance.id);
    let state: SessionNavigationVisualState = "available";
    let sessionStatus: AgentStatus | undefined;
    if (transient && transient.until > Date.now()) {
      state = transient.state;
      sessionStatus = transient.sessionStatus;
    } else {
      this.#transient.delete(actionInstance.id);
      const sessions = codexStore.sessions(8);
      const focused = sessions.find((session) => session.isActive);
      const result = resolveSessionNeighbor(sessions, focused?.id, direction);
      if (result.status === "unavailable") {
        state =
          result.reason === "no-focused-session"
            ? "no-chat"
            : direction === "older"
              ? "oldest"
              : "newest";
      } else {
        sessionStatus = result.target.status;
      }
    }
    await actionInstance.setImage(
      svgDataUrl(sessionNavigationKeySvg(direction, state, sessionStatus)),
    );
    await actionInstance.setTitle("");
  }

  private direction(settings: SessionNavigationSettings): SessionDirection {
    return settings.direction === "newer" ? "newer" : "older";
  }

  private setTransient(
    actionId: string,
    state: SessionNavigationVisualState,
    durationMs: number,
    sessionStatus?: AgentStatus,
  ): void {
    this.#transient.set(actionId, {
      state,
      ...(sessionStatus === undefined ? {} : { sessionStatus }),
      until: Date.now() + durationMs,
    });
  }
}
