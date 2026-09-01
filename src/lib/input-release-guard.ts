export type InputReleaseReason =
  | "user-release"
  | "action-disappear"
  | "restart"
  | "shutdown"
  | "startup"
  | "start-failed";

export type InputReleaseRecord = Readonly<{
  sequence: number;
  action: "push-to-talk";
  phase: "down" | "release";
  reason: InputReleaseReason;
  result: "held" | "released" | "fallback" | "not-held" | "failed";
}>;

export type InputReleaseResult = Readonly<{
  ok: boolean;
  released: boolean;
  record: InputReleaseRecord;
}>;

export class InputReleaseGuard {
  #held = false;
  #sequence = 0;
  #operation: Promise<void> = Promise.resolve();
  #lastRecord: InputReleaseRecord | undefined;

  markHeld(reason: InputReleaseReason = "restart"): InputReleaseRecord {
    this.#held = true;
    return this.#record("down", reason, "held");
  }

  release(
    reason: InputReleaseReason,
    release: () => Promise<void>,
    fallback: () => boolean,
  ): Promise<InputReleaseResult> {
    return this.#serialize(async () => {
      if (!this.#held) {
        return {
          ok: true,
          released: false,
          record: this.#record("release", reason, "not-held"),
        };
      }

      try {
        await release();
        this.#held = false;
        return {
          ok: true,
          released: true,
          record: this.#record("release", reason, "released"),
        };
      } catch {
        if (fallback()) {
          this.#held = false;
          return {
            ok: true,
            released: true,
            record: this.#record("release", reason, "fallback"),
          };
        }
        return {
          ok: false,
          released: false,
          record: this.#record("release", reason, "failed"),
        };
      }
    });
  }

  snapshot(): Readonly<{
    held: boolean;
    lastRecord?: InputReleaseRecord;
  }> {
    return this.#lastRecord
      ? { held: this.#held, lastRecord: this.#lastRecord }
      : { held: this.#held };
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#operation.then(operation, operation);
    this.#operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  #record(
    phase: InputReleaseRecord["phase"],
    reason: InputReleaseReason,
    result: InputReleaseRecord["result"],
  ): InputReleaseRecord {
    const record = Object.freeze({
      sequence: ++this.#sequence,
      action: "push-to-talk" as const,
      phase,
      reason,
      result,
    });
    this.#lastRecord = record;
    return record;
  }
}
