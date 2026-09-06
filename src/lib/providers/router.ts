import streamDeck, { SingletonAction, type Action } from "@elgato/streamdeck";
import { claudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import {
  freshObservation,
  resolveProvider,
  providerSetting,
  targetKey,
  type ProviderObservation,
  type ProviderOption,
  type ProviderSetting,
} from "./types.js";
import { setProviderBadge } from "./presentation.js";
import { renderFeedback, renderKey } from "../render-cache.js";
import { keycapSvg, commandKeySvg, svgDataUrl } from "../visuals.js";
import { COMMANDS, DIAL_COMMANDS } from "../commands.js";
import { WORKFLOWS } from "../workflows.js";
import { keycapWorkflow } from "../keycap-workflows.js";

const priorModes = new Map<string, string>();
let observation: ProviderObservation = { observedAt: 0, reason: "NO DATA" };
let tail: Promise<unknown> = Promise.resolve();
/** All menu transactions and refreshes share one queue; no overlapping menus. */
export function serializeProviders<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work, work);
  tail = next.catch(() => undefined);
  return next;
}
export async function observeProviders(): Promise<void> {
  try {
    observation = await claudeProvider.read();
  } catch {
    observation = { observedAt: Date.now(), reason: "NO DATA" };
  }
}

type Settings = Record<string, any> & { provider?: ProviderSetting };
type Visible = {
  action: Action<any>;
  settings: Settings;
  provider?: string | undefined;
  identity?: string;
  preview?: { identity: string; options: ProviderOption[]; index: number };
  commandIndex?: number;
  error?: string;
};

export class ProviderAction extends SingletonAction<any> {
  override readonly manifestId: string;
  readonly #visible = new Map<string, Visible>();
  readonly #codex: CodexProvider;
  // Key-up must return to the adapter that received key-down, even after focus changes.
  readonly #held = new Map<string, Settings>();
  readonly #pressed = new Set<string>();
  constructor(action: SingletonAction<any>) {
    super();
    this.manifestId = action.manifestId!;
    this.#codex = new CodexProvider(
      action,
      (id) => this.#visible.get(id)?.provider === "codex",
    );
  }
  onWillAppear = (ev: any) => this.route("onWillAppear", ev);
  onWillDisappear = (ev: any) => this.route("onWillDisappear", ev);
  onDidReceiveSettings = (ev: any) => this.route("onDidReceiveSettings", ev);
  onKeyDown = (ev: any) => this.route("onKeyDown", ev);
  onKeyUp = (ev: any) => this.route("onKeyUp", ev);
  onDialDown = (ev: any) => this.route("onDialDown", ev);
  onDialUp = (ev: any) => this.route("onDialUp", ev);
  onDialRotate = (ev: any) => this.route("onDialRotate", ev);
  onTouchTap = (ev: any) => this.route("onTouchTap", ev);

  private update(entry: Visible): boolean {
    const foreground = freshObservation(observation)
      ? observation.foreground
      : undefined;
    const provider = resolveProvider(entry.settings.provider, foreground);
    const identity =
      provider === "codex"
        ? this.#codex.identity()
        : targetKey(observation.target);
    const changed = entry.provider !== provider || entry.identity !== identity;
    if (changed) {
      delete entry.preview;
      delete entry.error;
    }
    entry.provider = provider;
    entry.identity = identity;
    setProviderBadge(
      entry.action.id,
      entry.settings.provider === undefined ? undefined : (provider ?? "auto"),
    );
    return changed;
  }

  private route(name: string, ev: any): Promise<void> {
    const receivedAt = Date.now();
    const receivedIdentity = this.#visible.get(ev.action.id)?.identity;
    const settingsAtReceipt =
      ev.payload.settings ?? this.#visible.get(ev.action.id)?.settings ?? {};
    const pinnedCodex = providerSetting(settingsAtReceipt.provider) === "codex";
    if (name === "onKeyDown") this.#pressed.add(ev.action.id);
    if (name === "onKeyUp") {
      this.#pressed.delete(ev.action.id);
      const heldSettings = this.#held.get(ev.action.id);
      if (heldSettings) {
        this.#held.delete(ev.action.id);
        return this.#codex.event(name, {
          ...ev,
          payload: { ...ev.payload, settings: heldSettings },
        });
      }
    }
    const work = async () => {
      if (
        !pinnedCodex &&
        ["onKeyDown", "onDialRotate", "onDialUp"].includes(name) &&
        Date.now() - receivedAt > 2000
      ) {
        await ev.action.showAlert();
        return;
      }
      let entry = this.#visible.get(ev.action.id);
      if (!entry) {
        entry = { action: ev.action, settings: ev.payload.settings ?? {} };
        this.#visible.set(ev.action.id, entry);
      }
      if (ev.payload.settings) entry.settings = ev.payload.settings;
      if (name === "onWillDisappear") {
        await this.#codex.event(name, ev);
        this.#held.delete(ev.action.id);
        this.#pressed.delete(ev.action.id);
        this.#visible.delete(ev.action.id);
        setProviderBadge(ev.action.id);
        return;
      }
      // Read fresh foreground state at every input boundary. This also prevents a
      // cached automatic binding from opening Codex after switching to another app.
      if (
        !pinnedCodex &&
        !["onDidReceiveSettings", "onTouchTap"].includes(name)
      )
        await observeProviders();
      const changed = this.update(entry);
      if (name === "onDidReceiveSettings") delete entry.preview;
      if (
        !pinnedCodex &&
        receivedIdentity &&
        entry.identity !== receivedIdentity &&
        ["onKeyDown", "onDialRotate", "onDialUp"].includes(name)
      ) {
        await ev.action.showAlert();
        if (entry.provider !== "codex") await this.draw(entry);
        return;
      }
      if (entry.provider === "codex") {
        if (changed && name !== "onWillAppear") {
          const settings = { ...entry.settings };
          delete settings.selectedModel;
          delete settings.selectedLevel;
          delete settings.appliedModel;
          delete settings.appliedLevel;
          await this.#codex.event("onWillAppear", {
            ...ev,
            payload: { ...ev.payload, settings },
          });
          if (name === "onDialUp") {
            await ev.action.showAlert();
            return;
          }
        }
        if (name === "onKeyDown") {
          if (
            this.kind() === "command" &&
            this.command(entry)?.id === "dictate" &&
            !this.#pressed.has(ev.action.id)
          )
            return;
          this.#held.set(ev.action.id, { ...entry.settings });
        }
        await this.#codex.event(name, ev);
        return;
      }
      if (["onKeyUp", "onDialDown", "onTouchTap"].includes(name)) return;
      try {
        delete entry.error;
        if (["onKeyDown", "onDialUp", "onDialRotate"].includes(name)) {
          if (!entry.provider) throw new Error("NO APP");
          if (observation.foreground !== "claude")
            throw new Error("BACKGROUND");
          if (!observation.target)
            throw new Error(observation.reason ?? "NO CHAT");
          await this.claudeEvent(entry, name, ev.payload.ticks ?? 0);
        }
      } catch (error) {
        entry.error =
          error instanceof Error && error.message.length <= 24
            ? error.message
            : "UNAVAILABLE";
        streamDeck.logger.warn(
          `Claude ${this.manifestId.split(".").at(-1)}: ${error instanceof Error ? error.message : "unavailable"}`,
        );
        await ev.action.showAlert();
      }
      await this.draw(entry);
    };
    // Existing Codex-only profiles retain their original event latency. In
    // particular, PTT release must never wait behind a Claude menu observation.
    return pinnedCodex || name === "onWillDisappear"
      ? work()
      : serializeProviders(work);
  }

  async refreshAll(): Promise<void> {
    for (const entry of this.#visible.values()) {
      const changed = this.update(entry);
      if (entry.provider === "codex") {
        if (changed) {
          const settings = { ...entry.settings };
          delete settings.selectedModel;
          delete settings.selectedLevel;
          await this.#codex.event("onWillAppear", {
            action: entry.action,
            payload: { settings },
          });
        }
      } else await this.draw(entry);
    }
    await this.#codex.refresh();
  }

  private kind(): string {
    return this.manifestId.split(".").at(-1)!;
  }
  private command(entry: Visible) {
    if (entry.action.isDial())
      return DIAL_COMMANDS[
        entry.commandIndex ??
          Math.max(
            0,
            DIAL_COMMANDS.findIndex((c) => c.id === entry.settings.commandId),
          )
      ]!;
    const id =
      entry.settings.commandId ??
      COMMANDS[entry.settings.commandIndex ?? 0]?.id;
    return COMMANDS.find(
      (c) =>
        c.id ===
        (id === "approve" ? "accept" : id === "decline" ? "reject" : id),
    );
  }
  private async perform(operation: string, value?: string) {
    if (!observation.target) throw new Error("NO CHAT");
    const key = targetKey(observation.target);
    if (operation === "plan") {
      if (
        observation.permission &&
        !["Plan", "Plan mode"].includes(observation.permission)
      )
        priorModes.set(key, observation.permission);
      else value = priorModes.get(key);
    }
    const reply = await claudeProvider.perform({
      operation,
      ...(value === undefined ? {} : { value }),
      target: observation.target,
    });
    observation = reply;
    return reply;
  }
  private async claudeEvent(
    entry: Visible,
    name: string,
    ticks: number,
  ): Promise<void> {
    const kind = this.kind();
    if (kind === "model" || kind === "reasoning") {
      if (name === "onDialRotate") {
        if (!entry.preview) {
          const reply = await this.perform(`${kind}-options`);
          if (!reply.options?.length) throw new Error("UNSUPPORTED");
          const current = kind === "model" ? reply.model : reply.effort;
          entry.preview = {
            identity: targetKey(reply.target),
            options: reply.options,
            index: Math.max(
              0,
              reply.options.findIndex((o) => o.value === current),
            ),
          };
        }
        const p = entry.preview;
        p.index =
          (((p.index + Math.sign(ticks)) % p.options.length) +
            p.options.length) %
          p.options.length;
      } else if (name === "onDialUp") {
        const p = entry.preview;
        if (!p || p.identity !== targetKey(observation.target))
          throw new Error("SELECT AGAIN");
        await this.perform(kind, p.options[p.index]!.value);
        delete entry.preview;
      }
      return;
    }
    if (kind === "command" && name === "onDialRotate") {
      entry.commandIndex =
        ((entry.commandIndex ?? 0) + Math.sign(ticks) + DIAL_COMMANDS.length) %
        DIAL_COMMANDS.length;
      return;
    }
    if (name !== "onKeyDown" && name !== "onDialUp") return;
    if (["health", "usage", "context"].includes(kind)) {
      await observeProviders();
      return;
    }
    if (kind === "approval-mode") {
      await this.perform("permission-cycle");
      return;
    }
    if (kind === "command") {
      const command = this.command(entry);
      if (!command) throw new Error("UNSUPPORTED");
      await this.perform(command.id);
      return;
    }
    if (kind === "workflow") {
      const workflow = WORKFLOWS.find(
        (w) => w.id === entry.settings.workflowId,
      );
      if (!workflow) throw new Error("UNSUPPORTED");
      await this.perform("workflow", workflow.prompt);
      return;
    }
    if (kind === "keycap") {
      const action = entry.settings.action ?? "info";
      if (action.startsWith("workflow:")) {
        const workflow = keycapWorkflow(action.slice(9));
        if (!workflow) throw new Error("UNSUPPORTED");
        await this.perform("workflow", workflow.prompt);
      } else await this.perform(action.replace(/^command:/, ""));
      return;
    }
    throw new Error("UNSUPPORTED");
  }

  private async draw(entry: Visible): Promise<void> {
    const kind = this.kind();
    const active =
      entry.provider === "claude" &&
      observation.foreground === "claude" &&
      freshObservation(observation);
    const state = !freshObservation(observation)
      ? "STALE"
      : !entry.provider
        ? "NO APP"
        : !active
          ? "BACKGROUND"
          : observation.reason;
    let label = kind.replaceAll("-", " ");
    let detail = entry.error ?? state ?? "UNSUPPORTED";
    let icon = "command";
    if (kind === "model") {
      label = "Model";
      icon = "model";
      detail =
        entry.error ??
        state ??
        entry.preview?.options[entry.preview.index]?.label ??
        observation.model ??
        "NO DATA";
    }
    if (kind === "reasoning") {
      label = "Effort";
      icon = "brain-medium";
      detail =
        entry.error ??
        state ??
        entry.preview?.options[entry.preview.index]?.label ??
        observation.effort ??
        "NO DATA";
    }
    if (kind === "approval-mode") {
      label = "Permissions";
      icon = "shield";
      detail = entry.error ?? state ?? observation.permission ?? "NO DATA";
    }
    if (kind === "usage") {
      label = "Weekly left";
      icon = "usage";
    }
    if (kind === "context") {
      label = "Context left";
      icon = "context";
    }
    if (kind === "health") {
      label = "Health";
      detail = entry.error ?? state ?? "LIMITED";
    }
    if (kind === "workflow") {
      label =
        WORKFLOWS.find((w) => w.id === entry.settings.workflowId)?.label ??
        "Workflow";
      icon = "workflow";
    }
    if (kind === "keycap") {
      label = entry.settings.label ?? "Keycap";
      icon = entry.settings.icon ?? "command";
    }
    if (kind === "command") {
      const command = this.command(entry);
      label = command?.dialLabel ?? command?.label ?? "Command";
      icon = command?.icon ?? "command";
      if (
        !entry.error &&
        !state &&
        observation.capabilities?.includes(command?.id ?? "")
      )
        detail = "READY";
      if (entry.action.isKey() && detail === "READY" && command) {
        await renderKey(
          entry.action,
          svgDataUrl(
            commandKeySvg(
              command.label,
              command.accent,
              command.icon,
              command.id === "plan"
                ? observation.permission === "Plan"
                  ? "ACTIVE"
                  : "OFF"
                : undefined,
            ),
          ),
        );
        return;
      }
    }
    if (entry.action.isDial())
      await renderFeedback(entry.action, {
        title: label.toUpperCase(),
        value: detail,
        indicator: entry.preview ? 50 : 0,
      });
    else if (entry.action.isKey())
      await renderKey(entry.action, svgDataUrl(keycapSvg(label, detail, icon)));
  }
}
