import streamDeck, {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  endDictation,
  executeCommand,
  startDictation,
} from "../lib/automation.js";
import {
  commandAt,
  COMMANDS,
  dialCommandAt,
  DIAL_COMMANDS,
  type CommandDefinition,
} from "../lib/commands.js";
import { commandKeySvg, svgDataUrl } from "../lib/visuals.js";
import { codexStore } from "../lib/codex-store.js";
import { pickerFailureLabel } from "../lib/codex-ui-control.js";
import { renderFeedback, renderKey } from "../lib/render-cache.js";

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

function configuredDialCommand(settings: CommandSettings): CommandDefinition {
  if (settings.commandId) {
    const match = DIAL_COMMANDS.find(
      (candidate) => candidate.id === settings.commandId,
    );
    if (match) return match;
  }
  return dialCommandAt(Number(settings.commandIndex ?? 0));
}

@action({ UUID: "com.todd.streamdeckcodex.command" })
export class CommandAction extends SingletonAction<CommandSettings> {
  readonly #selection = new Map<string, number>();
  readonly #modeState = new Map<string, boolean>();

  private modeStateKey(actionId: string, commandId: string): string {
    return `${actionId}:${commandId}`;
  }

  async onWillAppear(event: WillAppearEvent<CommandSettings>): Promise<void> {
    const configured = event.action.isDial()
      ? configuredDialCommand(event.payload.settings)
      : configuredCommand(event.payload.settings);
    const index = Math.max(
      0,
      (event.action.isDial() ? DIAL_COMMANDS : COMMANDS).indexOf(configured),
    );
    this.#selection.set(event.action.id, index);
    await this.draw(event.action, configured);
  }

  async onDialRotate(event: DialRotateEvent<CommandSettings>): Promise<void> {
    const current = this.#selection.get(event.action.id) ?? 0;
    const index =
      (((current + Math.sign(event.payload.ticks)) % DIAL_COMMANDS.length) +
        DIAL_COMMANDS.length) %
      DIAL_COMMANDS.length;
    this.#selection.set(event.action.id, index);
    await event.action.setSettings({
      ...event.payload.settings,
      commandIndex: index,
    });
    await this.draw(event.action, dialCommandAt(index));
  }

  async onDialUp(event: DialUpEvent<CommandSettings>): Promise<void> {
    const command = dialCommandAt(this.#selection.get(event.action.id) ?? 0);
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

  private async execute(
    actionInstance: Action<CommandSettings>,
    command: CommandDefinition,
  ): Promise<void> {
    try {
      if (command.id === "new-chat") {
        await executeCommand(command);
        if (actionInstance.isKey()) await actionInstance.showOk();
        return;
      }
      const focusedThread = codexStore.focusedThread();
      if (!focusedThread)
        throw new Error("No focused Codex task is available.");
      if (command.id === "dictate") {
        await startDictation(focusedThread.id);
      } else {
        const result = await executeCommand(command, focusedThread.id);
        if (result) {
          this.#modeState.set(
            this.modeStateKey(actionInstance.id, command.id),
            result.active,
          );
          if (actionInstance.isDial()) {
            await this.draw(actionInstance, command);
          } else if (actionInstance.isKey()) {
            await this.draw(actionInstance, command);
          }
        }
      }
      if (actionInstance.isKey() && command.id !== "dictate") {
        await actionInstance.showOk();
      }
    } catch (error) {
      streamDeck.logger.error(`Command ${command.id} failed`, error);
      if (actionInstance.isDial() && command.mode === "mode-toggle") {
        await renderFeedback(actionInstance, {
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
      const index = Math.max(0, DIAL_COMMANDS.indexOf(command));
      const modeState = this.#modeState.get(
        this.modeStateKey(actionInstance.id, command.id),
      );
      await renderFeedback(actionInstance, {
        title:
          command.mode === "mode-toggle" && modeState !== undefined
            ? modeState
              ? "ACTIVE"
              : "OFF"
            : "ACTION",
        value: command.dialLabel ?? command.label,
        indicator: {
          value:
            command.mode === "mode-toggle" && modeState !== undefined
              ? modeState
                ? 100
                : 0
              : ((index + 1) / DIAL_COMMANDS.length) * 100,
          bar_fill_c:
            command.mode === "mode-toggle" && modeState !== undefined
              ? modeState
                ? "#35C759"
                : "#8B949E"
              : "#2F81F7",
        },
      });
    } else if (actionInstance.isKey()) {
      await renderKey(
        actionInstance,
        svgDataUrl(
          commandKeySvg(
            command.label,
            command.accent,
            command.icon,
            command.mode === "mode-toggle" &&
              this.#modeState.has(
                this.modeStateKey(actionInstance.id, command.id),
              )
              ? this.#modeState.get(
                  this.modeStateKey(actionInstance.id, command.id),
                )
                ? "ACTIVE"
                : "OFF"
              : undefined,
          ),
        ),
      );
    }
  }
}
