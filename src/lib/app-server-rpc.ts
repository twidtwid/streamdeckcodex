import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import {
  BoundedLineBuffer,
  BoundedTailBuffer,
  terminateAndReap,
} from "./bounded-process.js";

type JsonObject = Record<string, unknown>;

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: unknown;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface AppServerRpcOptions {
  executable: string;
  args?: string[];
  requestTimeoutMs?: number;
  maximumLineBytes?: number;
  maximumStderrBytes?: number;
  spawnProcess?: typeof spawn;
  spawnOptions?: SpawnOptions;
}

export class AppServerRpcClient {
  readonly #child: ChildProcess;
  readonly #stdout: BoundedLineBuffer;
  readonly #stderr: BoundedTailBuffer;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #requestTimeoutMs: number;
  #nextId = 1;
  #closed = false;
  #failure: Error | undefined;
  #termination: Promise<boolean> | undefined;

  constructor({
    executable,
    args = ["app-server", "--stdio"],
    requestTimeoutMs = 15_000,
    maximumLineBytes = 256 * 1024,
    maximumStderrBytes = 16 * 1024,
    spawnProcess = spawn,
    spawnOptions = {},
  }: AppServerRpcOptions) {
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#stdout = new BoundedLineBuffer(
      maximumLineBytes,
      "Codex app-server response",
    );
    this.#stderr = new BoundedTailBuffer(maximumStderrBytes);
    this.#child = spawnProcess(executable, args, {
      ...spawnOptions,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child.stdout?.setEncoding("utf8");
    this.#child.stderr?.setEncoding("utf8");
    this.#child.stdout?.on("data", (chunk: string) => this.#receive(chunk));
    this.#child.stderr?.on("data", (chunk: string) =>
      this.#stderr.append(chunk),
    );
    this.#child.stdin?.on("error", (error) => this.#abort(error));
    this.#child.once("error", (error) => this.#abort(error));
    this.#child.once("exit", (code, signal) => {
      if (this.#closed && this.#pending.size === 0) return;
      const detail = this.#stderr.text().trim();
      this.#abort(
        new Error(
          `Codex app server exited with ${code ?? signal ?? "unknown"}${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
  }

  call(
    method: string,
    params: JsonObject = {},
    timeoutMs = this.#requestTimeoutMs,
  ): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(
        this.#failure ?? new Error("Codex app server is closed"),
      );
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex app server timed out during ${method}`));
      }, timeoutMs);
      timeout.unref();
      this.#pending.set(id, { method, resolve, reject, timeout });
      this.#write({ id, method, params });
    });
  }

  notify(method: string, params: JsonObject = {}): void {
    if (this.#closed) throw new Error("Codex app server is closed");
    this.#write({ method, params });
  }

  async close(): Promise<void> {
    if (!this.#closed) this.#closed = true;
    const reaped = await this.#terminate();
    this.#failAll(new Error("Codex app server request ended"));
    if (!reaped) {
      throw new Error("Codex app server did not exit after SIGKILL");
    }
  }

  #write(message: unknown): void {
    try {
      this.#child.stdin?.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      this.#abort(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #receive(chunk: string): void {
    try {
      for (const line of this.#stdout.append(chunk)) this.#handleLine(line);
    } catch (error) {
      this.#abort(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #handleLine(line: string): void {
    if (!line.trim()) return;
    let response: RpcResponse;
    try {
      response = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (typeof response.id !== "number") return;
    const request = this.#pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timeout);
    this.#pending.delete(response.id);
    if (response.error !== undefined) {
      request.reject(
        new Error(
          `Codex app server rejected ${request.method}: ${JSON.stringify(response.error)}`,
        ),
      );
    } else {
      request.resolve(response.result);
    }
  }

  #abort(error: Error): void {
    if (!this.#failure) this.#failure = error;
    this.#closed = true;
    this.#failAll(this.#failure);
    void this.#terminate();
  }

  #failAll(error: Error): void {
    for (const request of this.#pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pending.clear();
  }

  #terminate(): Promise<boolean> {
    this.#termination ??= terminateAndReap(this.#child);
    return this.#termination;
  }
}
