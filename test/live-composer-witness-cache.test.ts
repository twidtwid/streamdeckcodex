import { beforeEach, describe, expect, it, vi } from "vitest";
import { __liveComposerTest } from "../src/lib/codex-ui-control.js";

const threadId = "019f9a17-22f4-70f2-a6b9-e62daadb016e";

function response(witnessToken: string) {
  return {
    ok: true,
    action: "composer-read",
    pendingInput: false,
    draftEmpty: true,
    conversationId: threadId,
    rendererWindowId: "renderer-a",
    witnessToken,
    message: "fixture",
  };
}

describe("incremental live-composer witness reads", () => {
  beforeEach(() => __liveComposerTest.reset());

  it("passes the last verified witness into the next native read", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(response("witness-a"))
      .mockResolvedValueOnce(response("witness-b"));

    await __liveComposerTest.readWithInvoker(threadId, invoke as never);
    await __liveComposerTest.readWithInvoker(threadId, invoke as never);

    expect(invoke.mock.calls[0]?.[1]).toBeUndefined();
    expect(invoke.mock.calls[1]?.[1]).toBe("witness-a");
  });

  it("recaptures once when incremental continuity is lost", async () => {
    const mismatch = Object.assign(new Error("changed"), {
      reasonCode: "TARGET_MISMATCH",
    });
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(response("witness-a"))
      .mockRejectedValueOnce(mismatch)
      .mockResolvedValueOnce(response("witness-b"));

    await __liveComposerTest.readWithInvoker(threadId, invoke as never);
    await __liveComposerTest.readWithInvoker(threadId, invoke as never);

    expect(invoke.mock.calls[1]?.[1]).toBe("witness-a");
    expect(invoke.mock.calls[2]?.[1]).toBeUndefined();
  });
});
