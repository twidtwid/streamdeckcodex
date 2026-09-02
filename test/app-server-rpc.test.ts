import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AppServerRpcClient } from "../src/lib/app-server-rpc.js";

const fixture = resolve("test", "fixtures", "fake-app-server.mjs");

function client(overrides = {}): AppServerRpcClient {
  return new AppServerRpcClient({
    executable: process.execPath,
    args: [fixture],
    requestTimeoutMs: 500,
    ...overrides,
  });
}

describe("bounded app-server RPC transport", () => {
  it("handles JSON-line requests and reaps the child on close", async () => {
    const rpc = client();
    await expect(rpc.call("initialize")).resolves.toEqual({
      method: "initialize",
    });
    rpc.notify("initialized");
    await expect(rpc.call("fixture/read")).resolves.toEqual({
      method: "fixture/read",
    });
    await expect(rpc.close()).resolves.toBeUndefined();
  });

  it("rejects and terminates a child that exceeds the line cap", async () => {
    const rpc = client({ maximumLineBytes: 64 });
    await expect(rpc.call("fixture/oversize")).rejects.toThrow(
      "exceeded 64 bytes",
    );
    await expect(rpc.close()).resolves.toBeUndefined();
  });

  it("bounds a hung request and still reaps the child", async () => {
    const rpc = client({ requestTimeoutMs: 20 });
    await expect(rpc.call("fixture/hang")).rejects.toThrow("timed out");
    await expect(rpc.close()).resolves.toBeUndefined();
  });
});
