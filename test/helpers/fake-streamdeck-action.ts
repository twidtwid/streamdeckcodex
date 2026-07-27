export class FakeStreamDeckAction<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id = "fake-key";
  readonly coordinates = { column: 0, row: 0 };
  readonly calls: Array<{ method: string; value?: unknown }> = [];
  constructor(
    private settings: T,
    private readonly kind: "key" | "dial" = "key",
  ) {}
  currentSettings(): T {
    return this.settings;
  }
  isKey(): boolean {
    return this.kind === "key";
  }
  isDial(): boolean {
    return this.kind === "dial";
  }
  async getSettings<U = T>(): Promise<U> {
    this.calls.push({ method: "getSettings" });
    return this.settings as unknown as U;
  }
  async setSettings(value: T): Promise<void> {
    this.settings = value;
    this.calls.push({ method: "setSettings", value });
  }
  async setImage(value: string): Promise<void> {
    this.calls.push({ method: "setImage", value });
  }
  async setTitle(value: string): Promise<void> {
    this.calls.push({ method: "setTitle", value });
  }
  async setFeedback(value: unknown): Promise<void> {
    this.calls.push({ method: "setFeedback", value });
  }
  async showOk(): Promise<void> {
    this.calls.push({ method: "showOk" });
  }
  async showAlert(): Promise<void> {
    this.calls.push({ method: "showAlert" });
  }
}

export const keyEvent = <T extends Record<string, unknown>>(
  action: FakeStreamDeckAction<T>,
) => ({ action, payload: { settings: action.currentSettings() } });
export const keyDown = keyEvent;
export const keyUp = keyEvent;
export const willAppear = keyEvent;
