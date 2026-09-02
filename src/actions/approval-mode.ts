import streamDeck, {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { type CodexApprovalMode } from "../lib/codex-ui-control.js";
import { codexStore } from "../lib/codex-store.js";
import {
  approvalKeySvg,
  svgDataUrl,
  type ApprovalDisplayMode,
} from "../lib/visuals.js";
import { renderKey } from "../lib/render-cache.js";
import { availabilityReasonFromError } from "../lib/availability.js";

type ApprovalSettings = { mode?: CodexApprovalMode };

@action({ UUID: "com.todd.streamdeckcodex.approval-mode" })
export class ApprovalModeAction extends SingletonAction<ApprovalSettings> {
  async onWillAppear(event: WillAppearEvent<ApprovalSettings>): Promise<void> {
    await this.drawLive(event.action);
  }

  async onKeyDown(event: KeyDownEvent<ApprovalSettings>): Promise<void> {
    try {
      if (!codexStore.focusedThread()?.id)
        throw new Error("No focused Codex task is available.");
      const applied = await codexStore.cycleLiveComposerApprovalMode();
      await event.action.setSettings({
        ...event.payload.settings,
        mode: applied,
      });
      await this.draw(event.action, applied);
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.error("Permission mode cycle failed", error);
      await this.draw(event.action, availabilityReasonFromError(error));
      await event.action.showAlert();
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isKey())
        .map((visible) => this.drawLive(visible)),
    );
  }

  private async drawLive(
    actionInstance: Action<ApprovalSettings>,
  ): Promise<void> {
    if (!codexStore.focusedThread()?.id) {
      await this.draw(actionInstance, "no-focus");
      return;
    }
    try {
      await codexStore.refreshLiveComposer();
    } catch {
      // A read-only refresh is allowed to be unavailable while Codex is in
      // the background or between composers. The key renders the structured
      // reason; only a user-initiated press is an actionable error.
    }
    const availability = codexStore.permissionAvailability();
    await this.draw(
      actionInstance,
      availability.state === "ready" ? availability.value : availability.reason,
    );
  }

  private async draw(
    actionInstance: Action<ApprovalSettings>,
    mode: ApprovalDisplayMode,
  ): Promise<void> {
    if (!actionInstance.isKey()) return;
    await renderKey(actionInstance, svgDataUrl(approvalKeySvg(mode)));
  }
}
