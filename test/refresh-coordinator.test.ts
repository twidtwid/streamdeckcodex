import { describe, expect, it, vi } from "vitest";
import { createRefreshCoordinator } from "../src/lib/refresh-coordinator.js";

describe("refresh coordinator", () => {
  it("never overlaps a slow refresh and coalesces ten ticks to one follow-up", async () => {
    let resolveFirst!: () => void;
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValue(undefined);
    let tick!: () => void;
    const coordinator = createRefreshCoordinator(
      refresh,
      1250,
      vi.fn(),
      ((callback: () => void) => {
        tick = callback;
        return { unref: () => undefined } as never;
      }) as unknown as typeof setInterval,
      vi.fn() as unknown as typeof clearInterval,
    );

    coordinator.start();
    tick();
    for (let index = 0; index < 10; index += 1) tick();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reports a rejection and runs again", async () => {
    const error = new Error("nope");
    const report = vi.fn();
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const coordinator = createRefreshCoordinator(refresh, 1250, report);

    await coordinator.runNow();
    await coordinator.runNow();
    expect(report).toHaveBeenCalledWith(error);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reports one repeated error until a successful recovery", async () => {
    const report = vi.fn();
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("private first detail"))
      .mockRejectedValueOnce(new Error("private second detail"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("private third detail"));
    const coordinator = createRefreshCoordinator(refresh, 1250, report);

    await coordinator.runNow();
    await coordinator.runNow();
    expect(report).toHaveBeenCalledTimes(1);
    await coordinator.runNow();
    await coordinator.runNow();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("stops later interval ticks", async () => {
    let tick!: () => void;
    const refresh = vi.fn(async () => undefined);
    const clear = vi.fn();
    const coordinator = createRefreshCoordinator(
      refresh,
      1250,
      vi.fn(),
      ((callback: () => void) => {
        tick = callback;
        return { unref: () => undefined } as never;
      }) as unknown as typeof setInterval,
      clear as unknown as typeof clearInterval,
    );

    coordinator.start();
    coordinator.stop();
    tick();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
