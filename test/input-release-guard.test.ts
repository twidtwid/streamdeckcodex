import { describe, expect, it, vi } from "vitest";
import { InputReleaseGuard } from "../src/lib/input-release-guard.js";

describe("InputReleaseGuard", () => {
  it("pairs one held state with exactly one successful release", async () => {
    const guard = new InputReleaseGuard();
    const release = vi.fn(async () => {});
    guard.markHeld();

    expect((await guard.release("user-release", release, () => false)).ok).toBe(
      true,
    );
    expect(
      (await guard.release("action-disappear", release, () => false)).record
        .result,
    ).toBe("not-held");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("uses a synchronous fallback and remains idempotent", async () => {
    const guard = new InputReleaseGuard();
    const fallback = vi.fn(() => true);
    guard.markHeld();

    const result = await guard.release(
      "action-disappear",
      async () => {
        throw new Error("native failure");
      },
      fallback,
    );

    expect(result).toMatchObject({ ok: true, released: true });
    expect(result.record.result).toBe("fallback");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(guard.snapshot().held).toBe(false);
  });

  it("keeps the held flag when every release path fails", async () => {
    const guard = new InputReleaseGuard();
    guard.markHeld();

    const result = await guard.release(
      "shutdown",
      async () => {
        throw new Error("native failure");
      },
      () => false,
    );

    expect(result.ok).toBe(false);
    expect(guard.snapshot().held).toBe(true);
  });

  it("records privacy-safe provenance only", async () => {
    const guard = new InputReleaseGuard();
    guard.markHeld();
    await guard.release(
      "shutdown",
      async () => {},
      () => false,
    );
    const serialized = JSON.stringify(guard.snapshot());

    expect(serialized).toContain("push-to-talk");
    expect(serialized).not.toContain("thread");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("composer");
  });
});
