import streamDeck, {
  action,
  type Action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import {
  executeCommand,
  launchWorkflow,
  openNewChat,
  openNewProject,
  openSkills,
} from "../lib/automation.js";
import { COMMANDS } from "../lib/commands.js";
import { codexStore } from "../lib/codex-store.js";
import { keycapWorkflow } from "../lib/keycap-workflows.js";
import { keycapSvg, svgDataUrl } from "../lib/visuals.js";
import { renderKey } from "../lib/render-cache.js";

type KeycapSettings = {
  label?: string;
  description?: string;
  icon?: string;
  action?:
    | "new-chat"
    | "new-project"
    | "skills"
    | "info"
    | `command:${string}`
    | `workflow:${string}`;
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
      else if (actionKind === "new-project") {
        const focusedThread = codexStore.focusedThread();
        if (!focusedThread)
          throw new Error("No focused Codex task is available.");
        await openNewProject(focusedThread.id);
      } else if (actionKind === "skills") await openSkills();
      else if (actionKind.startsWith("workflow:")) {
        const id = actionKind.slice("workflow:".length);
        const workflow = keycapWorkflow(id);
        if (!workflow) throw new Error("unsupported keycap workflow");
        const focusedThread = codexStore.focusedThread();
        if (!focusedThread) {
          throw new Error("No focused Codex task is available.");
        }
        await launchWorkflow(workflow, focusedThread.id, focusedThread.cwd);
      } else if (actionKind.startsWith("command:")) {
        const id = actionKind.slice("command:".length);
        const command = COMMANDS.find((candidate) => candidate.id === id);
        // Dictation is intentionally excluded: press-to-talk requires matched
        // down/up lifecycle handling, not a one-shot keycap dispatch.
        if (!command || command.id === "dictate")
          throw new Error("unsupported keycap command");
        const focusedThread = codexStore.focusedThread();
        if (!focusedThread) {
          throw new Error("No focused Codex task is available.");
        }
        await executeCommand(command, focusedThread.id);
      } else {
        // Unknown settings are not allowed to dispatch an unlabeled action.
        await event.action.showAlert();
        return;
      }
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.error(`Keycap ${actionKind} failed`, error);
      await event.action.showAlert();
    }
  }

  private async draw(actionInstance: Action<KeycapSettings>): Promise<void> {
    if (!actionInstance.isKey()) return;
    const settings = await actionInstance.getSettings<KeycapSettings>();
    await renderKey(
      actionInstance,
      svgDataUrl(
        keycapSvg(
          settings.label ?? "Keycap",
          settings.description ?? "INFO",
          settings.icon ?? "command",
        ),
      ),
    );
  }
}
