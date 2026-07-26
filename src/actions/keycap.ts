import {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { executeCommand, openNewChat, openSkills } from "../lib/automation.js";
import { COMMANDS } from "../lib/commands.js";
import { codexStore } from "../lib/codex-store.js";
import { keycapSvg, svgDataUrl } from "../lib/visuals.js";

type KeycapSettings = {
  label?: string;
  description?: string;
  icon?: string;
  action?: "new-chat" | "skills" | "info" | `command:${string}`;
};

@action({ UUID: "com.todd.streamdeckcodex.keycap" })
export class KeycapAction extends SingletonAction<KeycapSettings> {
  async onWillAppear(event: WillAppearEvent<KeycapSettings>): Promise<void> {
    await this.draw(event.action);
  }

  async onKeyDown(event: KeyDownEvent<KeycapSettings>): Promise<void> {
    const settings = await event.action.getSettings<KeycapSettings>();
    const actionKind = settings.action ?? "info";
    try {
      if (actionKind === "new-chat") await openNewChat();
      else if (actionKind === "skills") await openSkills();
      else if (actionKind.startsWith("command:")) {
        const id = actionKind.slice("command:".length);
        const command = COMMANDS.find((candidate) => candidate.id === id);
        // Dictation is intentionally excluded: press-to-talk requires matched
        // down/up lifecycle handling, not a one-shot keycap dispatch.
        if (!command || command.id === "dictate")
          throw new Error("unsupported keycap command");
        await executeCommand(command, codexStore.controlThread()?.id);
      } else {
        // A reference key deliberately does not guess at a destructive action.
        await event.action.showAlert();
        return;
      }
      await event.action.showOk();
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

  private async draw(actionInstance: Action<KeycapSettings>): Promise<void> {
    if (!actionInstance.isKey()) return;
    const settings = await actionInstance.getSettings<KeycapSettings>();
    await actionInstance.setImage(
      svgDataUrl(
        keycapSvg(
          settings.label ?? "Keycap",
          settings.description ?? "INFO",
          settings.icon ?? "command",
        ),
      ),
    );
    await actionInstance.setTitle("");
  }
}
