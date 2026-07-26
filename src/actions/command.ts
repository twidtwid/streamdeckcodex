import {
  action,
  type Action,
  type DialDownEvent,
  type DialRotateEvent,
  type DialUpEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  endDictation,
  executeCommand,
  runControl,
  startDictation,
} from "../lib/automation.js";
import {
  commandAt,
  COMMANDS,
  type CommandDefinition,
} from "../lib/commands.js";
import { commandKeySvg, svgDataUrl } from "../lib/visuals.js";
import { codexStore } from "../lib/codex-store.js";
import { pickerFailureLabel } from "../lib/codex-ui-control.js";

type CommandSettings = {
  commandId?: string;
  commandIndex?: number;
};

function configuredCommand(settings: CommandSettings): CommandDefinition {
  if (settings.commandId) {
    const commandId =
      settings.commandId === "approve"
        ? "accept"
        : settings.commandId === "decline"
          ? "reject"
          : settings.commandId;
    const match = COMMANDS.find((candidate) => candidate.id === commandId);
    if (match) return match;
  }
  return commandAt(Number(settings.commandIndex ?? 0));
}

@action({ UUID: "com.todd.streamdeckcodex.command" })
export class CommandAction extends SingletonAction<CommandSettings> {
  readonly #selection = new Map<string, number>();
  readonly #modeState = new Map<string, boolean>();

  async onWillAppear(event: WillAppearEvent<CommandSettings>): Promise<void> {
    const configured = configuredCommand(event.payload.settings);
    const index = Math.max(0, COMMANDS.indexOf(configured));
    this.#selection.set(event.action.id, index);
    await this.draw(event.action, configured);
  }

  async onDialRotate(event: DialRotateEvent<CommandSettings>): Promise<void> {
    const current = this.#selection.get(event.action.id) ?? 0;
    const index =
      (((current + Math.sign(event.payload.ticks)) % COMMANDS.length) +
        COMMANDS.length) %
      COMMANDS.length;
    this.#selection.set(event.action.id, index);
    await event.action.setSettings({
      ...event.payload.settings,
      commandIndex: index,
    });
    await this.draw(event.action, commandAt(index));
  }

  async onDialDown(event: DialDownEvent<CommandSettings>): Promise<void> {
    const command = commandAt(this.#selection.get(event.action.id) ?? 0);
    if (command.id === "dictate") {
      await this.execute(event.action, command);
    }
  }

  async onDialUp(event: DialUpEvent<CommandSettings>): Promise<void> {
    const command = commandAt(this.#selection.get(event.action.id) ?? 0);
    if (command.id === "dictate") {
      try {
        await endDictation();
      } catch {
        await event.action.showAlert();
      }
      return;
    }
    await this.execute(event.action, command);
  }

  async onTouchTap(event: TouchTapEvent<CommandSettings>): Promise<void> {
    if (event.payload.hold) {
      try {
        await runControl("shortcut", "keyboard-shortcuts");
      } catch {
        await event.action.showAlert();
      }
      return;
    }
    const command = commandAt(this.#selection.get(event.action.id) ?? 0);
    if (command.id === "dictate") {
      await event.action.showAlert();
      return;
    }
    await this.execute(event.action, command);
  }

  async onWillDisappear(
    event: WillDisappearEvent<CommandSettings>,
  ): Promise<void> {
    if (configuredCommand(event.payload.settings).id === "dictate") {
      await endDictation();
    }
  }

  async onKeyDown(event: KeyDownEvent<CommandSettings>): Promise<void> {
    const command = configuredCommand(event.payload.settings);
    await this.execute(event.action, command);
  }

  async onKeyUp(event: KeyUpEvent<CommandSettings>): Promise<void> {
    if (configuredCommand(event.payload.settings).id !== "dictate") return;
    try {
      await endDictation();
      await event.action.showOk();
    } catch {
      await event.action.showAlert();
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isDial())
        .map((visible) =>
          this.draw(visible, commandAt(this.#selection.get(visible.id) ?? 0)),
        ),
    );
  }

  private async execute(
    actionInstance: Action<CommandSettings>,
    command: CommandDefinition,
  ): Promise<void> {
    try {
      if (command.id === "dictate") {
        await startDictation(codexStore.controlThread()?.id);
      } else {
        const result = await executeCommand(
          command,
          codexStore.controlThread()?.id,
        );
        if (result) {
          this.#modeState.set(actionInstance.id, result.active);
          if (actionInstance.isDial()) {
            await actionInstance.setFeedback({
              title: result.active ? "ACTIVE" : "OFF",
              value: result.mode.toUpperCase(),
              indicator: {
                value: result.active ? 100 : 0,
                bar_fill_c: result.active ? "#35C759" : "#8B949E",
              },
            });
          } else if (actionInstance.isKey()) {
            await this.draw(actionInstance, command);
          }
        }
      }
      if (actionInstance.isKey() && command.id !== "dictate") {
        await actionInstance.showOk();
      }
    } catch (error) {
      if (actionInstance.isDial() && command.mode === "mode-toggle") {
        await actionInstance.setFeedback({
          title: pickerFailureLabel(error),
          value: command.value.toUpperCase(),
          indicator: { value: 0, bar_fill_c: "#FF453A" },
        });
      }
      await actionInstance.showAlert();
    }
  }

  private async draw(
    actionInstance: Action<CommandSettings>,
    command: CommandDefinition,
  ): Promise<void> {
    if (actionInstance.isDial()) {
      const index = Math.max(0, COMMANDS.indexOf(command));
      await actionInstance.setFeedback({
        title: "Action",
        value: command.dialLabel ?? command.label,
        indicator: {
          value: ((index + 1) / COMMANDS.length) * 100,
          bar_fill_c: "#2F81F7",
        },
      });
    } else if (actionInstance.isKey()) {
      await actionInstance.setImage(
        svgDataUrl(
          commandKeySvg(
            command.label,
            command.accent,
            command.icon,
            command.mode === "mode-toggle" &&
              this.#modeState.has(actionInstance.id)
              ? this.#modeState.get(actionInstance.id)
                ? "ACTIVE"
                : "OFF"
              : undefined,
          ),
        ),
      );
      await actionInstance.setTitle("");
    }
  }
}
