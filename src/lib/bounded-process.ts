import type { ChildProcess } from "node:child_process";

export class ProcessOutputLimitError extends Error {}

export class BoundedLineBuffer {
  #pending = "";

  constructor(
    readonly maximumBytes: number,
    readonly label = "process output",
  ) {}

  append(chunk: string | Buffer): string[] {
    this.#pending += chunk.toString();
    const lines: string[] = [];
    for (;;) {
      const newline = this.#pending.indexOf("\n");
      if (newline < 0) {
        if (Buffer.byteLength(this.#pending, "utf8") > this.maximumBytes) {
          throw new ProcessOutputLimitError(
            `${this.label} exceeded ${this.maximumBytes} bytes without a complete line`,
          );
        }
        return lines;
      }
      const line = this.#pending.slice(0, newline);
      if (Buffer.byteLength(line, "utf8") > this.maximumBytes) {
        throw new ProcessOutputLimitError(
          `${this.label} exceeded ${this.maximumBytes} bytes for one line`,
        );
      }
      lines.push(line);
      this.#pending = this.#pending.slice(newline + 1);
    }
  }
}

export class BoundedTextBuffer {
  #value = "";

  constructor(
    readonly maximumBytes: number,
    readonly label = "process output",
  ) {}

  append(chunk: string | Buffer): void {
    const value = this.#value + chunk.toString();
    if (Buffer.byteLength(value, "utf8") > this.maximumBytes) {
      throw new ProcessOutputLimitError(
        `${this.label} exceeded ${this.maximumBytes} bytes`,
      );
    }
    this.#value = value;
  }

  text(): string {
    return this.#value;
  }
}

export class BoundedTailBuffer {
  #value = "";

  constructor(readonly maximumBytes: number) {}

  append(chunk: string | Buffer): void {
    const next = this.#value + chunk.toString();
    const bytes = Buffer.from(next, "utf8");
    this.#value =
      bytes.length <= this.maximumBytes
        ? next
        : bytes.subarray(bytes.length - this.maximumBytes).toString("utf8");
  }

  text(): string {
    return this.#value;
  }
}

export interface TerminationOptions {
  naturalExitMs?: number;
  termGraceMs?: number;
  killGraceMs?: number;
}

/** Ends stdin first, then escalates TERM to KILL and confirms process reap. */
export function terminateAndReap(
  child: ChildProcess,
  {
    naturalExitMs = 100,
    termGraceMs = 400,
    killGraceMs = 500,
  }: TerminationOptions = {},
): Promise<boolean> {
  if (typeof child.exitCode === "number" || child.signalCode != null) {
    return Promise.resolve(true);
  }
  child.stdin?.end();
  return new Promise((resolve) => {
    let settled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const finish = (reaped: boolean): void => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(reaped);
    };
    const onExit = (): void => finish(true);
    child.once("exit", onExit);
    if (typeof child.exitCode === "number" || child.signalCode != null) {
      finish(true);
      return;
    }
    const schedule = (callback: () => void, milliseconds: number): void => {
      const timer = setTimeout(callback, milliseconds);
      timer.unref();
      timers.push(timer);
    };
    schedule(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        if (typeof child.exitCode === "number" || child.signalCode != null) {
          finish(true);
        }
      }
    }, naturalExitMs);
    schedule(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        if (typeof child.exitCode === "number" || child.signalCode != null) {
          finish(true);
        }
      }
    }, naturalExitMs + termGraceMs);
    schedule(() => finish(false), naturalExitMs + termGraceMs + killGraceMs);
  });
}
