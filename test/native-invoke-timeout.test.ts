import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __nativeControlTest } from "../src/lib/codex-ui-control.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    spawnSync("trash", [directory]);
  }
});

class StubbornChild extends EventEmitter {
  readonly stdout = new EventEmitter() as EventEmitter & {
    setEncoding: (encoding: string) => void;
  };
  readonly stderr = new EventEmitter() as EventEmitter & {
    setEncoding: (encoding: string) => void;
  };
  readonly signals: string[] = [];

  constructor() {
    super();
    this.stdout.setEncoding = () => undefined;
    this.stderr.setEncoding = () => undefined;
  }

  kill(signal?: string): boolean {
    this.signals.push(signal ?? "SIGTERM");
    return true;
  }
}

describe("native control timeout lifecycle", () => {
  it("repairs an installed native helper that lost its executable bit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamdeck-native-mode-"));
    temporaryDirectories.push(directory);
    const executable = join(directory, "fixture.mjs");
    writeFileSync(
      executable,
      [
        "#!/usr/bin/env node",
        'process.stdout.write(JSON.stringify({ ok: true, action: "read", message: "ok" }));',
        "",
      ].join("\n"),
    );
    chmodSync(executable, 0o644);

    await expect(
      __nativeControlTest.invokeWithExecutable("read", executable, 1_000),
    ).resolves.toMatchObject({ ok: true, action: "read" });
    expect(statSync(executable).mode & 0o111).not.toBe(0);
  });

  it("rejects oversized native output before it can grow unbounded", async () => {
    const child = new StubbornChild();
    const spawnStubborn = (() => child) as unknown as typeof spawn;
    const operation = __nativeControlTest.invokeWithSpawn(
      "read",
      5_000,
      spawnStubborn,
    );
    child.stdout.emit("data", "x".repeat(256 * 1024 + 1));
    await expect(operation).rejects.toMatchObject({
      reasonCode: "UNAVAILABLE",
    });
    child.emit("exit", 1);
    child.emit("close", 1);
  });

  it("escalates a stubborn child to SIGKILL and rejects exactly once", async () => {
    const child = new StubbornChild();
    const spawnStubborn = (() => child) as unknown as typeof spawn;
    let rejections = 0;
    const operation = __nativeControlTest
      .invokeWithSpawn("read", 10, spawnStubborn)
      .catch((error: unknown) => {
        rejections += 1;
        throw error;
      });
    await expect(operation).rejects.toMatchObject({ reasonCode: "TIMEOUT" });
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(rejections).toBe(1);
    child.emit("exit", 0);
    child.emit("close", 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rejections).toBe(1);
  });
});
