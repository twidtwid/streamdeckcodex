import { describe, expect, it } from "vitest";
import { parseActiveDesktopThreadId } from "../src/lib/desktop-active.js";

describe("active Codex desktop task targeting", () => {
  it("uses the latest focused primary thread activity event", () => {
    const visible = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
    const background = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const log = [
      `thread_stream_view_activity_changed active=true conversationId=${background} rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=true conversationId=${visible} rendererWindowAppearance=primary rendererWindowFocused=true`,
      `background_task_changed conversationId=${background} rendererWindowAppearance=primary rendererWindowFocused=true`,
    ].join("\n");

    expect(parseActiveDesktopThreadId(log)).toBe(visible);
  });

  it("ignores secondary, unfocused, and inactive view events", () => {
    const valid = "019f9a17-22f4-70f2-a6b9-e62daadb016e";
    const ignored = "019f9a12-a287-72a2-bc79-d26a3e2b0cb5";
    const log = [
      `thread_stream_view_activity_changed active=true conversationId=${valid} rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=false conversationId=${ignored} rendererWindowAppearance=primary rendererWindowFocused=true`,
      `thread_stream_view_activity_changed active=true conversationId=${ignored} rendererWindowAppearance=primary rendererWindowFocused=false`,
      `thread_stream_view_activity_changed active=true conversationId=${ignored} rendererWindowAppearance=secondary rendererWindowFocused=true`,
    ].join("\n");

    expect(parseActiveDesktopThreadId(log)).toBe(valid);
  });
});
