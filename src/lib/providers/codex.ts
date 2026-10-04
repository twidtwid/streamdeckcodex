import { SingletonAction } from "@elgato/streamdeck";
import { codexStore } from "../codex-store.js";

/** Preserve the mature Codex implementation behind an event adapter. */
export class CodexProvider {
  readonly id = "codex" as const;
  constructor(
    readonly action: SingletonAction<any>,
    include: (id: string) => boolean,
  ) {
    const getActions = Object.getOwnPropertyDescriptor(
      SingletonAction.prototype,
      "actions",
    )!.get!;
    Object.defineProperty(action, "actions", {
      get: () =>
        getActions
          .call(action)
          .filter((visible: { id: string }) => include(visible.id)),
    });
  }
  identity(): string {
    const thread = codexStore.focusedThread();
    const composer = codexStore.liveComposerState();
    return JSON.stringify([
      "codex",
      composer?.rendererWindowId ?? "",
      thread?.id ?? "",
    ]);
  }
  async event(name: string, event: any): Promise<void> {
    const handler = (this.action as any)[name];
    if (handler) await handler.call(this.action, event);
  }
  async refresh(): Promise<void> {
    await (this.action as any).refreshAll?.();
  }
}
